import { randomUUID } from "node:crypto";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DomainDependencies } from "@sleeper-caffeine/core";
import { createServer } from "../create-server.js";

export type LocalMcpStatus = {
  connectedSessions: number;
  endpoint: string;
  errorMessage: string | null;
  host: string;
  port: number;
  state: "stopped" | "running" | "error";
};

export type LocalMcpBridgeOptions = {
  dependencies: DomainDependencies;
  fallbackToRandomPort?: boolean;
  host?: string;
  port?: number;
};

type Session = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

export class LocalMcpBridge {
  private readonly dependencies: DomainDependencies;
  private readonly fallbackToRandomPort: boolean;
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly listeners = new Set<(status: LocalMcpStatus) => void>();
  private readonly sessions = new Map<string, Session>();
  private httpServer: ReturnType<typeof createHttpServer> | null = null;
  private boundPort: number | null = null;
  private errorMessage: string | null = null;

  constructor(options: LocalMcpBridgeOptions) {
    this.dependencies = options.dependencies;
    this.fallbackToRandomPort = options.fallbackToRandomPort ?? true;
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 9312;
  }

  subscribe(listener: (status: LocalMcpStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): LocalMcpStatus {
    const port = this.boundPort ?? this.requestedPort;
    return {
      connectedSessions: this.sessions.size,
      endpoint: `http://${this.host}:${port}/mcp`,
      errorMessage: this.errorMessage,
      host: this.host,
      port,
      state: this.errorMessage
        ? "error"
        : this.boundPort === null
          ? "stopped"
          : "running",
    };
  }

  async start(): Promise<LocalMcpStatus> {
    if (this.httpServer) return this.getStatus();

    this.errorMessage = null;
    const server = createHttpServer((request, response) => {
      void this.handleRequest(request, response).catch((error: unknown) => {
        if (!response.headersSent) {
          response.writeHead(500, { "content-type": "application/json" });
        }
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown MCP error",
          }),
        );
      });
    });
    this.httpServer = server;

    try {
      await this.listen(this.requestedPort);
    } catch (error) {
      const portInUse =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EADDRINUSE";
      if (!portInUse || !this.fallbackToRandomPort) {
        this.errorMessage =
          error instanceof Error
            ? error.message
            : "Unable to start local MCP server";
        this.httpServer = null;
        this.emit();
        throw error;
      }
      await this.listen(0);
    }

    this.emit();
    return this.getStatus();
  }

  async stop(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map(async ({ server, transport }) => {
        await server.close();
        await transport.close();
      }),
    );
    this.sessions.clear();

    const server = this.httpServer;
    this.httpServer = null;
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    this.boundPort = null;
    this.emit();
  }

  private async listen(port: number): Promise<void> {
    const server = this.httpServer;
    if (!server) throw new Error("MCP HTTP server is not initialized");
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("MCP server did not bind to a TCP port"));
          return;
        }
        this.boundPort = address.port;
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, this.host);
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.url === "/health") {
      this.sendJson(response, 200, this.getStatus());
      return;
    }
    if (!request.url?.startsWith("/mcp")) {
      this.sendJson(response, 404, { error: "Not found" });
      return;
    }
    if (request.method === "POST") {
      await this.handlePost(request, response, await this.readJson(request));
      return;
    }
    if (request.method === "GET" || request.method === "DELETE") {
      const session = this.findSession(request);
      if (!session) {
        this.sendJson(response, 400, {
          error: "Invalid or missing MCP session ID",
        });
        return;
      }
      await session.transport.handleRequest(request, response);
      return;
    }
    this.sendJson(response, 405, { error: "Method not allowed" });
  }

  private async handlePost(
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ): Promise<void> {
    const existing = this.findSession(request);
    if (existing) {
      await existing.transport.handleRequest(request, response, body);
      return;
    }
    if (!isInitializeRequest(body)) {
      this.sendJson(response, 400, {
        id: null,
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing valid MCP session",
        },
      });
      return;
    }

    const server = createServer(this.dependencies);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.sessions.set(sessionId, { server, transport });
        this.emit();
      },
    });
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) this.sessions.delete(sessionId);
      this.emit();
    };
    // The SDK's optional callback fields conflict under exactOptionalPropertyTypes,
    // even though this is its own supported server transport implementation.
    await server.connect(transport as Parameters<McpServer["connect"]>[0]);
    await transport.handleRequest(request, response, body);
  }

  private findSession(request: IncomingMessage): Session | undefined {
    const header = request.headers["mcp-session-id"];
    return typeof header === "string" ? this.sessions.get(header) : undefined;
  }

  private async readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      bytes += buffer.length;
      if (bytes > 2 * 1024 * 1024)
        throw new Error("MCP request body exceeds 2 MB");
      chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }

  private sendJson(
    response: ServerResponse,
    status: number,
    body: unknown,
  ): void {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }
}
