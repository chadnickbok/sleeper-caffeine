import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexSupervisor } from "@sleeper-caffeine/codex-runtime";
import type { PlayerSummary, WeeklyContextData } from "@sleeper-caffeine/core";
import type {
  Dashboard,
  RuntimeEvent,
  ThursdayLineupOutput,
  WeekendCheckOutput,
  WeeklyAction,
  WeeklyPlan,
} from "@sleeper-caffeine/ipc-contract";
import { describe, expect, it, vi } from "vitest";
import { AppRuntime } from "./runtime.js";
import { weeklyContextHash } from "./weekly-plan.js";

describe("weekly phase runtime", () => {
  it("builds Wednesday locally without spending a Codex turn", async () => {
    const runtime = await phaseRuntime();
    const runTurn = vi.fn();
    runtime.codex = null;
    const events: RuntimeEvent[] = [];
    runtime.on("runtime-event", (event: RuntimeEvent) => events.push(event));

    try {
      const brief = await runtime.generateWeeklyPhaseBrief({
        leagueId: "league-1",
        season: "2026",
        week: 3,
        phase: "wednesday",
        mode: "build",
      });

      expect(runTurn).not.toHaveBeenCalled();
      expect(brief).toMatchObject({
        phase: "wednesday",
        version: 1,
        sourcePlanId: "plan-1",
        model: "local-deterministic",
        reasoningEffort: "none",
      });
      expect(runtime.bootstrap().currentWeeklyBriefs.wednesday?.id).toBe(
        brief.id,
      );
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "weekly_phase_brief_progress",
            stage: "reconciling_week",
          }),
          expect.objectContaining({
            type: "weekly_phase_brief_completed",
          }),
        ]),
      );
    } finally {
      runtime.store.close();
    }
  });

  it("discards a long-running phase result when weekly decisions change and preserves the prior brief", async () => {
    const trackedAction = weeklyAction("watch", "watch", ["candidate"]);
    const runtime = await phaseRuntime([trackedAction]);
    const output = stableThursdayOutput();
    let resolveTurn!: (result: {
      threadId: string;
      turnId: string;
      text: string;
    }) => void;
    const delayedTurn = new Promise<{
      threadId: string;
      turnId: string;
      text: string;
    }>((resolve) => {
      resolveTurn = resolve;
    });
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        threadId: "thursday-thread",
        turnId: "first-turn",
        text: JSON.stringify(output),
      })
      .mockReturnValueOnce(delayedTurn);
    runtime.codex = codexWith(runTurn);

    try {
      const first = await runtime.generateWeeklyPhaseBrief({
        leagueId: "league-1",
        season: "2026",
        week: 3,
        phase: "thursday",
        mode: "build",
      });
      const regeneration = runtime.generateWeeklyPhaseBrief({
        leagueId: "league-1",
        season: "2026",
        week: 3,
        phase: "thursday",
        mode: "regenerate",
      });
      await vi.waitFor(() => expect(runTurn).toHaveBeenCalledTimes(2));
      runtime.store.updateWeeklyAction(
        trackedAction.id,
        "dismissed",
        "Manager chose to hold.",
      );
      resolveTurn({
        threadId: "thursday-thread",
        turnId: "second-turn",
        text: JSON.stringify(output),
      });

      await expect(regeneration).rejects.toThrow(
        "weekly decisions changed while the thursday briefing was being built",
      );
      expect(
        runtime.store.getCurrentWeeklyPhaseBrief({
          leagueId: "league-1",
          season: "2026",
          week: 3,
          phase: "thursday",
        })?.id,
      ).toBe(first.id);
      expect(
        runtime.store.listWeeklyPhaseBriefs({
          leagueId: "league-1",
          season: "2026",
          week: 3,
          phase: "thursday",
        }),
      ).toHaveLength(1);
    } finally {
      runtime.store.close();
    }
  });

  it("uses a strict Codex turn for Thursday and preserves it after a failed regeneration", async () => {
    const runtime = await phaseRuntime();
    const output: ThursdayLineupOutput = {
      headline: "Keep Starter Runner in the RB slot",
      summary: "No bench option has enough evidence to justify a change.",
      confidence: "high",
      slotAssignments: [{ slotIndex: 0, slot: "RB", playerId: "starter" }],
      recommendedMoves: [],
      closeCalls: [],
      flexNotes: [],
      sources: [
        {
          evidenceId: "source-1",
          title: "Official practice report",
          url: "https://example.com/practice",
          claim: "Starter Runner practiced in full on Thursday.",
          sourceType: "web",
          fetchedAt: "2026-09-24T18:00:00.000Z",
        },
      ],
      uncertainties: [],
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        threadId: "thursday-thread",
        turnId: "thursday-turn",
        text: JSON.stringify(output),
      })
      .mockResolvedValueOnce({
        threadId: "thursday-thread",
        turnId: "bad-turn",
        text: JSON.stringify({ headline: "Incomplete" }),
      });
    runtime.codex = codexWith(runTurn);

    try {
      const first = await runtime.generateWeeklyPhaseBrief({
        leagueId: "league-1",
        season: "2026",
        week: 3,
        phase: "thursday",
        mode: "build",
      });
      expect(first.phase).toBe("thursday");
      expect(runTurn).toHaveBeenCalledTimes(1);
      expect(runTurn.mock.calls[0]?.[0]).toMatchObject({
        threadId: null,
        model: "gpt-test",
        effort: "high",
      });
      const request = runTurn.mock.calls[0]?.[0] as {
        prompt: string;
        outputSchema: unknown;
      };
      expect(request.prompt).toContain("Frozen league-week context");
      expect(request.prompt).toContain("Do not call Sleeper again");
      expect(request.prompt).toContain('"legalLineupSlots"');
      expect(request.outputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });

      await expect(
        runtime.generateWeeklyPhaseBrief({
          leagueId: "league-1",
          season: "2026",
          week: 3,
          phase: "thursday",
          mode: "regenerate",
        }),
      ).rejects.toThrow("did not match the decision format");
      expect(
        runtime.store.getCurrentWeeklyPhaseBrief({
          leagueId: "league-1",
          season: "2026",
          week: 3,
          phase: "thursday",
        })?.id,
      ).toBe(first.id);
      expect(
        runtime.store.listWeeklyPhaseBriefs({
          leagueId: "league-1",
          season: "2026",
          week: 3,
          phase: "thursday",
        }),
      ).toHaveLength(1);
    } finally {
      runtime.store.close();
    }
  });

  it("only auto-observes transaction actions when their Sleeper transaction type matches", async () => {
    const actions = [
      weeklyAction("watch", "watch", ["candidate"]),
      weeklyAction("inactive", "inactive_check", ["starter"]),
      weeklyAction("trade", "trade", ["candidate"]),
      weeklyAction("waiver", "waiver_claim", ["candidate"]),
      weeklyAction("lineup-done", "lineup_move", ["starter", "bench"]),
      weeklyAction("lineup-open", "lineup_move", ["bench", "starter"]),
    ];
    const runtime = await phaseRuntime(actions);
    const context = weeklyContext();
    context.current_week_transactions.events = [
      {
        event_id: "transaction:waiver-1",
        event_type: "transaction",
        week: 3,
        occurred_at: 1_795_000_000_000,
        transaction_type: "waiver",
        status: "pending",
        roster_ids: [1],
        player_ids: ["candidate"],
        transaction: {
          transaction_id: "waiver-1",
          type: "waiver",
          status: "pending",
          created: 1_795_000_000_000,
          status_updated: 1_795_000_000_000,
          leg: null,
          creator: "user-1",
          roster_ids: [1],
          consenter_ids: [],
          adds: [],
          drops: [],
          draft_picks: [],
          waiver_budget: [],
          faab_bid: 7,
          settings: { waiver_bid: 7 },
          metadata: null,
        },
      },
    ];

    try {
      const reconcile = runtime as unknown as {
        reconcileObservedWeeklyActions(
          inputs: WeeklyAction[],
          weeklyContext: WeeklyContextData,
        ): void;
      };
      reconcile.reconcileObservedWeeklyActions(actions, context);
      expect(
        runtime.store
          .listWeeklyActions("plan-1")
          .find((action) => action.actionKey === "waiver")?.status,
      ).toBe("pending");

      context.current_week_transactions.events[0]!.status = "complete";
      context.current_week_transactions.events[0]!.transaction.status =
        "complete";
      reconcile.reconcileObservedWeeklyActions(actions, context);
      const statuses = Object.fromEntries(
        runtime.store
          .listWeeklyActions("plan-1")
          .map((action) => [action.actionKey, action.status]),
      );
      expect(statuses).toMatchObject({
        watch: "pending",
        inactive: "pending",
        trade: "pending",
        waiver: "observed_in_sleeper",
        "lineup-done": "pending",
        "lineup-open": "pending",
      });
    } finally {
      runtime.store.close();
    }
  });

  it("builds a bounded weekend check and persists its action checklist", async () => {
    const runtime = await phaseRuntime();
    const output: WeekendCheckOutput = {
      headline: "Protect the starter, then use the final bench window",
      summary:
        "Starter Runner is clear; Free Agent Receiver is the only justified stash.",
      confidence: "medium",
      criticalStatusAlerts: [],
      flexibilityNotes: [],
      stashCandidates: [
        {
          playerId: "candidate",
          dropPlayerId: "bench",
          headline: "Use the late window on Free Agent Receiver",
          rationale: "The candidate remains available and has the best signal.",
          confidence: "medium",
          sourceIds: ["source-1"],
          window: "sunday_late",
          trigger: "Bench Receiver is no longer needed as injury insurance.",
        },
      ],
      actions: [
        {
          actionKey: "stash-candidate",
          kind: "stash",
          title: "Stash Free Agent Receiver",
          description: "Use the final late-game roster window if still open.",
          priority: "monitor",
          playerIds: ["candidate", "bench"],
          confidence: "medium",
          sourceIds: ["source-1"],
        },
      ],
      sources: [
        {
          evidenceId: "source-1",
          title: "Official game status",
          url: "https://example.com/game-status",
          claim: "Starter Runner has no game-status designation.",
          sourceType: "web",
          fetchedAt: "2026-09-27T14:00:00.000Z",
        },
      ],
      uncertainties: ["The free agent may be claimed before the late window."],
    };
    const runTurn = vi.fn().mockResolvedValue({
      threadId: "weekend-thread",
      turnId: "weekend-turn",
      text: JSON.stringify(output),
    });
    runtime.codex = codexWith(runTurn);

    try {
      const brief = await runtime.generateWeeklyPhaseBrief({
        leagueId: "league-1",
        season: "2026",
        week: 3,
        phase: "weekend",
        mode: "build",
      });
      expect(brief.phase).toBe("weekend");
      const firstRequest = runTurn.mock.calls[0]?.[0] as
        | { prompt?: unknown }
        | undefined;
      expect(
        typeof firstRequest?.prompt === "string" ? firstRequest.prompt : "",
      ).toContain('"candidateCohort"');
      expect(runtime.bootstrap().weeklyActions).toEqual([
        expect.objectContaining({
          actionKey: "weekend:stash-candidate",
          kind: "stash",
          status: "pending",
        }),
      ]);
    } finally {
      runtime.store.close();
    }
  });
});

