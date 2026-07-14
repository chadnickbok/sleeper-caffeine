import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";

type JsonObject = Record<string, unknown>;
type Pending = { resolve(value: unknown): void; reject(error: Error): void };

export class JsonlRpcClient extends EventEmitter {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    super();
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk: Buffer) =>
      this.emit("stderr", chunk.toString()),
    );
    child.once("exit", (code, signal) => {
      const error = new Error(
        `Codex app-server exited (${String(code ?? signal ?? "unknown")})`,
      );
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.emit("exit", error);
    });
  }

  request<T>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown = {}): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  respond(id: unknown, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  respondError(id: unknown, code: number, message: string): void {
    this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  close(): void {
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }

  private write(message: JsonObject): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      this.emit(
        "protocolError",
        new Error(`Invalid JSON from Codex app-server: ${line.slice(0, 160)}`),
      );
      return;
    }

    if (
      typeof message.id === "number" &&
      ("result" in message || "error" in message)
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error && typeof message.error === "object") {
        const rpcError = message.error as { message?: unknown };
        pending.reject(
          new Error(
            typeof rpcError.message === "string"
              ? rpcError.message
              : "Codex RPC failed",
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (typeof message.method === "string" && "id" in message) {
      this.emit("request", message);
      return;
    }
    if (typeof message.method === "string") this.emit("notification", message);
  }
}
