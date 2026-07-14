import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PlayerCache } from "../../src/players/cache.js";
import { SleeperClient, type FetchLike } from "../../src/sleeper/client.js";
import { SleeperApi } from "../../src/sleeper/endpoints.js";
import { fixture, jsonResponse } from "../helpers.js";

describe("PlayerCache", () => {
  it("shares one refresh between concurrent cold callers and persists it", async () => {
    const players = await fixture("players.json");
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(players));
    const api = new SleeperApi(new SleeperClient({ fetch, maxRetries: 0 }));
    const cacheDir = await mkdtemp(join(tmpdir(), "sleeper-cache-test-"));
    const cache = new PlayerCache(api, {
      cacheDir,
      now: () => new Date("2026-07-13T12:00:00.000Z"),
    });

    const [first, second] = await Promise.all([cache.get(), cache.get()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Object.keys(first.players)).toHaveLength(7);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    await expect(readFile(join(cacheDir, "players-nfl.json"), "utf8")).resolves.toContain("p4");
  });

  it("uses a valid stale cache when refresh fails", async () => {
    const players = await fixture("players.json");
    const cacheDir = await mkdtemp(join(tmpdir(), "sleeper-cache-test-"));
    await writeFile(
      join(cacheDir, "players-nfl.json"),
      JSON.stringify({
        schemaVersion: 1,
        fetchedAt: "2026-07-10T12:00:00.000Z",
        source: "https://api.sleeper.app/v1/players/nfl",
        players,
      }),
    );
    const api = new SleeperApi(
      new SleeperClient({ fetch: async () => jsonResponse({}, 503), maxRetries: 0 }),
    );
    const cache = new PlayerCache(api, {
      cacheDir,
      now: () => new Date("2026-07-13T12:00:00.000Z"),
    });

    await expect(cache.get()).resolves.toMatchObject({ stale: true, fetchedAt: "2026-07-10T12:00:00.000Z" });
  });

  it("fails clearly when both disk cache and refresh are unavailable", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "sleeper-cache-test-"));
    await writeFile(join(cacheDir, "players-nfl.json"), "not-json");
    const api = new SleeperApi(
      new SleeperClient({ fetch: async () => jsonResponse({}, 503), maxRetries: 0 }),
    );
    const cache = new PlayerCache(api, { cacheDir });

    await expect(cache.get()).rejects.toMatchObject({ code: "PLAYER_CACHE_UNAVAILABLE" });
  });
});
