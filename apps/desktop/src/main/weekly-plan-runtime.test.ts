import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexSupervisor } from "@sleeper-caffeine/codex-runtime";
import type { PlayerSummary, WeeklyContextData } from "@sleeper-caffeine/core";
import type {
  Dashboard,
  RuntimeEvent,
  TuesdayPlanOutput,
  WatchlistEntry,
  WeeklyChange,
} from "@sleeper-caffeine/ipc-contract";
import { describe, expect, it, vi } from "vitest";
import { AppRuntime } from "./runtime.js";
import { weeklyContextHash } from "./weekly-plan.js";

const key = { leagueId: "league-1", season: "2026", week: 3 } as const;

describe("Tuesday weekly plan runtime", () => {
  it("rejects weekly plans and phase briefs while Sleeper is still drafting", async () => {
    const runtime = await testRuntime();
    const runTurn = vi.fn();
    runtime.codex = codexWith(runTurn);
    runtime.store.saveDashboard(
      { ...dashboard(), leagueStatus: "drafting" },
      {},
    );

    try {
      await expect(
        runtime.generateWeeklyPlan({ ...key, mode: "build" }),
      ).rejects.toThrow("activate when Sleeper marks this league in season");
      await expect(
        runtime.generateWeeklyPhaseBrief({
          ...key,
          phase: "wednesday",
          mode: "build",
        }),
      ).rejects.toThrow("activate when Sleeper marks this league in season");
      expect(runTurn).not.toHaveBeenCalled();
    } finally {
      runtime.store.close();
    }
  });

  it("refreshes Sleeper state without spending a Codex turn", async () => {
    const runtime = await testRuntime();
    const runTurn = vi.fn();
    runtime.codex = codexWith(runTurn);
    const internals = runtime as unknown as {
      buildDashboard(saved: unknown): Promise<{
        dashboard: Dashboard;
        raw: unknown;
      }>;
      refreshWeeklyContext(saved: unknown, dashboard: Dashboard): Promise<void>;
    };
    const buildDashboard = vi
      .spyOn(internals, "buildDashboard")
      .mockResolvedValue({ dashboard: dashboard(), raw: { refreshed: true } });
    const refreshWeeklyContext = vi
      .spyOn(internals, "refreshWeeklyContext")
      .mockImplementation(async (_saved, refreshedDashboard) => {
        const context = weeklyContext();
        runtime.store.saveWeeklyContext({
          ...key,
          phase: "tuesday",
          snapshotAt: refreshedDashboard.capturedAt,
          contextHash: weeklyContextHash(context),
          context,
        });
      });

    try {
      const bootstrap = await runtime.refreshActiveLeague();

      expect(buildDashboard).toHaveBeenCalledTimes(1);
      expect(refreshWeeklyContext).toHaveBeenCalledTimes(1);
      expect(runTurn).not.toHaveBeenCalled();
      expect(bootstrap.activeLeagueWeek).toMatchObject({
        ...key,
        planStatus: "not_built",
      });
    } finally {
      runtime.store.close();
    }
  });

  it("builds with one structured Tuesday turn and one low-effort editorial turn", async () => {
    const runtime = await testRuntime();
    const output = weeklyOutput();
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(codexResult("weekly-thread", "plan-turn", output))
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "summary-turn", weeklyEditorialSummary()),
      );
    runtime.codex = codexWith(runTurn);
    const events: RuntimeEvent[] = [];
    runtime.on("runtime-event", (event: RuntimeEvent) => events.push(event));

    try {
      const bundle = await runtime.generateWeeklyPlan({
        ...key,
        mode: "build",
      });
      const planRequest = runTurn.mock.calls[0]?.[0] as TurnRequest;
      const summaryRequest = runTurn.mock.calls[1]?.[0] as TurnRequest;

      expect(runTurn).toHaveBeenCalledTimes(2);
      expect(planRequest).toMatchObject({
        threadId: null,
        model: "gpt-test",
        effort: "high",
        outputSchema: {
          type: "object",
          additionalProperties: false,
        },
      });
      expect(planRequest.prompt).toContain(
        "Build the manager's substantial Tuesday Weekly Plan",
      );
      expect(planRequest.prompt).toContain("Call get_weekly_context first");
      expect(summaryRequest).toMatchObject({
        threadId: "weekly-thread",
        model: "gpt-test",
        effort: "low",
        outputSchema: {
          type: "object",
          additionalProperties: false,
        },
      });
      expect(summaryRequest.prompt).toContain(
        "editorial step only: do not call tools",
      );
      expect(bundle.plan).toMatchObject({
        version: 1,
        status: "current",
        microSummary: derivedWeeklySummary(),
      });
      expect(bundle.actions).toHaveLength(2);
      expect(runtime.store.listWeeklyPlans(key)).toHaveLength(1);
      expect(
        runtime.store.listEvidenceClaims({ leagueId: key.leagueId }),
      ).toEqual([
        expect.objectContaining({
          id: `weekly-evidence:v1:${key.leagueId}:plan:${bundle.plan?.id}:source-1`,
        }),
      ]);
      expect(bundle.plan?.output.sources[0]?.evidenceId).toBe("source-1");
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "weekly_plan_progress",
            stage: "reading_league",
          }),
          expect.objectContaining({ type: "weekly_plan_completed" }),
        ]),
      );
    } finally {
      runtime.store.close();
    }
  });

  it("keeps the complete persisted plan when editorial summarization fails", async () => {
    const runtime = await testRuntime();
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "plan-turn", weeklyOutput()),
      )
      .mockRejectedValueOnce(new Error("summary service unavailable"));
    runtime.codex = codexWith(runTurn);

    try {
      const bundle = await runtime.generateWeeklyPlan({
        ...key,
        mode: "build",
      });

      expect(runTurn).toHaveBeenCalledTimes(2);
      expect(bundle.plan).not.toBeNull();
      expect(bundle.plan?.output.headline).toBe(
        "Make one measured waiver claim and test the trade market",
      );
      expect(bundle.plan?.microSummary).toBeNull();
      expect(runtime.store.getWeeklyPlanBundle(key)?.plan?.id).toBe(
        bundle.plan?.id,
      );
      expect(runtime.store.listWeeklyPlans(key)).toHaveLength(1);
    } finally {
      runtime.store.close();
    }
  });

  it("preserves the prior good plan when a structured regeneration is invalid", async () => {
    const runtime = await testRuntime();
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "plan-turn", weeklyOutput()),
      )
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "summary-turn", weeklyEditorialSummary()),
      )
      .mockResolvedValueOnce({
        threadId: "weekly-thread",
        turnId: "invalid-turn",
        text: JSON.stringify({ headline: "This is incomplete" }),
      });
    runtime.codex = codexWith(runTurn);

    try {
      const good = await runtime.generateWeeklyPlan({
        ...key,
        mode: "build",
      });

      await expect(
        runtime.generateWeeklyPlan({ ...key, mode: "regenerate" }),
      ).rejects.toThrow("did not match the decision format");

      const current = runtime.store.getWeeklyPlanBundle(key);
      expect(current?.plan?.id).toBe(good.plan?.id);
      expect(current?.plan?.version).toBe(1);
      expect(current?.plan?.status).toBe("current");
      expect(runtime.store.listWeeklyPlans(key)).toHaveLength(1);
    } finally {
      runtime.store.close();
    }
  });

  it("carries declined and dismissed decisions into the next plan prompt", async () => {
    const runtime = await testRuntime();
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "plan-turn", weeklyOutput()),
      )
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "summary-turn", weeklyEditorialSummary()),
      )
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "regen-turn", weeklyOutput()),
      )
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "regen-summary", weeklyEditorialSummary()),
      );
    runtime.codex = codexWith(runTurn);

    try {
      const first = await runtime.generateWeeklyPlan({
        ...key,
        mode: "build",
      });
      const trade = first.actions.find(
        (action) => action.actionKey === "test-trade-market",
      );
      const watch = first.actions.find(
        (action) => action.actionKey === "watch-candidate-role",
      );
      expect(trade).toBeDefined();
      expect(watch).toBeDefined();
      expect(runtime.store.listWatchlistEntries(key.leagueId)).toEqual([
        expect.objectContaining({
          playerId: "candidate",
          state: "active",
          trigger: "Route participation remains elevated next week.",
        }),
      ]);
      runtime.updateWeeklyAction({
        actionId: trade!.id,
        status: "declined",
        note: "The other manager rejected this framework.",
      });
      runtime.updateWeeklyAction({
        actionId: watch!.id,
        status: "dismissed",
        note: "I do not believe the role will stick.",
      });
      expect(
        runtime.store.listWatchlistEntries(key.leagueId, {
          includeInactive: true,
        }),
      ).toEqual([
        expect.objectContaining({
          playerId: "candidate",
          state: "dismissed",
        }),
      ]);

      await runtime.generateWeeklyPlan({ ...key, mode: "regenerate" });

      const prompt = (runTurn.mock.calls[2]?.[0] as TurnRequest).prompt;
      expect(prompt).toContain('"priorManagerDispositions"');
      expect(prompt).toContain('"status":"declined"');
      expect(prompt).toContain(
        '"note":"The other manager rejected this framework."',
      );
      expect(prompt).toContain('"status":"dismissed"');
      expect(prompt).toContain(
        '"note":"I do not believe the role will stick."',
      );
      expect(
        runtime.store.listWatchlistEntries(key.leagueId, {
          includeInactive: true,
        }),
      ).toEqual([
        expect.objectContaining({
          playerId: "candidate",
          state: "dismissed",
        }),
      ]);
    } finally {
      runtime.store.close();
    }
  });

  it("forces an available active Watch player into the bounded prompt cohort", async () => {
    const runtime = await testRuntime();
    const context = weeklyContext();
    const template = context.available_candidate_pool.players[0]!;
    context.available_candidate_pool.players = [
      template,
      ...Array.from({ length: 15 }, (_, index) => ({
        ...template,
        player_id: index === 14 ? "watched-tail" : `extra-${String(index + 1)}`,
        name: index === 14 ? "Watched Tail" : `Extra ${String(index + 1)}`,
        baseline_rank: index + 2,
      })),
    ];
    context.available_candidate_pool.total_returned = 16;
    runtime.store.saveWeeklyContext({
      ...key,
      phase: "tuesday",
      snapshotAt: "2026-09-22T12:01:00.000Z",
      contextHash: weeklyContextHash(context),
      context,
    });
    runtime.store.upsertWatchlistEntry(runtimeWatch("watched-tail"));
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "plan-turn", weeklyOutput()),
      )
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "summary-turn", weeklyEditorialSummary()),
      );
    runtime.codex = codexWith(runTurn);

    try {
      await runtime.generateWeeklyPlan({ ...key, mode: "build" });
      const prompt = (runTurn.mock.calls[0]?.[0] as TurnRequest).prompt;
      expect(prompt).toContain('"player_id":"watched-tail"');
      expect(prompt).not.toContain('"player_id":"extra-14"');
      expect(prompt).toContain(
        "Every active or triggered Watch player who remains available",
      );
    } finally {
      runtime.store.close();
    }
  });

  it("marks a long-running plan data_changed when its frozen context changes", async () => {
    const runtime = await testRuntime();
    let resolvePlan!: (value: {
      threadId: string;
      turnId: string;
      text: string;
    }) => void;
    const planTurn = new Promise<{
      threadId: string;
      turnId: string;
      text: string;
    }>((resolve) => {
      resolvePlan = resolve;
    });
    const runTurn = vi
      .fn()
      .mockImplementationOnce(() => planTurn)
      .mockResolvedValueOnce(
        codexResult("weekly-thread", "summary-turn", weeklyEditorialSummary()),
      );
    runtime.codex = codexWith(runTurn);

    try {
      const generation = runtime.generateWeeklyPlan({
        ...key,
        mode: "build",
      });
      await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(1));

      const changed = weeklyContext();
      changed.my_team.bench = [];
      changed.my_team.all_players = [starter];
      changed.league_rosters[0] = {
        ...changed.league_rosters[0]!,
        bench: [],
        all_players: [starter],
      };
      runtime.store.saveWeeklyContext({
        ...key,
        phase: "tuesday",
        snapshotAt: "2026-09-22T12:05:00.000Z",
        contextHash: weeklyContextHash(changed),
        context: changed,
        meaningfulChanges: [rosterChange()],
      });
      resolvePlan(codexResult("weekly-thread", "plan-turn", weeklyOutput()));

      const bundle = await generation;
      expect(bundle.plan?.status).toBe("data_changed");
      expect(bundle.plan?.statusReason).toContain("1 material change");
      expect(runtime.store.getWeeklyPlanBundle(key)?.plan?.status).toBe(
        "data_changed",
      );
    } finally {
      runtime.store.close();
    }
  });
});

