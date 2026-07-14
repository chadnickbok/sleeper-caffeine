export type SleeperErrorCode =
  | "INVALID_INPUT"
  | "INVALID_SLEEPER_RESPONSE"
  | "PLAYER_CACHE_UNAVAILABLE"
  | "SLEEPER_NOT_FOUND"
  | "SLEEPER_RATE_LIMITED"
  | "SLEEPER_UNAVAILABLE"
  | "TEAM_NOT_FOUND";

export class SleeperMcpError extends Error {
  readonly code: SleeperErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: SleeperErrorCode,
    message: string,
    options: { cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "SleeperMcpError";
    this.code = code;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export function normalizeError(error: unknown): SleeperMcpError {
  if (error instanceof SleeperMcpError) {
    return error;
  }
  return new SleeperMcpError(
    "SLEEPER_UNAVAILABLE",
    "Unexpected Sleeper MCP failure.",
    {
      cause: error,
    },
  );
}