async function phaseRuntime(actions: WeeklyAction[] = []): Promise<AppRuntime> {
  const directory = await mkdtemp(
    join(tmpdir(), "sleeper-caffeine-phase-runtime-"),
  );
  const runtime = new AppRuntime(directory);
  runtime.store.saveLeague({
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
      record: "2-0",
    },
  });
  runtime.store.saveDashboard(dashboard(), {});
  runtime.store.saveAiSettings({ model: "gpt-test", effort: "high" });
  const context = weeklyContext();
  runtime.store.saveWeeklyContext({
    leagueId: "league-1",
    season: "2026",
    week: 3,
    phase: "tuesday",
    snapshotAt: "2026-09-22T12:00:00.000Z",
    contextHash: weeklyContextHash(context),
    context,
  });
  runtime.store.saveWeeklyPlan(weeklyPlan(), actions);
  return runtime;
}

function weeklyAction(
  actionKey: string,
  kind: WeeklyAction["kind"],
  playerIds: string[],
): WeeklyAction {
  return {
    id: `action-${actionKey}`,
    planId: "plan-1",
    leagueId: "league-1",
    season: "2026",
    week: 3,
    actionKey,
    kind,
    status: "pending",
    title: `Action ${actionKey}`,
    description: `Test ${actionKey} observation.`,
    priority: "soon",
    playerIds,
    rosterIds: [],
    dispositionNote: null,
    observedEventId: null,
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
    resolvedAt: null,
  };
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
      availableModels: [],
    }),
  } as unknown as CodexSupervisor;
}