async function testRuntime(): Promise<AppRuntime> {
  const directory = await mkdtemp(
    join(tmpdir(), "sleeper-caffeine-weekly-plan-runtime-"),
  );
  const runtime = new AppRuntime(directory);
  runtime.store.saveLeague({
    leagueId: key.leagueId,
    name: "Test League",
    season: key.season,
    team: {
      rosterId: 1,
      userId: "user-1",
      username: "tester",
      displayName: "Tester",
      teamName: "Test Team",
      avatar: null,
      record: "2-0",
    },
  });
  runtime.store.saveDashboard(dashboard(), {});
  runtime.store.saveAiSettings({ model: "gpt-test", effort: "high" });
  const context = weeklyContext();
  runtime.store.saveWeeklyContext({
    ...key,
    phase: "tuesday",
    snapshotAt: "2026-09-22T12:00:00.000Z",
    contextHash: weeklyContextHash(context),
    context,
  });
  return runtime;
}

function codexWith(runTurn: ReturnType<typeof vi.fn>): CodexSupervisor {
  return {
    runTurn,
    getStatus: () => ({
      state: "ready",
      binaryPath: "/usr/local/bin/codex",
      version: "test",
      email: "test@example.com",
      planType: "test",
      errorMessage: null,
      availableModels: [
        {
          model: "gpt-test",
          displayName: "GPT Test",
          description: "Controlled test model",
          isDefault: true,
          defaultReasoningEffort: "high",
          supportedReasoningEfforts: [
            { effort: "low", description: "Fast" },
            { effort: "high", description: "Thorough" },
          ],
        },
      ],
    }),
  } as unknown as CodexSupervisor;
}

