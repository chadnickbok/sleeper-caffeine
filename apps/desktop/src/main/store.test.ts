import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Dashboard,
  EvidenceClaim,
  ReportPayload,
  TuesdayPlanOutput,
  WeeklyAction,
  WeeklyPhaseBrief,
  WeeklyPlan,
  WatchlistEntry,
} from "@sleeper-caffeine/ipc-contract";
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

const tuesdayOutput: TuesdayPlanOutput = {
  headline: "Turn the last roster spot into weekly upside",
  summary:
    "Prioritize the clearest role gain while keeping a cheaper fallback.",
  confidence: "medium",
  competitiveLane: {
    lane: "contender",
    confidence: "medium",
    reasons: ["Top-three scoring profile"],
    contraryEvidence: ["Thin receiver depth"],
  },
  actions: [
    {
      actionKey: "claim-player-2",
      kind: "waiver_claim",
      title: "Claim Player Two",
      description: "Use the final bench spot on a growing role.",
      priority: "now",
      playerIds: ["player-2", "player-1"],
      rosterIds: [],
      confidence: "medium",
      keyUncertainty: "Sunday usage may not persist.",
      sourceIds: ["evidence-1"],
    },
  ],
  waiverClaims: [
    {
      priority: 1,
      addPlayerId: "player-2",
      dropPlayerId: "player-1",
      contingencyGroup: "bench-upside",
      faabPercentMin: 4,
      faabPercentTarget: 7,
      faabPercentMax: 10,
      rationale: "The role is worth a measured bid.",
      confidence: "medium",
      sourceIds: ["evidence-1"],
    },
  ],
  addNow: [
    {
      playerId: "player-2",
      headline: "Role is expanding",
      rationale: "Routes and targets increased.",
      confidence: "medium",
      sourceIds: ["evidence-1"],
    },
  ],
  watch: [],
  exit: [
    {
      playerId: "player-1",
      headline: "No clear path to a useful role",
      rationale: "The roster spot has better uses.",
      confidence: "high",
      sourceIds: [],
      dropRank: 1,
      rosterPurposes: [],
    },
  ],
  rosterAudit: [
    {
      playerId: "player-1",
      purposes: [],
      rationale: "Not starting, insuring, appreciating, or one event away.",
      confidence: "high",
    },
  ],
  marketObservation: {
    headline: "Test the receiver market",
    recommendation: "Ask the rebuilding roster about a veteran receiver.",
    partnerRosterIds: [2],
    alternatives: ["Hold through Thursday"],
    rationale: "Your running-back depth can support a two-for-one.",
    sourceIds: [],
  },
  alternatives: [],
  sources: [
    {
      evidenceId: "evidence-1",
      title: "Official team notes",
      url: "https://example.com/notes",
      claim: "Player Two handled the expanded route role.",
      sourceType: "web",
      fetchedAt: "2026-09-15T16:00:00.000Z",
    },
  ],
  uncertainties: ["The usage sample is one game."],
  refreshTriggers: ["A practice-status change"],
};

function weeklyPlan(id: string, version: number): WeeklyPlan {
  return {
    id,
    leagueId: "league-1",
    season: "2026",
    week: 2,
    version,
    sourceSnapshotId: `snapshot-${version}`,
    inputHash: `input-${version}`,
    evidenceHash: `evidence-${version}`,
    generatedAt: `2026-09-15T1${version}:00:00.000Z`,
    researchFreshThrough: "2026-09-18T12:00:00.000Z",
    model: "gpt-test",
    reasoningEffort: "high",
    promptVersion: "1",
    schemaVersion: "1",
    status: "current",
    statusReason: null,
    output: tuesdayOutput,
    players: [
      {
        playerId: "player-1",
        name: "Player One",
        position: "WR",
        nflTeam: "SEA",
        injuryStatus: null,
        status: "Active",
      },
      {
        playerId: "player-2",
        name: "Player Two",
        position: "WR",
        nflTeam: "LAR",
        injuryStatus: null,
        status: "Active",
      },
    ],
    rosters: [{ rosterId: 2, teamName: "Trade Partner", avatar: null }],
    microSummary: null,
  };
}

