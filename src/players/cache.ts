import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SleeperMcpError } from "../errors.js";
import type { SleeperApi } from "../sleeper/endpoints.js";
import type { SleeperPlayer } from "../sleeper/types.js";
import { PLAYER_CACHE_SOURCE, PlayerCacheFileSchema, type PlayerCacheFile } from "./schemas.js";

export const DEFAULT_PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type PlayerCacheSnapshot = {
  fetchedAt: string;
  stale: boolean;
  players: Record<string, SleeperPlayer>;
};

export type PlayerCacheOptions = {
  cacheDir: string;
  maxAgeMs?: number;
  now?: () => Date;
};

export class PlayerCache {
  readonly #api: SleeperApi;
  readonly #cacheDir: string;
  readonly #cachePath: string;
  readonly #maxAgeMs: number;
  readonly #now: () => Date;
  #memory: PlayerCacheFile | undefined;
  #refreshPromise: Promise<PlayerCacheSnapshot> | undefined;

  constructor(api: SleeperApi, options: PlayerCacheOptions) {
    this.#api = api;
    this.#cacheDir = options.cacheDir;
    this.#cachePath = join(options.cacheDir, "players-nfl.json");
    this.#maxAgeMs = options.maxAgeMs ?? DEFAULT_PLAYER_CACHE_MAX_AGE_MS;
    this.#now = options.now ?? (() => new Date());
  }

  async get(): Promise<PlayerCacheSnapshot> {
    const cached = this.#memory ?? (await this.#readDisk());
    if (cached !== undefined) {
      this.#memory = cached;
      if (!this.#isStale(cached)) {
        return this.#snapshot(cached, false);
      }
    }
    return this.#refreshSingleFlight(cached);
  }

  async refresh(): Promise<PlayerCacheSnapshot> {
    const cached = this.#memory ?? (await this.#readDisk());
    if (cached !== undefined) {
      this.#memory = cached;
    }
    return this.#refreshSingleFlight(cached);
  }

  #refreshSingleFlight(staleCache: PlayerCacheFile | undefined): Promise<PlayerCacheSnapshot> {
    if (this.#refreshPromise !== undefined) {
      return this.#refreshPromise;
    }
    this.#refreshPromise = this.#refresh(staleCache).finally(() => {
      this.#refreshPromise = undefined;
    });
    return this.#refreshPromise;
  }

  async #refresh(staleCache: PlayerCacheFile | undefined): Promise<PlayerCacheSnapshot> {
    try {
      const players = await this.#api.getPlayers();
      if (Object.keys(players).length === 0) {
        throw new SleeperMcpError(
          "INVALID_SLEEPER_RESPONSE",
          "Sleeper returned an empty NFL player directory.",
        );
      }

      const record = PlayerCacheFileSchema.parse({
        schemaVersion: 1,
        fetchedAt: this.#now().toISOString(),
        source: PLAYER_CACHE_SOURCE,
        players,
      });
      await this.#writeAtomically(record);
      this.#memory = record;
      return this.#snapshot(record, false);
    } catch (error) {
      if (staleCache !== undefined) {
        this.#memory = staleCache;
        return this.#snapshot(staleCache, true);
      }
      throw new SleeperMcpError(
        "PLAYER_CACHE_UNAVAILABLE",
        "The NFL player directory could not be loaded and no valid cache exists.",
        { cause: error },
      );
    }
  }

  async #readDisk(): Promise<PlayerCacheFile | undefined> {
    try {
      const contents = await readFile(this.#cachePath, "utf8");
      const parsedJson: unknown = JSON.parse(contents);
      const parsed = PlayerCacheFileSchema.safeParse(parsedJson);
      return parsed.success && Object.keys(parsed.data.players).length > 0 ? parsed.data : undefined;
    } catch (error) {
      if (this.#isMissingFile(error) || error instanceof SyntaxError) {
        return undefined;
      }
      return undefined;
    }
  }

  async #writeAtomically(cache: PlayerCacheFile): Promise<void> {
    await mkdir(this.#cacheDir, { recursive: true });
    const tempPath = `${this.#cachePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(cache), { encoding: "utf8", mode: 0o600 });
      await rename(tempPath, this.#cachePath);
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  #snapshot(cache: PlayerCacheFile, stale: boolean): PlayerCacheSnapshot {
    return { fetchedAt: cache.fetchedAt, stale, players: cache.players };
  }

  #isStale(cache: PlayerCacheFile): boolean {
    return this.#now().getTime() - Date.parse(cache.fetchedAt) >= this.#maxAgeMs;
  }

  #isMissingFile(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}
