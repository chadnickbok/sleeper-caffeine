import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppRuntime } from "./runtime.js";

const live = process.env.RUN_LIVE_TESTS === "1" ? describe : describe.skip;

live("desktop Sleeper sync", () => {
  it("onboards the known league and materializes its selected roster", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-live-"));
    const runtime = new AppRuntime(directory);
    try {
      const preview = await runtime.previewLeague(
        "https://sleeper.com/leagues/289646328504385536/",
      );
      const team = preview.teams.find((candidate) =>
        candidate.teamName.toLowerCase().includes("kamara"),
      );
      expect(team).toBeDefined();

      const result = await runtime.saveLeague({
        leagueId: preview.leagueId,
        rosterId: team!.rosterId,
        userId: team!.userId,
      });

      expect(result.activeDashboard?.league.teamName.toLowerCase()).toContain(
        "kamara",
      );
      expect(result.activeDashboard?.starters.length).toBeGreaterThan(0);
      expect(result.activeDashboard?.bench.length).toBeGreaterThan(0);
    } finally {
      await runtime.stop();
    }
  }, 30_000);
});
