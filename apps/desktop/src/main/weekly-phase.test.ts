import type {
  ThursdayLineupOutput,
  WeeklyAction,
  WeekendCheckOutput,
} from "@sleeper-caffeine/ipc-contract";
import type { PlayerSummary, WeeklyContextData } from "@sleeper-caffeine/core";
import { describe, expect, it } from "vitest";
import {
  buildWednesdayAftermath,
  buildWeeklyPhaseBrief,
  weeklyPhaseInputHash,
} from "./weekly-phase.js";

const quarterback = player("qb", "Certain Quarterback", "QB");
const receiver = player("wr", "Starting Receiver", "WR");
const runner = player("rb", "Bench Runner", "RB");
const dropped = player("free", "Newly Free Receiver", "WR");

describe("weekly phase domain", () => {
  it("builds the Wednesday aftermath from Sleeper transactions without AI", () => {
    const context = weeklyContext();
    context.current_week_transactions.normalized = [
      {
        transaction_id: "tx-1",
        type: "waiver",
        status: "complete",
        created: 1_800_000_000_000,
        status_updated: 1_800_000_000_000,
        leg: null,
        creator: "user-1",
        roster_ids: [1, 2],
        consenter_ids: [],
        adds: [{ player_id: "rb", roster_id: 1, player: runner }],
        drops: [{ player_id: "free", roster_id: 2, player: dropped }],
        draft_picks: [],
        waiver_budget: [],
        faab_bid: 7,
        settings: { waiver_bid: 7 },
        metadata: null,
      },
    ];
    const output = buildWednesdayAftermath({
      context,
      actions: [weeklyAction()],
      capturedAt: "2026-09-23T15:00:00.000Z",
    });

    expect(output.observedActions[0]).toMatchObject({
      actionKey: "add-runner",
      outcome: "completed",
      faabAmount: 7,
    });
    expect(output.newlyFreePlayers[0]).toMatchObject({
      playerId: "free",
      recommendedAction: "add_now",
    });
    expect(output.sources).toHaveLength(1);
  });

  it("accepts a complete legal lineup and persists move actions", () => {
    const context = weeklyContext();
    const output = lineupOutput();
    const built = buildWeeklyPhaseBrief({
      key: { leagueId: "league-1", season: "2026", week: 3 },
      phase: "thursday",
      context,
      output,
      snapshotId: "snapshot-1",
      sourcePlanId: "plan-1",
      inputHash: weeklyPhaseInputHash({
        context,
        sourcePlanId: "plan-1",
        sourcePlanHash: "plan-input",
        phase: "thursday",
      }),
      dataFreshThrough: "2026-09-24T15:00:00.000Z",
      version: 1,
      model: "gpt-test",
      reasoningEffort: "high",
      generatedAt: "2026-09-24T15:00:00.000Z",
    });

    expect(built.brief.phase).toBe("thursday");
    expect(built.actions).toEqual([
      expect.objectContaining({
        actionKey: "thursday:flex-runner",
        kind: "lineup_move",
        playerIds: ["rb", "wr"],
      }),
    ]);
    expect(built.evidence[0]).toMatchObject({ category: "projection" });
  });

  it("rejects an ineligible lineup assignment", () => {
    const context = weeklyContext();
    const output = lineupOutput();
    output.slotAssignments[0] = {
      slotIndex: 0,
      slot: "QB",
      playerId: "rb",
    };
    output.slotAssignments[2] = {
      slotIndex: 2,
      slot: "FLEX",
      playerId: "qb",
    };
    expect(() =>
      buildWeeklyPhaseBrief({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        phase: "thursday",
        context,
        output,
        snapshotId: "snapshot-1",
        sourcePlanId: "plan-1",
        inputHash: "input-1",
        dataFreshThrough: "2026-09-24T15:00:00.000Z",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("not eligible for QB");
  });

  it("rejects lineup moves and close calls that are not grounded in the current roster", () => {
    const context = weeklyContext();
    const wrongReplacement = lineupOutput();
    wrongReplacement.recommendedMoves[0]!.replacePlayerId = "qb";
    expect(() =>
      buildWeeklyPhaseBrief({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        phase: "thursday",
        context,
        output: wrongReplacement,
        snapshotId: "snapshot-1",
        sourcePlanId: "plan-1",
        inputHash: "input-1",
        dataFreshThrough: "2026-09-24T15:00:00.000Z",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("must replace current starter wr");

    const offRosterCloseCall = lineupOutput();
    offRosterCloseCall.closeCalls = [
      {
        slotIndex: 2,
        chosenPlayerId: "rb",
        alternativePlayerId: "free",
        rationale: "Compare the two roles.",
        projectedPointDelta: null,
        flipConditions: ["A workload change"],
        confidence: "medium",
        sourceIds: ["source-1"],
      },
    ];
    expect(() =>
      buildWeeklyPhaseBrief({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        phase: "thursday",
        context,
        output: offRosterCloseCall,
        snapshotId: "snapshot-1",
        sourcePlanId: "plan-1",
        inputHash: "input-1",
        dataFreshThrough: "2026-09-24T15:00:00.000Z",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("Close-call players must be on the active roster");
  });

  it("requires inspectable, uniquely identified sources for material phase advice", () => {
    const context = weeklyContext();
    const uncited = lineupOutput();
    uncited.recommendedMoves[0]!.sourceIds = [];
    expect(() =>
      buildWeeklyPhaseBrief({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        phase: "thursday",
        context,
        output: uncited,
        snapshotId: "snapshot-1",
        sourcePlanId: "plan-1",
        inputHash: "input-1",
        dataFreshThrough: "2026-09-24T15:00:00.000Z",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("at least one inspectable source");

    const anonymousSource = lineupOutput();
    anonymousSource.sources[0]!.evidenceId = null;
    expect(() =>
      buildWeeklyPhaseBrief({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        phase: "thursday",
        context,
        output: anonymousSource,
        snapshotId: "snapshot-1",
        sourcePlanId: "plan-1",
        inputHash: "input-1",
        dataFreshThrough: "2026-09-24T15:00:00.000Z",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("needs an evidence ID");
  });

  it("rejects a weekend stash outside the frozen available cohort", () => {
    const context = weeklyContext();
    const output: WeekendCheckOutput = {
      headline: "Protect the late window",
      summary: "Keep flexibility and churn only the final roster spot.",
      confidence: "medium",
      criticalStatusAlerts: [],
      flexibilityNotes: [],
      stashCandidates: [
        {
          playerId: "unknown",
          headline: "Unknown stash",
          rationale: "Not in the cohort.",
          confidence: "low",
          sourceIds: ["source-1"],
          dropPlayerId: null,
          window: "sunday_late",
          trigger: "Inactive starter",
        },
      ],
      actions: [],
      sources: [source()],
      uncertainties: [],
    };
    expect(() =>
      buildWeeklyPhaseBrief({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        phase: "weekend",
        context,
        output,
        snapshotId: "snapshot-1",
        sourcePlanId: "plan-1",
        inputHash: "input-1",
        dataFreshThrough: "2026-09-27T15:00:00.000Z",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("not available in the frozen context");
  });

  it("keeps weekend inactive and flexibility advice scoped to my roster", () => {
    const context = weeklyContext();
    const output: WeekendCheckOutput = {
      headline: "Keep the late window flexible",
      summary: "No outside-roster inactive checks belong in this plan.",
      confidence: "medium",
      criticalStatusAlerts: [],
      flexibilityNotes: [
        {
          headline: "Invalid outside player",
          rationale: "This should be rejected.",
          playerIds: ["free"],
          slotIndexes: [2],
        },
      ],
      stashCandidates: [],
      actions: [],
      sources: [source()],
      uncertainties: [],
    };
    expect(() =>
      buildWeeklyPhaseBrief({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        phase: "weekend",
        context,
        output,
        snapshotId: "snapshot-1",
        sourcePlanId: "plan-1",
        inputHash: "input-1",
        dataFreshThrough: "2026-09-27T15:00:00.000Z",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("is not on the selected roster");
  });
});

function lineupOutput(): ThursdayLineupOutput {
  return {
    headline: "Move the runner into the flex",
    summary: "Keep the quarterback fixed and use the stronger role at flex.",
    confidence: "medium",
    slotAssignments: [
      { slotIndex: 0, slot: "QB", playerId: "qb" },
      { slotIndex: 1, slot: "WR", playerId: "wr" },
      { slotIndex: 2, slot: "FLEX", playerId: "rb" },
    ],
    recommendedMoves: [
      {
        actionKey: "flex-runner",
        playerId: "rb",
        replacePlayerId: "wr",
        fromSlotIndex: null,
        toSlotIndex: 2,
        rationale: "The runner has the clearer workload.",
        confidence: "medium",
        sourceIds: ["source-1"],
      },
    ],
    closeCalls: [],
    flexNotes: [],
    sources: [source()],
    uncertainties: [],
  };
}

function source() {
  return {
    evidenceId: "source-1",
    title: "Official team update",
    url: "https://example.com/update",
    claim: "The workload is expected to continue.",
    sourceType: "web" as const,
    fetchedAt: "2026-09-24T14:00:00.000Z",
  };
}

function weeklyAction(): WeeklyAction {
  return {
    leagueId: "league-1",
    season: "2026",
    week: 3,
    id: "action-1",
    planId: "plan-1",
    actionKey: "add-runner",
    kind: "waiver_claim",
    status: "pending",
    title: "Add Bench Runner",
    description: "Claim the runner.",
    priority: "now",
    playerIds: ["rb"],
    rosterIds: [],
    dispositionNote: null,
    observedEventId: null,
    createdAt: "2026-09-22T15:00:00.000Z",
    updatedAt: "2026-09-22T15:00:00.000Z",
    resolvedAt: null,
  };
}

function player(id: string, name: string, position: string): PlayerSummary {
  return {
    player_id: id,
    name,
    position,
    fantasy_positions: [position],
    team: "TST",
    status: "Active",
    injury_status: null,
    depth_chart_order: 1,
    depth_chart_position: position,
    years_exp: 2,
    search_rank: 100,
    number: null,
  };
}

function weeklyContext(): WeeklyContextData {
  const standing = {
    roster_id: 1,
    wins: 2,
    losses: 0,
    ties: 0,
    points_for: 240,
    points_against: 180,
    waiver_position: 4,
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
    starters: [
      { ...quarterback, starter_slot: "QB" },
      { ...receiver, starter_slot: "WR" },
      { ...receiver, starter_slot: "FLEX" },
    ],
    bench: [runner],
    reserve: [],
    taxi: [],
    all_players: [quarterback, receiver, runner],
    standings: standing,
    faab: {
      starting_budget: 100,
      used: 10,
      remaining: 90,
      waiver_position: 4,
    },
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
      roster_positions: ["QB", "WR", "FLEX", "BN"],
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
    league_rosters: [
      myRoster,
      {
        ...myRoster,
        roster_id: 2,
        owner_id: "user-2",
        username: "other",
        display_name: "Other",
        team_name: "Other Team",
        starters: [],
        bench: [],
        all_players: [],
        standings: { ...standing, roster_id: 2, record_rank: 2 },
      },
    ],
    league_table: [standing, { ...standing, roster_id: 2, record_rank: 2 }],
    recent_matchups: [],
    current_week_transactions: {
      week: 3,
      raw: [],
      normalized: [],
      events: [],
    },
    trending: { lookback_hours: 24, adds: [], drops: [] },
    available_candidate_pool: {
      definition: "Absent from every roster",
      total_returned: 1,
      limit: 40,
      players: [
        {
          ...dropped,
          roster_availability: true,
          baseline_rank: 1,
          baseline_score: 80,
          trending_add_count: 30,
          trending_drop_count: 0,
          signals: [],
        },
      ],
    },
    limitations: [],
  };
}
