import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { CodexStatus } from "@sleeper-caffeine/ipc-contract";
import { findCodexBinary, readCodexVersion } from "./discovery.js";
import { JsonlRpcClient } from "./jsonl-client.js";

type JsonObject = Record<string, unknown>;

export type CodexSupervisorOptions = {
  codexHome: string;
  cwd: string;
  mcpUrl: string;
  binaryPath?: string | null;
};

export type RunTurnInput = {
  threadId?: string | null;
  prompt: string;
  outputSchema?: JsonObject;
  onDelta?: (delta: string) => void;
};

export type RunTurnResult = { threadId: string; turnId: string; text: string };

export class CodexSupervisor {
  private client: JsonlRpcClient | null = null;
  private readonly listeners = new Set<(status: CodexStatus) => void>();
  private status: CodexStatus = {
    state: "starting",
    binaryPath: null,
    version: null,
    email: null,
    planType: null,
    errorMessage: null,
  };

  constructor(private readonly options: CodexSupervisorOptions) {}

  subscribe(listener: (status: CodexStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): CodexStatus {
    return this.status;
  }

  async start(): Promise<CodexStatus> {
    if (this.client) return this.status;
    const binaryPath = this.options.binaryPath ?? (await findCodexBinary());
    if (!binaryPath) {
      this.setStatus({
        state: "unavailable",
        binaryPath: null,
        errorMessage:
          "Install Codex CLI or the ChatGPT app to enable AI analysis.",
      });
      return this.status;
    }

    await mkdir(this.options.codexHome, { recursive: true });
    let version: string | null = null;
    try {
      version = await readCodexVersion(binaryPath);
    } catch {
      // A valid binary can still run when its version flag is unavailable.
    }
    this.setStatus({
      state: "starting",
      binaryPath,
      version,
      errorMessage: null,
    });

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      CODEX_HOME: this.options.codexHome,
    };
    delete environment.OPENAI_API_KEY;
    delete environment.CODEX_API_KEY;
    delete environment.CODEX_ACCESS_TOKEN;
    const args = [
      "app-server",
      "--listen",
      "stdio://",
      "--strict-config",
      "--disable",
      "shell_tool",
      "-c",
      'web_search="live"',
      "-c",
      `mcp_servers.sleeper_caffeine.url=${JSON.stringify(this.options.mcpUrl)}`,
      "-c",
      "mcp_servers.sleeper_caffeine.required=true",
    ];
    const child = spawn(binaryPath, args, {
      cwd: this.options.cwd,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new JsonlRpcClient(child);
    this.client = client;
    client.on("notification", (message: JsonObject) =>
      this.handleNotification(message),
    );
    client.on("request", (message: JsonObject) =>
      this.handleServerRequest(message),
    );
    client.on("exit", (error: Error) => {
      this.client = null;
      this.setStatus({ state: "error", errorMessage: error.message });
    });
    client.on("protocolError", (error: Error) =>
      this.setStatus({ state: "error", errorMessage: error.message }),
    );

    try {
      await client.request("initialize", {
        clientInfo: {
          name: "sleeper_caffeine",
          title: "Sleeper Caffeine",
          version: "0.1.0",
        },
        capabilities: { experimentalApi: true, requestAttestation: false },
      });
      client.notify("initialized");
      await this.refreshAccount();
    } catch (error) {
      this.setStatus({
        state: "error",
        errorMessage:
          error instanceof Error ? error.message : "Codex failed to initialize",
      });
    }
    return this.status;
  }

  async login(): Promise<string> {
    const client = this.requireClient();
    this.setStatus({ state: "authenticating", errorMessage: null });
    const response = await client.request<{ type: string; authUrl?: string }>(
      "account/login/start",
      {
        type: "chatgpt",
        useHostedLoginSuccessPage: true,
        appBrand: "chatgpt",
      },
    );
    if (response.type !== "chatgpt" || !response.authUrl)
      throw new Error("Codex did not return a ChatGPT login URL");
    return response.authUrl;
  }

  async logout(): Promise<void> {
    await this.requireClient().request("account/logout");
    await this.refreshAccount();
  }

  async runTurn(input: RunTurnInput): Promise<RunTurnResult> {
    const client = this.requireClient();
    if (this.status.state !== "ready")
      throw new Error("Sign in with ChatGPT before generating analysis");
    this.setStatus({ state: "running", errorMessage: null });

    let threadId = input.threadId ?? null;
    try {
      if (threadId) {
        try {
          const resumed = await client.request<{ thread: { id: string } }>(
            "thread/resume",
            {
              threadId,
              cwd: this.options.cwd,
              approvalPolicy: "never",
              sandbox: "read-only",
              baseInstructions: BASE_INSTRUCTIONS,
              developerInstructions: DEVELOPER_INSTRUCTIONS,
            },
          );
          threadId = resumed.thread.id;
        } catch {
          // The app database can outlive a manually removed Codex home. Start a
          // replacement thread instead of making the saved reference fatal.
          threadId = null;
        }
      }
      if (!threadId) {
        const started = await client.request<{ thread: { id: string } }>(
          "thread/start",
          {
            cwd: this.options.cwd,
            approvalPolicy: "never",
            sandbox: "read-only",
            ephemeral: false,
            baseInstructions: BASE_INSTRUCTIONS,
            developerInstructions: DEVELOPER_INSTRUCTIONS,
          },
        );
        threadId = started.thread.id;
      }
    } catch (error) {
      const threadError =
        error instanceof Error
          ? error
          : new Error("Unable to prepare a Codex thread");
      this.setStatus({ state: "ready", errorMessage: threadError.message });
      throw threadError;
    }

    return new Promise<RunTurnResult>((resolve, reject) => {
      let turnId: string | null = null;
      let text = "";
      const onNotification = (message: JsonObject) => {
        const params = (message.params ?? {}) as JsonObject;
        if (params.threadId !== threadId) return;
        if (
          message.method === "item/agentMessage/delta" &&
          (!turnId || params.turnId === turnId)
        ) {
          const delta = typeof params.delta === "string" ? params.delta : "";
          text += delta;
          input.onDelta?.(delta);
        }
        if (
          message.method === "turn/completed" &&
          (!turnId || (params.turn as JsonObject | undefined)?.id === turnId)
        ) {
          cleanup();
          const turn = params.turn as JsonObject | undefined;
          const status = turn?.status;
          if (status !== "completed") {
            const turnError = turn?.error as JsonObject | undefined;
            const message =
              typeof turnError?.message === "string"
                ? turnError.message
                : status === "interrupted"
                  ? "Codex turn was interrupted"
                  : "Codex turn failed";
            this.setStatus({ state: "ready", errorMessage: message });
            reject(new Error(message));
          } else {
            this.setStatus({ state: "ready", errorMessage: null });
            const completedTurnId =
              typeof turn?.id === "string" ? turn.id : (turnId ?? "");
            resolve({
              threadId,
              turnId: completedTurnId,
              text: selectFinalAgentMessage(turn?.items, text),
            });
          }
        }
      };
      const cleanup = () => client.off("notification", onNotification);
      client.on("notification", onNotification);
      client
        .request<{ turn: { id: string } }>("turn/start", {
          threadId,
          input: [{ type: "text", text: input.prompt, text_elements: [] }],
          approvalPolicy: "never",
          sandboxPolicy: { type: "readOnly", networkAccess: true },
          outputSchema: input.outputSchema ?? null,
        })
        .then((response) => {
          turnId = response.turn.id;
        })
        .catch((error: unknown) => {
          cleanup();
          const turnError =
            error instanceof Error ? error : new Error("Codex turn failed");
          this.setStatus({ state: "ready", errorMessage: turnError.message });
          reject(turnError);
        });
    });
  }

  stop(): void {
    this.client?.close();
    this.client = null;
  }

  private async refreshAccount(): Promise<void> {
    const response = await this.requireClient().request<{
      account: null | {
        type: string;
        email?: string | null;
        planType?: string | null;
      };
    }>("account/read", { refreshToken: false });
    if (response.account?.type === "chatgpt") {
      this.setStatus({
        state: "ready",
        email: response.account.email ?? null,
        planType: response.account.planType ?? null,
        errorMessage: null,
      });
    } else {
      this.setStatus({
        state: "signed_out",
        email: null,
        planType: null,
        errorMessage: null,
      });
    }
  }

  private handleNotification(message: JsonObject): void {
    if (message.method === "account/login/completed") {
      const params = message.params as {
        success?: boolean;
        error?: string | null;
      };
      if (params.success) void this.refreshAccount();
      else
        this.setStatus({
          state: "signed_out",
          errorMessage: params.error ?? "ChatGPT login failed",
        });
    }
    if (message.method === "account/updated") void this.refreshAccount();
  }

  private handleServerRequest(message: JsonObject): void {
    const client = this.client;
    if (!client) return;
    if (
      message.method === "item/commandExecution/requestApproval" ||
      message.method === "item/fileChange/requestApproval"
    ) {
      client.respond(message.id, { decision: "decline" });
      return;
    }
    if (message.method === "item/tool/requestUserInput") {
      client.respond(message.id, { answers: {} });
      return;
    }
    if (message.method === "mcpServer/elicitation/request") {
      client.respond(message.id, {
        action: "decline",
        content: null,
        _meta: null,
      });
      return;
    }
    client.respondError(
      message.id,
      -32601,
      "Sleeper Caffeine does not support this server request",
    );
  }

  private requireClient(): JsonlRpcClient {
    if (!this.client) throw new Error("Codex app-server is not running");
    return this.client;
  }

  private setStatus(update: Partial<CodexStatus>): void {
    this.status = { ...this.status, ...update };
    for (const listener of this.listeners) listener(this.status);
  }
}

const BASE_INSTRUCTIONS = `You are Sleeper Caffeine, a rigorous fantasy-football analyst. This app is completely read-only. Never claim to change a lineup, submit a waiver, propose a trade, or perform any action in Sleeper.`;

const DEVELOPER_INSTRUCTIONS = `Always call the sleeper_caffeine MCP before making league-specific claims. Treat its data as the source of truth for league settings, rosters, picks, and transactions. Use live web search for current player news, injuries, depth charts, roles, schedules, and analysis. Clearly distinguish a live search result from a cited source. Prefer FantasyPros, ESPN, CBS Sports, FOX Sports, official NFL/team sources, and The Athletic when available. Never invent a source or URL. Mention uncertainty and data freshness. Do not run shell commands, edit files, or ask for filesystem access.`;

export function selectFinalAgentMessage(
  items: unknown,
  fallback: string,
): string {
  if (!Array.isArray(items)) return fallback;
  const itemList = items as unknown[];
  for (let index = itemList.length - 1; index >= 0; index -= 1) {
    const item = itemList[index];
    if (typeof item !== "object" || item === null) continue;
    const record = item as JsonObject;
    if (record.type === "agentMessage" && typeof record.text === "string")
      return record.text;
  }
  return fallback;
}