function stableThursdayOutput(): ThursdayLineupOutput {
  return {
    headline: "Keep Starter Runner in the RB slot",
    summary: "No bench option has enough evidence to justify a change.",
    confidence: "high",
    slotAssignments: [{ slotIndex: 0, slot: "RB", playerId: "starter" }],
    recommendedMoves: [],
    closeCalls: [],
    flexNotes: [],
    sources: [
      {
        evidenceId: "source-1",
        title: "Official practice report",
        url: "https://example.com/practice",
        claim: "Starter Runner practiced in full on Thursday.",
        sourceType: "web",
        fetchedAt: "2026-09-24T18:00:00.000Z",
      },
    ],
    uncertainties: [],
  };
}

function dashboard(): Dashboard {
  return {
    league: {
      leagueId: "league-1",
      name: "Test League",
      season: "2026",
      rosterId: 1,
      userId: "user-1",
      teamName: "Test Team",
      avatar: null,
      lastRefreshedAt: "2026-09-22T12:00:00.000Z",
      isActive: true,
    },
    capturedAt: "2026-09-22T12:00:00.000Z",
    week: 3,
    leagueStatus: "in_season",
    scoringLabel: "PPR",
    rosterPositions: ["RB"],
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

function weeklyPlan(): WeeklyPlan {
  return {
    id: "plan-1",
    leagueId: "league-1",
    season: "2026",
    week: 3,
    version: 1,
    sourceSnapshotId: "snapshot-1",
    inputHash: "plan-input",
    evidenceHash: "plan-evidence",
    generatedAt: "2026-09-22T12:00:00.000Z",
    researchFreshThrough: "2026-09-23T00:00:00.000Z",
    model: "gpt-test",
    reasoningEffort: "high",
    promptVersion: "1",
    schemaVersion: "1",
    status: "current",
    statusReason: null,
    output: {
      headline: "Hold the core and monitor the last bench slot",
      summary: "The roster is strong enough to avoid forcing a waiver move.",
      confidence: "medium",
      competitiveLane: {
        lane: "contender",
        confidence: "medium",
        reasons: ["Strong points rank"],
        contraryEvidence: ["Thin receiver depth"],
      },
      actions: [],
      waiverClaims: [],
      addNow: [],
      watch: [],
      exit: [],
      rosterAudit: [],
      marketObservation: {
        headline: "Hold",
        recommendation: "Keep the current roster structure.",
        partnerRosterIds: [],
        alternatives: [],
        rationale: "No forced move is available.",
        sourceIds: [],
      },
      alternatives: [],
      sources: [],
      uncertainties: [],
      refreshTriggers: ["A material injury update"],
    },
    players: [planPlayer(starter), planPlayer(bench), planPlayer(candidate)],
    rosters: [{ rosterId: 2, teamName: "Other Team", avatar: null }],
    microSummary: null,
  };
}

function planPlayer(player: PlayerSummary) {
  return {
    playerId: player.player_id,
    name: player.name,
    position: player.position,
    nflTeam: player.team,
    injuryStatus: player.injury_status,
    status: player.status,
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
    key: { league_id: "league-1", season: "2026", week: 3 },
    captured_context: {
      nfl_state: { week: 3, season: "2026", season_type: "regular" },
      matchup_weeks: [1, 2, 3],
      trending_lookback_hours: 24,
    },
    league: {
      league_id: "league-1",
      name: "Test League",
      season: "2026",
      season_type: "regular",
      status: "in_season",
      total_rosters: 2,
      roster_positions: ["RB"],
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
      week: 3,
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