type TurnRequest = {
  threadId: string | null;
  model: string;
  effort: string;
  prompt: string;
  outputSchema: unknown;
};

function codexResult(
  threadId: string,
  turnId: string,
  output: unknown,
): { threadId: string; turnId: string; text: string } {
  return { threadId, turnId, text: JSON.stringify(output) };
}

function weeklyEditorialSummary() {
  return {
    headline: "Add the upside receiver, then test one trade window",
    summary:
      "Place a measured claim and monitor whether the new role survives another week.",
  };
}

function derivedWeeklySummary() {
  return {
    ...weeklyEditorialSummary(),
    competitiveLane: "contender" as const,
    pendingActionCount: 2,
    sourceCount: 1,
  };
}

function weeklyOutput(): TuesdayPlanOutput {
  return {
    headline: "Make one measured waiver claim and test the trade market",
    summary:
      "The roster can improve its last bench slot without disturbing the starting core.",
    confidence: "medium",
    competitiveLane: {
      lane: "contender",
      confidence: "medium",
      reasons: ["The team ranks near the top in record and points."],
      contraryEvidence: ["Receiver depth is fragile."],
    },
    actions: [
      {
        actionKey: "test-trade-market",
        kind: "trade",
        title: "Ask Other Team about a receiver swap",
        description: "Open one focused conversation without forcing a deal.",
        priority: "soon",
        playerIds: ["bench"],
        rosterIds: [2],
        confidence: "medium",
        keyUncertainty: "The other manager may prefer to hold.",
        sourceIds: ["source-1"],
      },
      {
        actionKey: "watch-candidate-role",
        kind: "watch",
        title: "Watch Free Agent Receiver's next role",
        description: "Keep the candidate on the short watchlist.",
        priority: "monitor",
        playerIds: ["candidate"],
        rosterIds: [],
        confidence: "medium",
        keyUncertainty: "One game may not establish the role.",
        sourceIds: ["source-1"],
      },
    ],
    waiverClaims: [
      {
        priority: 1,
        addPlayerId: "candidate",
        dropPlayerId: "bench",
        contingencyGroup: "bench-upside",
        faabPercentMin: 5,
        faabPercentTarget: 8,
        faabPercentMax: 12,
        rationale: "The candidate has more upside than the final bench slot.",
        confidence: "medium",
        sourceIds: ["source-1"],
      },
    ],
    addNow: [
      {
        playerId: "candidate",
        headline: "Add Free Agent Receiver",
        rationale: "The role signal is worth a measured bench bet.",
        confidence: "medium",
        sourceIds: ["source-1"],
      },
    ],
    watch: [
      {
        playerId: "candidate",
        headline: "Verify the new route participation",
        rationale: "A second week would make the role more durable.",
        confidence: "medium",
        sourceIds: ["source-1"],
        trigger: "Route participation remains elevated next week.",
      },
    ],
    exit: [
      {
        playerId: "bench",
        headline: "Bench Receiver is the cleanest exit",
        rationale: "The roster slot has neither immediate utility nor upside.",
        confidence: "medium",
        sourceIds: ["source-1"],
        dropRank: 1,
        rosterPurposes: [],
      },
    ],
    rosterAudit: [
      {
        playerId: "starter",
        purposes: ["start"],
        rationale: "Starter Runner belongs in the lineup.",
        confidence: "high",
      },
      {
        playerId: "bench",
        purposes: [],
        rationale: "Bench Receiver lacks a clear roster purpose.",
        confidence: "medium",
      },
    ],
    marketObservation: {
      headline: "Probe one receiver-needy roster",
      recommendation: "Ask Other Team about a modest receiver upgrade.",
      partnerRosterIds: [2],
      alternatives: ["Hold if the price reaches a premium pick."],
      rationale: "The other roster has a complementary construction.",
      sourceIds: ["source-1"],
    },
    alternatives: [
      {
        headline: "Preserve FAAB",
        recommendation: "Watch the candidate for another week.",
        preferableWhen: "The waiver market becomes unusually aggressive.",
        tradeoff: "Another manager may add the player first.",
        playerIds: ["candidate"],
        sourceIds: ["source-1"],
      },
    ],
    sources: [
      {
        evidenceId: "source-1",
        title: "Frozen Sleeper league context",
        url: null,
        claim: "The candidate is unrostered and Bench Receiver is on my team.",
        sourceType: "sleeper",
        fetchedAt: "2026-09-22T12:00:00.000Z",
      },
    ],
    uncertainties: ["The candidate's expanded role is only one week old."],
    refreshTriggers: ["A material injury or waiver transaction."],
  };
}

