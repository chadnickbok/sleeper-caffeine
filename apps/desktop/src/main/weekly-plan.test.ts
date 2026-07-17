import type {
  TuesdayPlanOutput,
  WatchlistEntry,
} from "@sleeper-caffeine/ipc-contract";
import type { PlayerSummary, WeeklyContextData } from "@sleeper-caffeine/core";
import { describe, expect, it } from "vitest";
import {
  buildTuesdayWatchlistEntries,
  buildWeeklyPlan,
  deriveWeeklyChanges,
  reconcileWeeklyPlan,
  selectTuesdayResearchCohort,
  weeklyContextHash,
} from "./weekly-plan.js";

const starter = player("starter", "Starter Runner", "RB", 30);
const drop = player("drop", "Low Ceiling Bench", "WR", 900);
const add = player("add", "Emerging Receiver", "WR", 220);

describe("weekly plan domain", () => {
  it("validates and enriches a structured Tuesday plan", () => {
    const context = weeklyContext();
    const built = buildWeeklyPlan({
      key: { leagueId: "league-1", season: "2026", week: 3 },
      context,
      output: tuesdayOutput(),
      snapshotId: "snapshot-1",
      inputHash: weeklyContextHash(context),
      version: 1,
      model: "gpt-test",
      reasoningEffort: "high",
      generatedAt: "2026-09-22T12:00:00.000Z",
    });

    expect(built.plan.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: "add", name: "Emerging Receiver" }),
        expect.objectContaining({
          playerId: "drop",
          name: "Low Ceiling Bench",
        }),
      ]),
    );
    expect(built.plan.rosters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rosterId: 2, teamName: "Trade Partner" }),
      ]),
    );
    expect(built.actions).toHaveLength(1);
    expect(built.actions[0]).toMatchObject({
      status: "pending",
      playerIds: ["add", "drop"],
    });
    expect(built.evidence[0]).toMatchObject({
      id: "source-1",
      playerId: null,
      effectiveWeek: 3,
    });
  });

  it("rejects recommendations outside the frozen available-player cohort", () => {
    const output = tuesdayOutput();
    output.waiverClaims[0] = {
      ...output.waiverClaims[0]!,
      addPlayerId: "unknown-player",
    };
    expect(() =>
      buildWeeklyPlan({
        key: { leagueId: "league-1", season: "2026", week: 3 },
        context: weeklyContext(),
        output,
        snapshotId: "snapshot-1",
        inputHash: "input-1",
        version: 1,
        model: "gpt-test",
        reasoningEffort: "high",
      }),
    ).toThrow("not available in the frozen context");
  });

  it("rejects duplicate waiver targets", () => {
    const output = tuesdayOutput();
    output.waiverClaims.push({
      ...output.waiverClaims[0]!,
      priority: 2,
    });

    expect(() => build(output)).toThrow("duplicate waiver add target");
  });

  it("requires claims sharing a drop slot to share one contingency group", () => {
    const context = weeklyContextWithSecondCandidate();
    const output = tuesdayOutput();
    output.waiverClaims.push({
      ...output.waiverClaims[0]!,
      priority: 2,
      addPlayerId: "add-two",
      contingencyGroup: "different-drop-plan",
    });

    expect(() => build(output, context)).toThrow(
      "must use the same contingency group",
    );
  });

  it("does not let one contingency group span different drop slots", () => {
    const context = weeklyContextWithSecondCandidate();
    const output = tuesdayOutput();
    output.waiverClaims.push({
      ...output.waiverClaims[0]!,
      priority: 2,
      addPlayerId: "add-two",
      dropPlayerId: "starter",
    });

    expect(() => build(output, context)).toThrow(
      "cannot span different drop slots",
    );
  });

  it("requires null FAAB ranges in non-FAAB leagues", () => {
    const context = weeklyContext();
    context.league.waiver_type = 0;
    context.league.faab_starting_budget = null;
    expect(() => build(tuesdayOutput(), context)).toThrow(
      "Non-FAAB leagues must use null",
    );

    const output = tuesdayOutput();
    output.waiverClaims[0] = {
      ...output.waiverClaims[0]!,
      faabPercentMin: null,
      faabPercentTarget: null,
      faabPercentMax: null,
    };
    expect(() => build(output, context)).not.toThrow();
  });

  it("requires a complete, duplicate-free audit of the frozen roster", () => {
    const missing = tuesdayOutput();
    missing.rosterAudit = missing.rosterAudit.filter(
      (assessment) => assessment.playerId !== "starter",
    );
    expect(() => build(missing)).toThrow(
      "Roster audit is missing current roster player: starter",
    );

    const duplicate = tuesdayOutput();
    duplicate.rosterAudit.push({ ...duplicate.rosterAudit[0]! });
    expect(() => build(duplicate)).toThrow("duplicate roster audit player");

    const extra = tuesdayOutput();
    extra.rosterAudit.push({
      playerId: "not-on-roster",
      purposes: [],
      rationale: "Invalid extra row.",
      confidence: "low",
    });
    expect(() => build(extra)).toThrow(
      "Roster audit player not-on-roster is not on the selected roster",
    );
  });

  it("requires consecutive, unambiguous exit ranks", () => {
    const output = tuesdayOutput();
    output.exit[0] = { ...output.exit[0]!, dropRank: 2 };
    expect(() => build(output)).toThrow(
      "Exit ranks must be consecutive and start at one",
    );
  });

  it("requires inspectable evidence for material recommendations", () => {
    const uncited = tuesdayOutput();
    uncited.exit[0] = { ...uncited.exit[0]!, sourceIds: [] };
    expect(() => build(uncited)).toThrow(
      "Every exit recommendation needs at least one inspectable source",
    );

    const uncitedMarket = tuesdayOutput();
    uncitedMarket.marketObservation.sourceIds = [];
    expect(() => build(uncitedMarket)).toThrow(
      "Every trade-market recommendation needs at least one inspectable source",
    );

    const unidentified = tuesdayOutput();
    unidentified.sources[0] = {
      ...unidentified.sources[0]!,
      evidenceId: null,
    };
    expect(() => build(unidentified)).toThrow(
      "Every weekly-plan source needs an evidence ID",
    );

    const duplicateEvidence = tuesdayOutput();
    duplicateEvidence.sources.push({
      ...duplicateEvidence.sources[0]!,
      title: "Duplicate evidence ID",
    });
    expect(() => build(duplicateEvidence)).toThrow(
      "duplicate source evidence ID",
    );

    const inaccessible = tuesdayOutput();
    inaccessible.sources[0] = {
      ...inaccessible.sources[0]!,
      url: null,
    };
    expect(() => build(inaccessible)).toThrow("needs an inspectable URL");
  });

  it("allows an evidence-free plan when it contains no material actions", () => {
    const output = tuesdayOutput();
    output.actions = [];
    output.waiverClaims = [];
    output.addNow = [];
    output.watch = [];
    output.exit = [];
    output.marketObservation = {
      headline: "No trade window this week",
      recommendation: "Hold the current construction.",
      partnerRosterIds: [],
      alternatives: [],
      rationale: "There is no specific counterparty worth approaching.",
      sourceIds: [],
    };
    output.alternatives = [];
    output.sources = [];

    expect(() => build(output)).not.toThrow();
  });

  it("reserves bounded research slots for available active Watch players", () => {
    const context = weeklyContext();
    const template = context.available_candidate_pool.players[0]!;
    context.available_candidate_pool.players = Array.from(
      { length: 16 },
      (_, index) => ({
        ...template,
        player_id: `candidate-${String(index + 1)}`,
        name: `Candidate ${String(index + 1)}`,
        baseline_rank: index + 1,
      }),
    );

    const cohort = selectTuesdayResearchCohort(context, [
      watchlistEntry("candidate-16", "triggered"),
    ]);
    expect(cohort).toHaveLength(15);
    expect(cohort.map((player) => player.player_id)).toContain("candidate-16");
    expect(cohort.map((player) => player.player_id)).not.toContain(
      "candidate-15",
    );

    const dismissed = selectTuesdayResearchCohort(context, [
      watchlistEntry("candidate-16", "dismissed"),
    ]);
    expect(dismissed.map((player) => player.player_id)).not.toContain(
      "candidate-16",
    );
  });

  it("builds durable Tuesday Watch entries keyed by league and player", () => {
    const output = tuesdayOutput();
    output.watch = [
      {
        playerId: "add",
        headline: "One more usage checkpoint",
        rationale: "The role becomes actionable if routes hold.",
        trigger: "Route participation remains above 65 percent.",
        confidence: "medium",
        sourceIds: ["source-1"],
      },
    ];
    const first = buildTuesdayWatchlistEntries({
      key: { leagueId: "league-1", season: "2026", week: 3 },
      output,
      generatedAt: "2026-09-22T12:00:00.000Z",
    })[0]!;
    const nextWeek = buildTuesdayWatchlistEntries({
      key: { leagueId: "league-1", season: "2026", week: 4 },
      output,
      generatedAt: "2026-09-29T12:00:00.000Z",
    })[0]!;

    expect(first).toMatchObject({
      playerId: "add",
      state: "active",
      expiresSeason: "2026",
      expiresWeek: 4,
      trigger: "Route participation remains above 65 percent.",
    });
    expect(first.hypothesis).toContain("One more usage checkpoint");
    expect(nextWeek.id).toBe(first.id);
  });

  it("distinguishes material data changes from research staleness", () => {
    const context = weeklyContext();
    const built = buildWeeklyPlan({
      key: { leagueId: "league-1", season: "2026", week: 3 },
      context,
      output: tuesdayOutput(),
      snapshotId: "snapshot-1",
      inputHash: weeklyContextHash(context),
      version: 1,
      model: "gpt-test",
      reasoningEffort: "high",
      generatedAt: "2026-09-22T12:00:00.000Z",
    });
    const changed = reconcileWeeklyPlan({
      plan: built.plan,
      contextHash: "different",
      changes: [
        {
          id: "change-1",
          kind: "roster",
          headline: "Roster changed",
          description: "A player was added.",
          entityType: "player",
          entityId: "add",
          occurredAt: "2026-09-22T13:00:00.000Z",
          detectedAt: "2026-09-22T13:00:00.000Z",
          material: true,
          sourceEventId: null,
        },
      ],
      now: Date.parse("2026-09-22T13:00:00.000Z"),
    });
    expect(changed.status).toBe("data_changed");

    const stale = reconcileWeeklyPlan({
      plan: built.plan,
      contextHash: built.plan.inputHash,
      changes: [],
      now: Date.parse("2026-09-23T01:00:00.001Z"),
    });
    expect(stale.status).toBe("research_stale");
  });

  it("describes roster, transaction, and player-status changes", () => {
    const previous = weeklyContext();
    const current = weeklyContext();
    current.my_team.all_players = [starter, add];
    current.my_team.bench = [add];
    current.league_rosters[0]!.all_players = [starter, add];
    current.available_candidate_pool.players = [];
    current.current_week_transactions.events = [
      {
        event_id: "transaction:tx-1",
        event_type: "transaction",
        week: 3,
        occurred_at: 1_795_000_000_000,
        transaction_type: "waiver",
        status: "complete",
        roster_ids: [1],
        player_ids: ["add", "drop"],
        transaction: {
          transaction_id: "tx-1",
          type: "waiver",
          status: "complete",
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

    const changes = deriveWeeklyChanges(
      previous,
      current,
      "2026-09-22T13:00:00.000Z",
    );
    expect(changes.map((change) => change.kind)).toEqual(
      expect.arrayContaining(["roster", "waiver"]),
    );
  });
});

function watchlistEntry(
  playerId: string,
  state: WatchlistEntry["state"],
): WatchlistEntry {
  return {
    id: `watch-${playerId}`,
    leagueId: "league-1",
    playerId,
    hypothesis: "The role may grow.",
    trigger: "Usage remains elevated.",
    state,
    createdSeason: "2026",
    createdWeek: 2,
    expiresSeason: "2026",
    expiresWeek: 4,
    createdAt: "2026-09-15T12:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };
}

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
    depth_chart_order: 2,
    depth_chart_position: position,
    years_exp: 1,
    search_rank: searchRank,
    number: null,
  };
}

