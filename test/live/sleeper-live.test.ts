import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTeamSnapshot } from "../../src/domain/team-snapshot.js";
import { PlayerCache } from "../../src/players/cache.js";
import { PlayerDirectory } from "../../src/players/directory.js";
import { SleeperApi } from "../../src/sleeper/endpoints.js";

const enabled =
  process.env["RUN_LIVE_TESTS"] === "1" &&
  process.env["SLEEPER_LIVE_LEAGUE_ID"] !== undefined &&
  process.env["SLEEPER_LIVE_USER"] !== undefined;

describe.skipIf(!enabled)("Sleeper live API", () => {
  it("loads a read-only team snapshot", async () => {
    const api = new SleeperApi();
    const cacheDir = await mkdtemp(join(tmpdir(), "sleeper-mcp-live-"));
    const players = new PlayerDirectory(new PlayerCache(api, { cacheDir }));
    const result = await getTeamSnapshot(
      { api, players },
      {
        league_id: process.env["SLEEPER_LIVE_LEAGUE_ID"] ?? "",
        username_or_user_id: process.env["SLEEPER_LIVE_USER"] ?? "",
      },
    );
    expect(result.data["league"]).toBeDefined();
    expect(result.data["team"]).toBeDefined();
    expect(result.cache?.players_fetched_at).toBeTruthy();
  }, 30_000);
});
