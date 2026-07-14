import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Dashboard, ReportPayload } from "@sleeper-caffeine/ipc-contract";
import { describe, expect, it } from "vitest";
import { LocalStore } from "./store.js";

const payload: ReportPayload = {
  headline: "A complete report headline",
  summary: "A full report summary that is intentionally longer than card copy.",
  confidence: "high",
  cards: [],
  actions: [],
  sources: [],
  caveats: [],
};

function dashboardAt(capturedAt: string): Dashboard {
  return {
    league: {
      leagueId: "league-1",
      name: "Test League",
      season: "2026",
      rosterId: 1,
      userId: "user-1",
      teamName: "Test Team",
      avatar: null,
      lastRefreshedAt: capturedAt,
      isActive: true,
    },
    capturedAt,
    week: 1,
    leagueStatus: "pre_draft",
    scoringLabel: "PPR",
    rosterPositions: [],
    starters: [],
    bench: [],
    reserve: [],
    taxi: [],
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0 },
    pickInventory: null,
    warnings: [],
    draft: null,
    nextMatchup: null,
  };
}

describe("LocalStore report micro summaries", () => {
  it("migrates an existing report table and persists the summary beside its report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-store-"));
    const path = join(directory, "legacy.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE ai_reports (
        id TEXT PRIMARY KEY, league_id TEXT NOT NULL, kind TEXT NOT NULL,
        generated_at TEXT NOT NULL, snapshot_at TEXT NOT NULL,
        invalidated INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL
      );
    `);
    legacy.close();

    const store = new LocalStore(path);
    try {
      store.saveLeague({
        leagueId: "league-1",
        name: "Test League",
        season: "2026",
        team: {
          rosterId: 1,
          userId: "user-1",
          username: "tester",
          displayName: "Tester",
          teamName: "Test Team",
          avatar: null,
          record: "0-0",
        },
      });
      const report = store.saveReport({
        leagueId: "league-1",
        kind: "team_analysis",
        snapshotAt: "2026-07-14T12:00:00.000Z",
        payload,
      });
      expect(report.microSummary).toBeNull();

      store.saveMicroSummary(report, {
        headline: "Elite running backs anchor a fragile contender",
        summary:
          "The backfield creates a weekly edge, but receiver depth remains thin.",
        model: "gpt-5.6-terra",
        promptVersion: "1",
      });

      const [persisted] = store.getReports("league-1");
      expect(persisted?.microSummary).toEqual({
        headline: "Elite running backs anchor a fragile contender",
        summary:
          "The backfield creates a weekly edge, but receiver depth remains thin.",
        model: "gpt-5.6-terra",
        promptVersion: "1",
      });
      expect(persisted?.payload).toEqual(payload);
      expect(persisted?.microSummary).not.toHaveProperty("generatedAt");
    } finally {
      store.close();
    }
  });

  it("only invalidates reports more than twelve hours old", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-stale-"));
    const path = join(directory, "stale.sqlite");
    const store = new LocalStore(path);
    try {
      store.saveLeague({
        leagueId: "league-1",
        name: "Test League",
        season: "2026",
        team: {
          rosterId: 1,
          userId: "user-1",
          username: "tester",
          displayName: "Tester",
          teamName: "Test Team",
          avatar: null,
          record: "0-0",
        },
      });
      const report = store.saveReport({
        leagueId: "league-1",
        kind: "team_analysis",
        snapshotAt: "2026-07-14T00:00:00.000Z",
        payload,
      });
      const database = new DatabaseSync(path);
      database
        .prepare(
          "UPDATE ai_reports SET generated_at = ?, invalidated = 1 WHERE id = ?",
        )
        .run("2026-07-14T00:00:00.000Z", report.id);
      database.close();

      store.saveDashboard(dashboardAt("2026-07-14T12:00:00.000Z"), {});
      expect(store.getReports("league-1")[0]?.invalidated).toBe(false);

      store.saveDashboard(dashboardAt("2026-07-14T12:00:00.001Z"), {});
      expect(store.getReports("league-1")[0]?.invalidated).toBe(true);
    } finally {
      store.close();
    }
  });
});