function weeklyAction(id: string, planId: string): WeeklyAction {
  return {
    id,
    planId,
    leagueId: "league-1",
    season: "2026",
    week: 2,
    actionKey: "claim-player-2",
    kind: "waiver_claim",
    status: "pending",
    title: "Claim Player Two",
    description: "Bid seven percent and drop Player One.",
    priority: "now",
    playerIds: ["player-2", "player-1"],
    rosterIds: [],
    dispositionNote: null,
    observedEventId: null,
    createdAt: "2026-09-15T11:00:00.000Z",
    updatedAt: "2026-09-15T11:00:00.000Z",
    resolvedAt: null,
  };
}

function saveTestLeague(store: LocalStore): void {
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
}

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

describe("LocalStore weekly plan persistence", () => {
  it("runs ordered migrations without losing legacy data", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-migrate-"),
    );
    const path = join(directory, "legacy.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE leagues (
        league_id TEXT PRIMARY KEY, name TEXT NOT NULL, season TEXT NOT NULL,
        roster_id INTEGER NOT NULL, user_id TEXT NOT NULL, team_name TEXT NOT NULL,
        avatar TEXT, last_refreshed_at TEXT, snapshot_json TEXT,
        is_active INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO leagues (
        league_id, name, season, roster_id, user_id, team_name, is_active
      ) VALUES ('legacy-league', 'Legacy League', '2025', 7, 'legacy-user', 'Legacy Team', 1);
      PRAGMA user_version = 1;
    `);
    legacy.close();

    const store = new LocalStore(path);
    try {
      expect(store.getActiveLeague()?.leagueId).toBe("legacy-league");
      const database = new DatabaseSync(path);
      expect(
        (
          database.prepare("PRAGMA user_version").get() as {
            user_version: number;
          }
        ).user_version,
      ).toBe(3);
      const weeklyTable = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'league_weeks'",
        )
        .get();
      const phaseBriefTable = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'weekly_phase_briefs'",
        )
        .get();
      database.close();
      expect(weeklyTable).toBeDefined();
      expect(phaseBriefTable).toBeDefined();
    } finally {
      store.close();
    }
  });

  it("persists a frozen weekly context independently from AI generation", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-context-"),
    );
    const store = new LocalStore(join(directory, "context.sqlite"));
    try {
      saveTestLeague(store);
      const saved = store.saveWeeklyContext({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        phase: "tuesday",
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: { addCandidates: ["player-2"], faabRemaining: 87 },
        meaningfulChanges: [
          {
            id: "change-1",
            kind: "roster",
            headline: "A roster spot opened",
            description: "Player One was dropped.",
            entityType: "player",
            entityId: "player-1",
            occurredAt: "2026-09-15T09:00:00.000Z",
            detectedAt: "2026-09-15T10:00:00.000Z",
            material: true,
            sourceEventId: null,
          },
        ],
      });
      expect(saved.planStatus).toBe("not_built");
      expect(saved.meaningfulChanges).toHaveLength(1);
      expect(store.getWeeklyContext(saved)).toEqual({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: { addCandidates: ["player-2"], faabRemaining: 87 },
      });
    } finally {
      store.close();
    }
  });

  it("keeps immutable plan versions while superseding only unresolved actions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-plan-"));
    const store = new LocalStore(join(directory, "plan.sqlite"));
    try {
      saveTestLeague(store);
      store.saveWeeklyContext({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        phase: "tuesday",
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: { candidates: ["player-2"] },
      });

      const first = weeklyPlan("plan-1", 1);
      const firstAction = weeklyAction("action-1", first.id);
      const firstBundle = store.saveWeeklyPlan(first, [firstAction]);
      expect(firstBundle.leagueWeek.currentPlanId).toBe("plan-1");
      expect(firstBundle.leagueWeek.actionSummary.pending).toBe(1);

      const dismissed = store.updateWeeklyAction(
        "action-1",
        "dismissed",
        "Too much FAAB for a one-week sample.",
      );
      expect(dismissed.status).toBe("dismissed");
      expect(dismissed.resolvedAt).not.toBeNull();

      const second = weeklyPlan("plan-2", 2);
      const secondAction = {
        ...weeklyAction("action-2", second.id),
        actionKey: "watch-player-2",
        kind: "watch" as const,
      };
      store.saveWeeklyPlan(second, [secondAction]);

      const versions = store.listWeeklyPlans({
        leagueId: "league-1",
        season: "2026",
        week: 2,
      });
      expect(versions.map((plan) => plan.id)).toEqual(["plan-2", "plan-1"]);
      expect(versions[1]?.status).toBe("superseded");
      expect(store.getWeeklyAction("action-1")?.status).toBe("dismissed");
      expect(store.getWeeklyAction("action-2")?.status).toBe("pending");

      expect(() => store.saveWeeklyPlan(weeklyPlan("plan-skipped", 4))).toThrow(
        /not the next version/,
      );
    } finally {
      store.close();
    }
  });

  it("keeps repeated model-local evidence IDs isolated by plan and league", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-evidence-scope-"),
    );
    const store = new LocalStore(join(directory, "evidence-scope.sqlite"));
    const evidence = (leagueId: string, claim: string): EvidenceClaim => ({
      id: "evidence-1",
      leagueId,
      playerId: "player-2",
      category: "usage",
      claim,
      metricName: "route_share",
      metricValue: 0.72,
      sourceTitle: "Usage report",
      sourceUrl: "https://example.com/usage",
      sourceType: "web",
      fetchedAt: "2026-09-15T10:00:00.000Z",
      effectiveWeek: 2,
      expiresAt: "2026-09-19T10:00:00.000Z",
    });
    try {
      saveTestLeague(store);
      store.saveWeeklyPlan(
        weeklyPlan("plan-1", 1),
        [],
        [evidence("league-1", "First plan evidence")],
      );
      store.saveWeeklyPlan(
        weeklyPlan("plan-2", 2),
        [],
        [evidence("league-1", "Second plan evidence")],
      );

      const firstLeagueEvidence = store.listEvidenceClaims({
        leagueId: "league-1",
      });
      expect(firstLeagueEvidence).toHaveLength(2);
      expect(firstLeagueEvidence.map((claim) => claim.id)).toEqual(
        expect.arrayContaining([
          "weekly-evidence:v1:league-1:plan:plan-1:evidence-1",
          "weekly-evidence:v1:league-1:plan:plan-2:evidence-1",
        ]),
      );
      expect(firstLeagueEvidence.map((claim) => claim.claim)).toEqual(
        expect.arrayContaining(["First plan evidence", "Second plan evidence"]),
      );
      expect(store.getWeeklyPlan("plan-1")?.output.sources[0]?.evidenceId).toBe(
        "evidence-1",
      );

      store.saveLeague({
        leagueId: "league-2",
        name: "Second Test League",
        season: "2026",
        team: {
          rosterId: 1,
          userId: "user-2",
          username: "tester-2",
          displayName: "Tester Two",
          teamName: "Second Test Team",
          avatar: null,
          record: "0-0",
        },
      });
      store.saveWeeklyPlan(
        { ...weeklyPlan("league-2-plan-1", 1), leagueId: "league-2" },
        [],
        [evidence("league-2", "Second league evidence")],
      );

      expect(store.listEvidenceClaims({ leagueId: "league-1" })).toHaveLength(
        2,
      );
      expect(store.listEvidenceClaims({ leagueId: "league-2" })).toEqual([
        expect.objectContaining({
          id: "weekly-evidence:v1:league-2:plan:league-2-plan-1:evidence-1",
          claim: "Second league evidence",
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("refuses to move an unscoped evidence row between leagues", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-evidence-owner-"),
    );
    const store = new LocalStore(join(directory, "evidence-owner.sqlite"));
    const claim: EvidenceClaim = {
      id: "provider-stable-id",
      leagueId: "league-1",
      playerId: "player-2",
      category: "role",
      claim: "Original league claim",
      metricName: null,
      metricValue: null,
      sourceTitle: "Provider",
      sourceUrl: "https://example.com/provider",
      sourceType: "provider",
      fetchedAt: "2026-09-15T10:00:00.000Z",
      effectiveWeek: 2,
      expiresAt: null,
    };
    try {
      saveTestLeague(store);
      store.saveLeague({
        leagueId: "league-2",
        name: "Second Test League",
        season: "2026",
        team: {
          rosterId: 1,
          userId: "user-2",
          username: "tester-2",
          displayName: "Tester Two",
          teamName: "Second Test Team",
          avatar: null,
          record: "0-0",
        },
      });
      store.saveEvidenceClaims([claim]);

      expect(() =>
        store.saveEvidenceClaims([
          {
            ...claim,
            leagueId: "league-2",
            claim: "Should not replace the original",
          },
        ]),
      ).toThrow(/already belongs to a different league/);
      expect(store.listEvidenceClaims({ leagueId: "league-1" })).toEqual([
        expect.objectContaining({ claim: "Original league claim" }),
      ]);
      expect(store.listEvidenceClaims({ leagueId: "league-2" })).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("stores summaries, deduplicated events, evidence, watchlists, and identities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-weekly-"));
    const store = new LocalStore(join(directory, "weekly.sqlite"));
    try {
      saveTestLeague(store);
      store.saveWeeklyContext({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        phase: "tuesday",
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: {},
      });
      store.saveWeeklyPlan(weeklyPlan("plan-1", 1));
      const summarized = store.saveWeeklyPlanSummary("plan-1", {
        headline: "A measured waiver swing improves the bench",
        summary: "Bid on the role change while preserving your core starters.",
        competitiveLane: "retooler",
        pendingActionCount: 999,
        sourceCount: 0,
      });
      expect(summarized.microSummary).toMatchObject({
        competitiveLane: "contender",
        pendingActionCount: 1,
        sourceCount: 1,
      });

      const sleeperEvent = {
        id: "event-1",
        leagueId: "league-1",
        season: "2026",
        week: 2,
        dedupeKey: "transaction-1:add:player-2",
        eventType: "waiver" as const,
        upstreamId: "transaction-1",
        occurredAt: "2026-09-15T08:00:00.000Z",
        detectedAt: "2026-09-15T10:00:00.000Z",
        rosterIds: [1],
        playerIds: ["player-2"],
        payload: { bid: 7 },
      };
      expect(store.saveSleeperEvents([sleeperEvent, sleeperEvent])).toBe(1);
      expect(
        store.listSleeperEvents({
          leagueId: "league-1",
          season: "2026",
          week: 2,
        }),
      ).toHaveLength(1);

      store.saveEvidenceClaims([
        {
          id: "evidence-1",
          leagueId: "league-1",
          playerId: "player-2",
          category: "usage",
          claim: "Player Two ran more routes.",
          metricName: "route_share",
          metricValue: 0.72,
          sourceTitle: "Usage report",
          sourceUrl: "https://example.com/usage",
          sourceType: "web",
          fetchedAt: "2026-09-15T10:00:00.000Z",
          effectiveWeek: 2,
          expiresAt: "2026-09-19T10:00:00.000Z",
        },
      ]);
      expect(
        store.listEvidenceClaims({
          playerId: "player-2",
          freshAt: "2026-09-16T10:00:00.000Z",
        })[0]?.metricValue,
      ).toBe(0.72);

      store.upsertWatchlistEntry({
        id: "watch-1",
        leagueId: "league-1",
        playerId: "player-2",
        hypothesis: "The larger role will stick.",
        trigger: "Route share remains above 65 percent.",
        state: "active",
        createdSeason: "2026",
        createdWeek: 2,
        expiresSeason: "2026",
        expiresWeek: 4,
        createdAt: "2026-09-15T10:00:00.000Z",
        updatedAt: "2026-09-15T10:00:00.000Z",
      });
      expect(store.listWatchlistEntries("league-1")[0]?.trigger).toContain(
        "65 percent",
      );
      expect(store.updateWatchlistState("watch-1", "expired").state).toBe(
        "expired",
      );
      expect(store.listWatchlistEntries("league-1")).toEqual([]);
      expect(
        store.listWatchlistEntries("league-1", { includeInactive: true })[0]
          ?.state,
      ).toBe("expired");

      store.upsertProviderIdentity({
        playerId: "player-2",
        provider: "gsis",
        providerPlayerId: "00-1234567",
        updatedAt: "2026-09-15T10:00:00.000Z",
      });
      expect(
        store.getProviderIdentity("player-2", "gsis")?.providerPlayerId,
      ).toBe("00-1234567");

      store.clearAll();
      expect(store.listLeagues()).toEqual([]);
      expect(store.getProviderIdentity("player-2", "gsis")).toBeNull();
      expect(store.listEvidenceClaims({})).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("cascades league-owned weekly records when a league is deleted", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-cascade-"),
    );
    const path = join(directory, "cascade.sqlite");
    const store = new LocalStore(path);
    try {
      saveTestLeague(store);
      store.saveWeeklyContext({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        phase: "tuesday",
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: {},
      });
      store.saveWeeklyPlan(weeklyPlan("plan-1", 1), [
        weeklyAction("action-1", "plan-1"),
      ]);
      store.saveWeeklyPhaseBrief(phaseBrief("phase-brief-1", "wednesday", 1));
      store.saveEvidenceClaims([
        {
          id: "evidence-1",
          leagueId: "league-1",
          playerId: "player-2",
          category: "role",
          claim: "A role changed.",
          metricName: null,
          metricValue: null,
          sourceTitle: "Sleeper",
          sourceUrl: null,
          sourceType: "sleeper",
          fetchedAt: "2026-09-15T10:00:00.000Z",
          effectiveWeek: 2,
          expiresAt: null,
        },
      ]);

      const database = new DatabaseSync(path);
      database.exec("PRAGMA foreign_keys = ON");
      database
        .prepare("DELETE FROM leagues WHERE league_id = ?")
        .run("league-1");
      database.close();

      const key = { leagueId: "league-1", season: "2026", week: 2 };
      expect(store.getLeagueWeek(key)).toBeNull();
      expect(store.getWeeklyPlan("plan-1")).toBeNull();
      expect(store.getWeeklyPhaseBrief("phase-brief-1")).toBeNull();
      expect(store.getWeeklyAction("action-1")).toBeNull();
      expect(store.listEvidenceClaims({ leagueId: "league-1" })).toEqual([]);
    } finally {
      store.close();
    }
  });
});

function phaseBrief(
  id: string,
  phase: WeeklyPhaseBrief["phase"],
  version: number,
): WeeklyPhaseBrief {
  const base = {
    id,
    leagueId: "league-1",
    season: "2026",
    week: 2,
    version,
    sourceSnapshotId: "snapshot-1",
    sourcePlanId: "plan-1",
    inputHash: `input-${phase}-${version}`,
    evidenceHash: `evidence-${phase}-${version}`,
    generatedAt: `2026-09-${String(16 + version).padStart(2, "0")}T12:00:00.000Z`,
    dataFreshThrough: "2026-09-18T12:00:00.000Z",
    researchFreshThrough: "2026-09-19T12:00:00.000Z",
    model: "gpt-test",
    reasoningEffort: "high",
    promptVersion: "1",
    schemaVersion: "1",
    players: [
      {
        playerId: "player-2",
        name: "Player Two",
        position: "WR",
        nflTeam: "LAR",
        injuryStatus: null,
        status: "Active",
      },
    ],
  };
  const sources = [
    {
      evidenceId: "evidence-1",
      title: "Official report",
      url: "https://example.com/report",
      claim: "Player Two practiced in full.",
      sourceType: "web" as const,
      fetchedAt: "2026-09-16T12:00:00.000Z",
    },
  ];
  if (phase === "wednesday")
    return {
      ...base,
      phase,
      output: {
        headline: `Waiver aftermath version ${version}`,
        summary: "The primary claim cleared and one useful player was dropped.",
        confidence: "high",
        observedActions: [],
        importantDrops: [],
        newlyFreePlayers: [],
        congestion: [],
        sources,
        uncertainties: [],
      },
    };
  if (phase === "thursday")
    return {
      ...base,
      phase,
      output: {
        headline: "Start the stronger route role",
        summary: "The legal lineup has one recommended receiver change.",
        confidence: "medium",
        slotAssignments: [
          { slotIndex: 0, slot: "QB", playerId: "player-qb" },
          { slotIndex: 1, slot: "WR", playerId: "player-2" },
        ],
        recommendedMoves: [],
        closeCalls: [],
        flexNotes: [],
        sources,
        uncertainties: [],
      },
    };
  return {
    ...base,
    phase,
    output: {
      headline: "The lineup is clear pending one inactive check",
      summary: "Keep the final roster spot available for a late stash.",
      confidence: "medium",
      criticalStatusAlerts: [],
      flexibilityNotes: [],
      stashCandidates: [],
      actions: [],
      sources,
      uncertainties: [],
    },
  };
}

describe("LocalStore weekly phase brief persistence", () => {
  it("keeps immutable per-phase history and resolves the current brief", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-phase-brief-"),
    );
    const store = new LocalStore(join(directory, "phase-brief.sqlite"));
    try {
      saveTestLeague(store);
      store.saveWeeklyContext({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        phase: "tuesday",
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: {},
      });
      store.saveWeeklyPlan(weeklyPlan("plan-1", 1));

      const first = store.saveWeeklyPhaseBrief(
        phaseBrief("wednesday-1", "wednesday", 1),
      );
      store.saveWeeklyPhaseBrief(phaseBrief("wednesday-2", "wednesday", 2));
      store.saveWeeklyPhaseBrief(phaseBrief("thursday-1", "thursday", 1));

      const key = { leagueId: "league-1", season: "2026", week: 2 };
      expect(store.getWeeklyPhaseBrief(first.id)).toEqual(first);
      expect(
        store.getCurrentWeeklyPhaseBrief({ ...key, phase: "wednesday" })?.id,
      ).toBe("wednesday-2");
      expect(
        store
          .listWeeklyPhaseBriefs({ ...key, phase: "wednesday" })
          .map((brief) => brief.id),
      ).toEqual(["wednesday-2", "wednesday-1"]);
      expect(store.getWeeklyPhaseBrief("wednesday-1")?.output.headline).toBe(
        "Waiver aftermath version 1",
      );

      const current = store.getCurrentWeeklyBriefs(key);
      expect(current.wednesday?.id).toBe("wednesday-2");
      expect(current.thursday?.id).toBe("thursday-1");
      expect(current.weekend).toBeNull();
      expect(
        current.thursday?.players.find(
          (player) => player.playerId === "player-2",
        )?.name,
      ).toBe("Player Two");

      expect(() =>
        store.saveWeeklyPhaseBrief(
          phaseBrief("wednesday-skipped", "wednesday", 4),
        ),
      ).toThrow(/not the next version/);
    } finally {
      store.close();
    }
  });

  it("validates source-plan provenance before writing a brief", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-phase-provenance-"),
    );
    const store = new LocalStore(join(directory, "phase-provenance.sqlite"));
    try {
      saveTestLeague(store);
      store.saveWeeklyContext({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        phase: "tuesday",
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: {},
      });
      store.saveWeeklyPlan(weeklyPlan("plan-1", 1));
      expect(() =>
        store.saveWeeklyPhaseBrief({
          ...phaseBrief("wrong-week", "weekend", 1),
          week: 3,
        }),
      ).toThrow(/does not belong to source plan/);
      expect(store.getWeeklyPhaseBrief("wrong-week")).toBeNull();
    } finally {
      store.close();
    }
  });

  it("persists phase evidence and safely upserts generated actions", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-phase-bundle-"),
    );
    const store = new LocalStore(join(directory, "phase-bundle.sqlite"));
    try {
      saveTestLeague(store);
      store.saveWeeklyContext({
        leagueId: "league-1",
        season: "2026",
        week: 2,
        phase: "tuesday",
        snapshotAt: "2026-09-15T10:00:00.000Z",
        contextHash: "context-a",
        context: {},
      });
      store.saveWeeklyPlan(weeklyPlan("plan-1", 1));
      const action: WeeklyAction = {
        ...weeklyAction("thursday-action-1", "plan-1"),
        actionKey: "thursday:set-player-2",
        kind: "lineup_move",
        title: "Start Player Two",
      };
      const phaseEvidence: EvidenceClaim = {
        id: "phase-evidence-1",
        leagueId: "league-1",
        playerId: null,
        category: "projection",
        claim: "Player Two has the stronger current projection.",
        metricName: null,
        metricValue: null,
        sourceTitle: "Projection source",
        sourceUrl: "https://example.com/projection",
        sourceType: "web",
        fetchedAt: "2026-09-17T12:00:00.000Z",
        effectiveWeek: 2,
        expiresAt: "2026-09-18T00:00:00.000Z",
      };
      store.saveWeeklyPhaseBrief(
        phaseBrief("thursday-bundle-1", "thursday", 1),
        [action],
        [phaseEvidence],
      );
      expect(store.listWeeklyActions("plan-1")).toEqual([
        expect.objectContaining({
          actionKey: "thursday:set-player-2",
          status: "pending",
        }),
      ]);
      expect(store.listEvidenceClaims({ leagueId: "league-1" })).toEqual([
        expect.objectContaining({
          id: "weekly-evidence:v1:league-1:brief:thursday-bundle-1:phase-evidence-1",
        }),
      ]);

      const storedAction = store.listWeeklyActions("plan-1")[0]!;
      store.updateWeeklyAction(storedAction.id, "completed", "Done in Sleeper");
      store.saveWeeklyPhaseBrief(
        phaseBrief("thursday-bundle-2", "thursday", 2),
        [
          {
            ...action,
            id: "new-generated-id",
            description: "The updated research still favors Player Two.",
            createdAt: "2026-09-18T12:00:00.000Z",
            updatedAt: "2026-09-18T12:00:00.000Z",
          },
        ],
        [
          {
            ...phaseEvidence,
            claim: "Player Two still has the stronger current projection.",
            fetchedAt: "2026-09-18T12:00:00.000Z",
          },
        ],
      );
      expect(store.listWeeklyActions("plan-1")).toEqual([
        expect.objectContaining({
          id: storedAction.id,
          actionKey: "thursday:set-player-2",
          status: "completed",
          dispositionNote: "Done in Sleeper",
          description: "The updated research still favors Player Two.",
        }),
      ]);
      expect(
        store
          .listEvidenceClaims({ leagueId: "league-1" })
          .map((claim) => claim.id),
      ).toEqual([
        "weekly-evidence:v1:league-1:brief:thursday-bundle-2:phase-evidence-1",
        "weekly-evidence:v1:league-1:brief:thursday-bundle-1:phase-evidence-1",
      ]);
    } finally {
      store.close();
    }
  });
});

describe("LocalStore generated Watch persistence", () => {
  it("deduplicates by league and player without reviving dismissed or expired entries", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sleeper-caffeine-generated-watch-"),
    );
    const store = new LocalStore(join(directory, "generated-watch.sqlite"));
    try {
      saveTestLeague(store);
      store.upsertGeneratedWatchlistEntry(generatedWatch("watch-first", "p1"));
      store.upsertGeneratedWatchlistEntry({
        ...generatedWatch("watch-second", "p1"),
        hypothesis: "The updated role hypothesis.",
        trigger: "Routes stay above 70 percent.",
      });
      expect(
        store.listWatchlistEntries("league-1", { includeInactive: true }),
      ).toEqual([
        expect.objectContaining({
          id: "watch-first",
          playerId: "p1",
          hypothesis: "The updated role hypothesis.",
          trigger: "Routes stay above 70 percent.",
          state: "active",
        }),
      ]);

      store.updateWatchlistState("watch-first", "dismissed");
      const dismissed = store.upsertGeneratedWatchlistEntry({
        ...generatedWatch("watch-third", "p1"),
        hypothesis: "Do not revive this hypothesis.",
      });
      expect(dismissed.state).toBe("dismissed");
      expect(
        store.listWatchlistEntries("league-1", { includeInactive: true })[0],
      ).toMatchObject({
        id: "watch-first",
        state: "dismissed",
        hypothesis: "The updated role hypothesis.",
      });

      store.upsertGeneratedWatchlistEntry(generatedWatch("watch-p2", "p2"));
      store.updateWatchlistState("watch-p2", "expired");
      expect(
        store.upsertGeneratedWatchlistEntry({
          ...generatedWatch("watch-p2-new", "p2"),
          trigger: "Do not restore this trigger.",
        }).state,
      ).toBe("expired");
      expect(
        store.listWatchlistEntries("league-1", { includeInactive: true }),
      ).toHaveLength(2);
    } finally {
      store.close();
    }
  });
});

function generatedWatch(id: string, playerId: string): WatchlistEntry {
  return {
    id,
    leagueId: "league-1",
    playerId,
    hypothesis: "The player's role may grow.",
    trigger: "Usage remains elevated.",
    state: "active",
    createdSeason: "2026",
    createdWeek: 3,
    expiresSeason: "2026",
    expiresWeek: 4,
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
  };
}
