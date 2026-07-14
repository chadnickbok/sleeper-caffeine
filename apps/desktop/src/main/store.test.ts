import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReportPayload } from "@sleeper-caffeine/ipc-contract";
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
});