function weeklyContext(): WeeklyContextData {
  const standing = {
    roster_id: 1,
    wins: 2,
    losses: 0,
    ties: 0,
    points_for: 250,
    points_against: 180,
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
    bench: [drop],
    reserve: [],
    taxi: [],
    all_players: [starter, drop],
    standings: standing,
    faab: {
      starting_budget: 100,
      used: 10,
      remaining: 90,
      waiver_position: 6,
    },
  };
  const otherStanding = { ...standing, roster_id: 2, record_rank: 2 };
  const otherRoster = {
    roster_id: 2,
    owner_id: "user-2",
    co_owner_ids: [],
    username: "other",
    display_name: "Other Manager",
    team_name: "Trade Partner",
    settings: {},
    starters: [],
    bench: [],
    reserve: [],
    taxi: [],
    all_players: [],
    standings: otherStanding,
    faab: {
      starting_budget: 100,
      used: 0,
      remaining: 100,
      waiver_position: 1,
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
      roster_positions: ["RB", "WR", "FLEX"],
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
    league_table: [standing, otherStanding],
    recent_matchups: [],
    current_week_transactions: {
      week: 3,
      raw: [],
      normalized: [],
      events: [],
    },
    trending: {
      lookback_hours: 24,
      adds: [{ player_id: "add", count: 100, player: add }],
      drops: [],
    },
    available_candidate_pool: {
      definition: "Absent from all rosters",
      total_returned: 1,
      limit: 40,
      players: [
        {
          ...add,
          roster_availability: true,
          baseline_rank: 1,
          baseline_score: 70,
          trending_add_count: 100,
          trending_drop_count: 0,
          signals: [{ code: "trending_add", value: 100, score: 45 }],
        },
      ],
    },
    limitations: [],
  };
}

function weeklyContextWithSecondCandidate(): WeeklyContextData {
  const context = weeklyContext();
  const candidate = context.available_candidate_pool.players[0]!;
  context.available_candidate_pool.players.push({
    ...candidate,
    player_id: "add-two",
    name: "Fallback Receiver",
    baseline_rank: 2,
  });
  return context;
}

function build(
  output: TuesdayPlanOutput,
  context: WeeklyContextData = weeklyContext(),
) {
  return buildWeeklyPlan({
    key: { leagueId: "league-1", season: "2026", week: 3 },
    context,
    output,
    snapshotId: "snapshot-1",
    inputHash: weeklyContextHash(context),
    version: 1,
    model: "gpt-test",
    reasoningEffort: "high",
    generatedAt: "2026-09-22T12:00:00.000Z",
  });
}

function tuesdayOutput(): TuesdayPlanOutput {
  return {
    headline: "Turn the final bench spot into immediate upside",
    summary: "Claim Emerging Receiver and keep the bid disciplined.",
    confidence: "medium",
    competitiveLane: {
      lane: "contender",
      confidence: "medium",
      reasons: ["First by record"],
      contraryEvidence: ["Shallow receiver depth"],
    },
    actions: [
      {
        actionKey: "claim-emerging-receiver",
        kind: "waiver_claim",
        title: "Claim Emerging Receiver",
        description: "Bid seven percent and drop Low Ceiling Bench.",
        priority: "now",
        playerIds: ["add", "drop"],
        rosterIds: [],
        confidence: "medium",
        keyUncertainty: "The expanded role is a one-week sample.",
        sourceIds: ["source-1"],
      },
    ],
    waiverClaims: [
      {
        priority: 1,
        addPlayerId: "add",
        dropPlayerId: "drop",
        contingencyGroup: "bench-upgrade",
        faabPercentMin: 5,
        faabPercentTarget: 7,
        faabPercentMax: 10,
        rationale: "The role is worth a measured bid.",
        confidence: "medium",
        sourceIds: ["source-1"],
      },
    ],
    addNow: [
      {
        playerId: "add",
        headline: "The role expanded",
        rationale: "Routes and targets increased.",
        confidence: "medium",
        sourceIds: ["source-1"],
      },
    ],
    watch: [],
    exit: [
      {
        playerId: "drop",
        headline: "No clear path to relevance",
        rationale: "This spot can create more optionality.",
        confidence: "high",
        sourceIds: ["source-1"],
        dropRank: 1,
        rosterPurposes: [],
      },
    ],
    rosterAudit: [
      {
        playerId: "starter",
        purposes: ["start"],
        rationale: "A weekly starter in this league format.",
        confidence: "high",
      },
      {
        playerId: "drop",
        purposes: [],
        rationale: "Not starting, insuring, appreciating, or ready to pop.",
        confidence: "high",
      },
    ],
    marketObservation: {
      headline: "Test the receiver market",
      recommendation: "Ask Trade Partner about a veteran receiver.",
      partnerRosterIds: [2],
      alternatives: ["Hold through Thursday"],
      rationale: "The roster can consolidate bench value.",
      sourceIds: ["source-1"],
    },
    alternatives: [],
    sources: [
      {
        evidenceId: "source-1",
        title: "Official team notes",
        url: "https://example.com/notes",
        claim: "Emerging Receiver handled the expanded route role.",
        sourceType: "web",
        fetchedAt: "2026-09-22T12:00:00.000Z",
      },
    ],
    uncertainties: ["The usage sample is one game."],
    refreshTriggers: ["A meaningful practice-status change"],
  };
}