function dashboard(): Dashboard {
  return {
    league: {
      leagueId: key.leagueId,
      name: "Test League",
      season: key.season,
      rosterId: 1,
      userId: "user-1",
      teamName: "Test Team",
      avatar: null,
      lastRefreshedAt: "2026-09-22T12:00:00.000Z",
      isActive: true,
    },
    capturedAt: "2026-09-22T12:00:00.000Z",
    week: key.week,
    leagueStatus: "in_season",
    scoringLabel: "PPR",
    rosterPositions: ["RB", "WR"],
    starters: [],
    bench: [],
    reserve: [],
    taxi: [],
    record: { wins: 2, losses: 0, ties: 0, pointsFor: 250 },
    pickInventory: null,
    warnings: [],
    draft: null,
    nextMatchup: null,
  };
}

function rosterChange(): WeeklyChange {
  return {
    id: "change-bench-drop",
    kind: "roster",
    headline: "Bench Receiver left the roster",
    description: "The selected roster no longer contains Bench Receiver.",
    entityType: "player",
    entityId: "bench",
    occurredAt: "2026-09-22T12:04:00.000Z",
    detectedAt: "2026-09-22T12:05:00.000Z",
    material: true,
    sourceEventId: null,
  };
}

function runtimeWatch(playerId: string): WatchlistEntry {
  return {
    id: `manager-watch-${playerId}`,
    leagueId: key.leagueId,
    playerId,
    hypothesis: "The role may become actionable.",
    trigger: "Usage remains elevated.",
    state: "active",
    createdSeason: key.season,
    createdWeek: 2,
    expiresSeason: key.season,
    expiresWeek: 4,
    createdAt: "2026-09-15T12:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };
}

const starter = player("starter", "Starter Runner", "RB", 30);
const bench = player("bench", "Bench Receiver", "WR", 500);
const candidate = player("candidate", "Free Agent Receiver", "WR", 220);

function player(
  playerId: string,
  name: string,
  position: string,
  searchRank: number,
): PlayerSummary {
  return {
    player_id: playerId,
    name,
    position,
    fantasy_positions: [position],
    team: "TST",
    status: "Active",
    injury_status: null,
    depth_chart_order: 1,
    depth_chart_position: position,
    years_exp: 2,
    search_rank: searchRank,
    number: null,
  };
}

function weeklyContext(): WeeklyContextData {
  const myStanding = {
    roster_id: 1,
    wins: 2,
    losses: 0,
    ties: 0,
    points_for: 250,
    points_against: 190,
    waiver_position: 6,
    record_rank: 1,
    points_rank: 2,
    total_rosters: 2,
  };
  const myRoster = {
    roster_id: 1,
    owner_id: "user-1",
    co_owner_ids: [],
    username: "tester",
    display_name: "Tester",
    team_name: "Test Team",
    settings: {},
    starters: [{ ...starter, starter_slot: "RB" }],
    bench: [bench],
    reserve: [],
    taxi: [],
    all_players: [starter, bench],
    standings: myStanding,
    faab: {
      starting_budget: 100,
      used: 10,
      remaining: 90,
      waiver_position: 6,
    },
  };
  const otherStanding = {
    ...myStanding,
    roster_id: 2,
    wins: 0,
    losses: 2,
    record_rank: 2,
  };
  const otherRoster = {
    ...myRoster,
    roster_id: 2,
    owner_id: "user-2",
    username: "other",
    display_name: "Other",
    team_name: "Other Team",
    starters: [],
    bench: [],
    all_players: [],
    standings: otherStanding,
  };
  return {
    key: { league_id: key.leagueId, season: key.season, week: key.week },
    captured_context: {
      nfl_state: { week: key.week, season: key.season, season_type: "regular" },
      matchup_weeks: [1, 2, 3],
      trending_lookback_hours: 24,
    },
    league: {
      league_id: key.leagueId,
      name: "Test League",
      season: key.season,
      season_type: "regular",
      status: "in_season",
      total_rosters: 2,
      roster_positions: ["RB", "WR"],
      scoring_settings: { rec: 1 },
      settings: { waiver_budget: 100 },
      waiver_type: 2,
      faab_starting_budget: 100,
    },
    my_team: {
      identity: {
        user_id: "user-1",
        username: "tester",
        display_name: "Tester",
      },
      ...myRoster,
      roster_purpose_baseline: [],
    },
    league_rosters: [myRoster, otherRoster],
    league_table: [myStanding, otherStanding],
    recent_matchups: [],
    current_week_transactions: {
      week: key.week,
      raw: [],
      normalized: [],
      events: [],
    },
    trending: { lookback_hours: 24, adds: [], drops: [] },
    available_candidate_pool: {
      definition: "Absent from all rosters",
      total_returned: 1,
      limit: 40,
      players: [
        {
          ...candidate,
          roster_availability: true,
          baseline_rank: 1,
          baseline_score: 70,
          trending_add_count: 0,
          trending_drop_count: 0,
          signals: [],
        },
      ],
    },
    limitations: [],
  };
}
