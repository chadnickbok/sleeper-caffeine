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

function dashboardWithDraft(capturedAt: string, boardHash: string): Dashboard {
  return {
    ...dashboardAt(capturedAt),
    draft: {
      draftId: "draft-1",
      status: "live",
      sourceStatus: "pre_draft",
      type: "linear",
      startTime: null,
      lastPicked: null,
      rounds: 3,
      teams: 12,
      totalPicks: 36,
      currentPickNo: 7,
      boardHash,
      picks: [],
      draftTeams: [],
      board: [],
      myUpcomingPickNumbers: [12, 36],
      candidatePoolMode: "rookies",
      candidates: [],
    },
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
        .prepare("UPDATE ai_reports SET generated_at = ? WHERE id = ?")
        .run("2026-07-14T00:00:00.000Z", report.id);
      database.close();

      store.saveDashboard(dashboardAt("2026-07-14T12:00:00.000Z"), {});
      expect(store.getReports("league-1")[0]?.invalidated).toBe(false);

      store.saveDashboard(dashboardAt("2026-07-14T12:00:00.001Z"), {});
      expect(store.getReports("league-1")[0]?.invalidated).toBe(true);

      store.saveDashboard(dashboardAt("2026-07-14T06:00:00.000Z"), {});
      expect(store.getReports("league-1")[0]?.invalidated).toBe(true);
    } finally {
      store.close();
    }
  });

  it("persists candidate pins without changing the dashboard snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-pins-"));
    const store = new LocalStore(join(directory, "pins.sqlite"));
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
      expect(store.getPinnedDraftCandidateIds("league-1")).toEqual(new Set());
      expect(store.toggleDraftCandidatePin("league-1", "player-42")).toBe(true);
      expect(store.getPinnedDraftCandidateIds("league-1")).toEqual(
        new Set(["player-42"]),
      );
      expect(store.toggleDraftCandidatePin("league-1", "player-42")).toBe(
        false,
      );
      expect(store.getPinnedDraftCandidateIds("league-1")).toEqual(new Set());
    } finally {
      store.close();
    }
  });

  it("invalidates only the draft report when the live board changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-board-"));
    const store = new LocalStore(join(directory, "board.sqlite"));
    const capturedAt = new Date().toISOString();
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
      store.saveDashboard(dashboardWithDraft(capturedAt, "board-a"), {});
      const draftReport = store.saveReport({
        leagueId: "league-1",
        kind: "draft_candidates",
        snapshotAt: capturedAt,
        payload,
      });
      const teamReport = store.saveReport({
        leagueId: "league-1",
        kind: "team_analysis",
        snapshotAt: capturedAt,
        payload,
      });

      store.saveDashboard(dashboardWithDraft(capturedAt, "board-b"), {});

      const reports = store.getReports("league-1");
      expect(
        reports.find((report) => report.id === draftReport.id)?.invalidated,
      ).toBe(true);
      expect(
        reports.find((report) => report.id === teamReport.id)?.invalidated,
      ).toBe(false);
    } finally {
      store.close();
    }
  });
});

describe("LocalStore chat history", () => {
  it("pages newest-first in stable chronological windows without overlap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-chat-"));
    const path = join(directory, "chat.sqlite");
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
      const database = new DatabaseSync(path);
      const insert = database.prepare(
        "INSERT INTO chat_messages (id, league_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      for (let index = 0; index < 120; index += 1) {
        const suffix = String(index).padStart(3, "0");
        insert.run(
          `message-${suffix}`,
          "league-1",
          index % 2 === 0 ? "user" : "assistant",
          `Message ${suffix}`,
          `2026-07-17T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
        );
      }
      database.close();

      const latest = store.listChatMessages("league-1");
      expect(latest.hasMore).toBe(true);
      expect(latest.messages).toHaveLength(50);
      expect(latest.messages[0]?.id).toBe("message-070");
      expect(latest.messages.at(-1)?.id).toBe("message-119");

      const latestCursor = latest.messages[0];
      expect(latestCursor).toBeDefined();
      const middle = store.listChatMessages("league-1", {
        before: latestCursor
          ? { createdAt: latestCursor.createdAt, id: latestCursor.id }
          : null,
      });
      expect(middle.hasMore).toBe(true);
      expect(middle.messages[0]?.id).toBe("message-020");
      expect(middle.messages.at(-1)?.id).toBe("message-069");

      const middleCursor = middle.messages[0];
      expect(middleCursor).toBeDefined();
      const oldest = store.listChatMessages("league-1", {
        before: middleCursor
          ? { createdAt: middleCursor.createdAt, id: middleCursor.id }
          : null,
      });
      expect(oldest.hasMore).toBe(false);
      expect(oldest.messages).toHaveLength(20);
      expect(oldest.messages[0]?.id).toBe("message-000");
      expect(oldest.messages.at(-1)?.id).toBe("message-019");

      const ids = [
        ...latest.messages,
        ...middle.messages,
        ...oldest.messages,
      ].map((message) => message.id);
      expect(new Set(ids).size).toBe(120);
    } finally {
      store.close();
    }
  });
});
