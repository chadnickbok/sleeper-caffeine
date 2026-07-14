import type { z } from "zod/v4";
import { SleeperMcpError } from "../errors.js";

const DEFAULT_BASE_URL = "https://api.sleeper.app/v1";
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type SleeperClientOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export class SleeperClient {
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #random: () => number;

  constructor(options: SleeperClientOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#random = options.random ?? Math.random;
  }

  async get<T>(path: string, schema: z.ZodType<T>, query?: Record<string, string | number | undefined>): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new SleeperMcpError("INVALID_INPUT", "Sleeper API paths must be absolute relative paths.");
    }

    const url = new URL(`${DEFAULT_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const response = await this.#fetch(url, {
          headers: { Accept: "application/json" },
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          if (RETRYABLE_STATUS.has(response.status) && attempt < this.#maxRetries) {
            await this.#backoff(attempt, response);
            continue;
          }
          throw this.#httpError(response.status, path);
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch (error) {
          throw new SleeperMcpError(
            "INVALID_SLEEPER_RESPONSE",
            `Sleeper returned invalid JSON for ${path}.`,
            { cause: error },
          );
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          throw new SleeperMcpError(
            "INVALID_SLEEPER_RESPONSE",
            `Sleeper returned an unexpected response for ${path}.`,
            { details: { issues: parsed.error.issues.slice(0, 5) } },
          );
        }
        return parsed.data;
      } catch (error) {
        lastError = error;
        if (error instanceof SleeperMcpError) {
          throw error;
        }
        if (attempt < this.#maxRetries && this.#isTransientNetworkError(error)) {
          await this.#backoff(attempt);
          continue;
        }
        throw new SleeperMcpError("SLEEPER_UNAVAILABLE", `Sleeper request failed for ${path}.`, {
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new SleeperMcpError("SLEEPER_UNAVAILABLE", `Sleeper request failed for ${path}.`, {
      cause: lastError,
    });
  }

  #httpError(status: number, path: string): SleeperMcpError {
    if (status === 404) {
      return new SleeperMcpError("SLEEPER_NOT_FOUND", `Sleeper resource was not found for ${path}.`);
    }
    if (status === 429) {
      return new SleeperMcpError("SLEEPER_RATE_LIMITED", "Sleeper rate-limited the request.");
    }
    return new SleeperMcpError("SLEEPER_UNAVAILABLE", `Sleeper returned HTTP ${status} for ${path}.`, {
      details: { status },
    });
  }

  #isTransientNetworkError(error: unknown): boolean {
    return error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
  }

  async #backoff(attempt: number, response?: Response): Promise<void> {
    const retryAfter = response?.headers.get("retry-after");
    const retryAfterSeconds = retryAfter === null || retryAfter === undefined ? Number.NaN : Number(retryAfter);
    const base = Number.isFinite(retryAfterSeconds)
      ? Math.min(retryAfterSeconds * 1_000, 5_000)
      : Math.min(250 * 2 ** attempt, 2_000);
    const jitter = Math.floor(this.#random() * 100);
    await this.#sleep(base + jitter);
  }
}
