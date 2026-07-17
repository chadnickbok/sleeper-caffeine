import { describe, expect, it } from "vitest";
import {
  baselineRosterPurposes,
  diffRosterOwnership,
  diffPlayerSignals,
  getAvailablePlayers,
  getLeagueHistory,
  getMatchupContext,
  getTeamSnapshot,
  getTradeContext,
  getWeeklyContext,
  optimizeLegalLineup,
  startingLineupSlots,
  type PlayerSummary,
  type Roster,
} from "@sleeper-caffeine/core";
import { createFixtureDependencies } from "../helpers.js";

describe("Sleeper domain services", () => {
  it("joins a team snapshot and finds its opponent", async () => {
    const result = await getTeamSnapshot(await createFixtureDependencies(), {
      league_id: "12345",
      username_or_user_id: "manager_one",
      week: 3,
    });

    const team = result.data["team"] as {
      starters: Array<{ name: string }>;
      bench: Array<{ name: string }>;
    };
    const matchup = result.data["matchup"] as {
      opponent: { roster_id: number };
    };
    expect(team.starters[0]?.name).toBe("Alice Quarterback");
    expect(team.bench[0]?.name).toBe("Bob Runner");
    expect(matchup.opponent.roster_id).toBe(2);
    expect(result.cache?.players_stale).toBe(false);
  });

  it("derives and ranks roster availability without including inactive players", async () => {
    const result = await getAvailablePlayers(
      await createFixtureDependencies(),
      {
        league_id: "12345",
        include_inactive: false,
        sort: "trending",
        limit: 30,
      },
    );
    const players = result.data["players"] as Array<{
      player_id: string;
      roster_availability: boolean;
      trending_add_count: number | null;
    }>;

    expect(players.map((player) => player.player_id)).toEqual([
      "p4",
      "p6",
      "SEA",
    ]);
    expect(players[0]).toMatchObject({
      roster_availability: true,
      trending_add_count: 42,
    });
    expect(players.some((player) => player.player_id === "p5")).toBe(false);
  });

  it("returns factual matchup context", async () => {
    const result = await getMatchupContext(await createFixtureDependencies(), {
      league_id: "12345",
      username_or_user_id: "u1",
      week: 3,
    });
    expect(result.data["matchup_id"]).toBe(7);
    expect((result.data["opponent"] as { roster_id: number }).roster_id).toBe(
      2,
    );
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_PLAYER_0" }),
    );
  });

  it("joins requested trade transactions", async () => {
    const result = await getTradeContext(await createFixtureDependencies(), {
      league_id: "12345",
      username_or_user_id: "u1",
      transaction_weeks: [3],
    });
    const transactionGroups = result.data["transactions"] as Array<{
      week: number;
      transactions: Array<{
        transaction_id: string;
        faab_bid: number | null;
        settings: Record<string, unknown> | null;
        metadata: Record<string, unknown> | null;
      }>;
    }>;
    expect(transactionGroups[0]).toMatchObject({ week: 3 });
    expect(transactionGroups[0]?.transactions[0]?.transaction_id).toBe("tx1");
    expect(transactionGroups[0]?.transactions[1]).toMatchObject({
      transaction_id: "tx2",
      faab_bid: 17,
      settings: { waiver_bid: 17, sequence: 1 },
      metadata: { notes: "Player was no longer available" },
    });
  });

  it("builds a complete deterministic weekly context by roster ID", async () => {
    const result = await getWeeklyContext(await createFixtureDependencies(), {
      league_id: "12345",
      roster_id: 1,
      week: 3,
      recent_matchup_weeks: 3,
      trending_lookback_hours: 24,
      candidate_limit: 10,
    });
    const myTeam = result.data["my_team"] as {
      roster_id: number;
      settings: Record<string, unknown>;
      faab: { remaining: number };
      all_players: Array<{
        player_id: string;
        depth_chart_position?: string | number | null;
      }>;
      roster_purpose_baseline: Array<{
        player_id: string;
        purposes: string[];
      }>;
    };
    const weeklyTransactions = result.data["current_week_transactions"] as {
      raw: Array<{
        transaction_id: string;
        settings?: Record<string, unknown> | null;
        metadata?: Record<string, unknown> | null;
      }>;
      normalized: Array<{
        transaction_id: string;
        faab_bid: number | null;
      }>;
      events: Array<{ event_id: string }>;
    };
    const trending = result.data["trending"] as {
      adds: Array<{ player_id: string }>;
      drops: Array<{ player_id: string }>;
    };
    const candidates = result.data["available_candidate_pool"] as {
      players: Array<{
        player_id: string;
        baseline_rank: number;
        trending_add_count: number;
        trending_drop_count: number;
      }>;
    };

    expect(myTeam).toMatchObject({
      roster_id: 1,
      settings: { wins: 2, waiver_budget_used: 10 },
      faab: { remaining: 90 },
    });
    expect(myTeam.all_players[0]).toMatchObject({
      player_id: "p1",
      depth_chart_position: "QB",
    });
    const startingPurpose = myTeam.roster_purpose_baseline.find(
      (assessment) => assessment.player_id === "p1",
    );
    expect(startingPurpose?.purposes).toContain("start");
    expect(startingPurpose?.purposes).toContain("pop");
    expect(result.data["league_rosters"]).toHaveLength(2);
    expect(result.data["recent_matchups"]).toHaveLength(3);
    expect(weeklyTransactions.raw[1]).toMatchObject({
      transaction_id: "tx2",
      settings: { waiver_bid: 17, sequence: 1 },
      metadata: { notes: "Player was no longer available" },
    });
    expect(weeklyTransactions.normalized[1]).toMatchObject({
      transaction_id: "tx2",
      faab_bid: 17,
    });
    expect(weeklyTransactions.events.map((event) => event.event_id)).toEqual([
      "transaction:tx1",
      "transaction:tx2",
    ]);
    expect(trending.adds[0]?.player_id).toBe("p4");
    expect(trending.drops[0]?.player_id).toBe("p6");
    expect(candidates.players[0]).toMatchObject({
      player_id: "p4",
      baseline_rank: 1,
      trending_add_count: 42,
      trending_drop_count: 2,
    });
    expect(candidates.players.map((player) => player.player_id)).toEqual([
      "p4",
      "p6",
    ]);
  });

  it("adds retrospective optimal points only for complete matchup scoring", async () => {
    const league = {
      league_id: "12345",
      name: "Fixture League",
      season: "2026",
      season_type: "regular",
      status: "in_season",
      sport: "nfl",
      total_rosters: 2,
      roster_positions: ["QB", "FLEX", "BN"],
      scoring_settings: { rec: 1, pass_td: 4 },
      settings: { waiver_type: 2, waiver_budget: 100 },
      previous_league_id: null,
      draft_id: "draft1",
    };
    const rosters = [
      {
        roster_id: 1,
        owner_id: "u1",
        players: ["p1", "p2", "p4"],
        starters: ["p1", "p2"],
        settings: { wins: 2, waiver_budget_used: 10 },
      },
      {
        roster_id: 2,
        owner_id: "u2",
        players: ["p3", "p6"],
        starters: ["p3", "p6"],
        settings: { wins: 1, waiver_budget_used: 0 },
      },
    ];
    const matchup = {
      roster_id: 1,
      matchup_id: 7,
      players: ["p1", "p2", "p4"],
      starters: ["p1", "p2"],
      points: 17,
      players_points: { p1: 12, p2: 5, p4: 15 },
    };
    const complete = await getWeeklyContext(
      await createFixtureDependencies({
        "/v1/league/12345": league,
        "/v1/league/12345/rosters": rosters,
        "/v1/league/12345/matchups/3": [matchup],
      }),
      {
        league_id: "12345",
        roster_id: 1,
        week: 3,
        recent_matchup_weeks: 1,
        trending_lookback_hours: 24,
        candidate_limit: 10,
      },
    );
    const completeMatchup = complete.data.recent_matchups[0]?.matchups[0];
    expect(completeMatchup?.optimal_lineup).toMatchObject({
      actual_starter_points: 17,
      optimal_points: 27,
      points_left_on_bench: 10,
      assignments: [
        { slot: "QB", player_id: "p1", points: 12 },
        { slot: "FLEX", player_id: "p4", points: 15 },
      ],
    });

    const incomplete = await getWeeklyContext(
      await createFixtureDependencies({
        "/v1/league/12345": league,
        "/v1/league/12345/rosters": rosters,
        "/v1/league/12345/matchups/3": [
          { ...matchup, players_points: { p1: 12, p2: 5 } },
        ],
      }),
      {
        league_id: "12345",
        roster_id: 1,
        week: 3,
        recent_matchup_weeks: 1,
        trending_lookback_hours: 24,
        candidate_limit: 10,
      },
    );
    expect(
      incomplete.data.recent_matchups[0]?.matchups[0]?.optimal_lineup,
    ).toBeNull();
  });

  it("resolves weekly context by username and validates dual selectors", async () => {
    const dependencies = await createFixtureDependencies();
    const result = await getWeeklyContext(dependencies, {
      league_id: "12345",
      username_or_user_id: "manager_one",
      week: 3,
      recent_matchup_weeks: 1,
      trending_lookback_hours: 24,
      candidate_limit: 10,
    });
    expect(result.data["my_team"]).toMatchObject({
      roster_id: 1,
      identity: { user_id: "u1", username: "manager_one" },
    });

    await expect(
      getWeeklyContext(dependencies, {
        league_id: "12345",
        roster_id: 2,
        username_or_user_id: "manager_one",
        week: 3,
        recent_matchup_weeks: 1,
        trending_lookback_hours: 24,
        candidate_limit: 10,
      }),
    ).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
  });

  it("emits stable ownership changes without duplicates", () => {
    const previous = [
      { roster_id: 1, players: ["p1", "p2"] },
      { roster_id: 2, players: ["p3"] },
    ] as Roster[];
    const current = [
      { roster_id: 1, players: ["p1", "p3"] },
      { roster_id: 2, players: ["p4", "p4"] },
    ] as Roster[];

    expect(diffRosterOwnership(previous, current)).toEqual([
      {
        change_id: "ownership:p2:1:free",
        kind: "roster_drop",
        player_id: "p2",
        from_roster_id: 1,
        to_roster_id: null,
      },
      {
        change_id: "ownership:p3:2:1",
        kind: "roster_move",
        player_id: "p3",
        from_roster_id: 2,
        to_roster_id: 1,
      },
      {
        change_id: "ownership:p4:free:2",
        kind: "roster_add",
        player_id: "p4",
        from_roster_id: null,
        to_roster_id: 2,
      },
    ]);
  });

  it("detects material player signal changes in stable order", () => {
    const baseline = {
      player_id: "p1",
      name: "Player One",
      position: "RB",
      fantasy_positions: ["RB"],
      team: "SEA",
      status: "Active",
      injury_status: null,
      depth_chart_order: 2,
      years_exp: 1,
      search_rank: 20,
    } satisfies PlayerSummary;
    const previous = new Map([["p1", baseline]]);
    const current = new Map([
      [
        "p1",
        {
          ...baseline,
          status: "Inactive",
          injury_status: "Out",
          depth_chart_order: 3,
        },
      ],
    ]);

    expect(diffPlayerSignals(previous, current)).toEqual([
      expect.objectContaining({ field: "status", current_value: "Inactive" }),
      expect.objectContaining({ field: "injury_status", current_value: "Out" }),
      expect.objectContaining({ field: "depth_chart_order", current_value: 3 }),
    ]);
  });

  it("assigns transparent baseline purposes without inventing value", () => {
    const players = new Map<string, PlayerSummary>([
      [
        "starter",
        purposePlayer("starter", {
          position: "RB",
          depth_chart_order: 1,
          years_exp: 5,
          search_rank: 10,
        }),
      ],
      [
        "cover",
        purposePlayer("cover", {
          position: "RB",
          depth_chart_order: 2,
          years_exp: 4,
          search_rank: 30,
        }),
      ],
      [
        "taxi",
        purposePlayer("taxi", {
          position: "WR",
          depth_chart_order: 4,
          years_exp: 1,
          search_rank: 100,
        }),
      ],
      [
        "trend",
        purposePlayer("trend", {
          position: "TE",
          depth_chart_order: 4,
          years_exp: 6,
          search_rank: 120,
        }),
      ],
    ]);
    const assessments = baselineRosterPurposes({
      roster: {
        roster_id: 1,
        players: ["starter", "cover", "taxi", "trend"],
        starters: ["starter"],
        taxi: ["taxi"],
        settings: {},
      },
      players,
      trendingAdds: [{ player_id: "trend", count: 12 }],
    });

    expect(
      assessments.map((assessment) => ({
        player_id: assessment.player_id,
        purposes: assessment.purposes,
        signal_codes: assessment.signals.map((signal) => signal.code),
      })),
    ).toEqual([
      {
        player_id: "starter",
        purposes: ["start", "pop"],
        signal_codes: ["current_starter", "favorable_depth_chart"],
      },
      {
        player_id: "cover",
        purposes: ["insure", "pop"],
        signal_codes: ["same_position_cover", "favorable_depth_chart"],
      },
      {
        player_id: "taxi",
        purposes: ["appreciate"],
        signal_codes: ["taxi_development", "young_player"],
      },
      {
        player_id: "trend",
        purposes: ["pop"],
        signal_codes: ["trending_add"],
      },
    ]);
  });

  it("summarizes a league history chain", async () => {
    const result = await getLeagueHistory(await createFixtureDependencies(), {
      league_id: "12345",
      max_seasons: 5,
    });
    expect(result.data["seasons"]).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});

describe("deterministic legal-lineup optimizer", () => {
  it("maximizes a standard flex lineup rather than greedily filling slots", () => {
    const result = optimizeLegalLineup({
      slots: ["RB", "WR", "FLEX"],
      players: [
        { player_id: "rb-low", points: 8, positions: ["RB"] },
        { player_id: "rb-high", points: 20, positions: ["RB"] },
        { player_id: "wr", points: 10, positions: ["WR"] },
        { player_id: "te", points: 15, positions: ["TE"] },
      ],
    });

    expect(result).toMatchObject({ points: 45 });
    expect(
      result?.assignments.map(({ slot, player_id }) => ({ slot, player_id })),
    ).toEqual([
      { slot: "RB", player_id: "rb-high" },
      { slot: "WR", player_id: "wr" },
      { slot: "FLEX", player_id: "te" },
    ]);
  });

  it("supports superflex, receiver-flex, defense, and IDP aliases", () => {
    for (const slot of ["SUPER_FLEX", "SUPERFLEX", "Q/W/R/T"]) {
      const superflex = optimizeLegalLineup({
        slots: ["QB", slot],
        players: [
          { player_id: "qb-one", points: 20, positions: ["QB"] },
          { player_id: "qb-two", points: 18, positions: ["QB"] },
          { player_id: "rb", points: 25, positions: ["RB"] },
        ],
      });
      expect(superflex?.points).toBe(45);
      expect(superflex?.assignments[1]).toMatchObject({
        canonical_slot: "SUPER_FLEX",
        player_id: "rb",
      });
    }

    const aliases = optimizeLegalLineup({
      slots: ["REC_FLEX", "D/ST", "IDP"],
      players: [
        { player_id: "wr", points: 5, positions: ["WR"] },
        { player_id: "rb", points: 100, positions: ["RB"] },
        { player_id: "def", points: 7, positions: ["DST"] },
        { player_id: "linebacker", points: 8, positions: ["OLB"] },
      ],
    });
    expect(aliases?.points).toBe(20);
    expect(
      aliases?.assignments.map(
        ({ canonical_slot, player_id }) => `${canonical_slot}:${player_id}`,
      ),
    ).toEqual(["REC_FLEX:wr", "DEF:def", "IDP_FLEX:linebacker"]);
  });

  it("supports Sleeper WR/RB flex aliases without admitting tight ends", () => {
    for (const slot of ["WRRB_FLEX", "W/R", "WR/RB"]) {
      const result = optimizeLegalLineup({
        slots: [slot],
        players: [
          { player_id: "rb", points: 8, positions: ["RB"] },
          { player_id: "wr", points: 10, positions: ["WR"] },
          { player_id: "te", points: 20, positions: ["TE"] },
        ],
      });

      expect(result).toMatchObject({
        points: 10,
        assignments: [{ canonical_slot: "WRRB_FLEX", player_id: "wr" }],
      });
    }
  });

  it("returns null for incomplete scores, slots, positions, or assignments", () => {
    expect(
      optimizeLegalLineup({
        slots: ["QB"],
        players: [{ player_id: "qb", points: Number.NaN, positions: ["QB"] }],
      }),
    ).toBeNull();
    expect(
      optimizeLegalLineup({
        slots: ["MYSTERY_FLEX"],
        players: [{ player_id: "qb", points: 10, positions: ["QB"] }],
      }),
    ).toBeNull();
    expect(
      optimizeLegalLineup({
        slots: ["QB"],
        players: [{ player_id: "unknown", points: 10, positions: [] }],
      }),
    ).toBeNull();
    expect(
      optimizeLegalLineup({
        slots: ["QB", "SUPER_FLEX"],
        players: [
          { player_id: "qb", points: 10, positions: ["QB"] },
          { player_id: "def", points: 30, positions: ["DEF"] },
        ],
      }),
    ).toBeNull();
  });

  it("uses stable player-ID ties independent of candidate input order", () => {
    const players = [
      { player_id: "a", points: 10, positions: ["RB"] },
      { player_id: "b", points: 10, positions: ["RB"] },
      { player_id: "c", points: 10, positions: ["WR"] },
    ];
    const first = optimizeLegalLineup({ slots: ["RB", "FLEX"], players });
    const second = optimizeLegalLineup({
      slots: ["RB", "FLEX"],
      players: [...players].reverse(),
    });

    expect(second).toEqual(first);
    expect(first?.assignments.map(({ player_id }) => player_id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("removes only known non-starting roster slots", () => {
    expect(startingLineupSlots(["QB", "FLEX", "BN", "IR", "TAXI"])).toEqual([
      "QB",
      "FLEX",
    ]);
  });
});

function purposePlayer(
  playerId: string,
  overrides: Partial<PlayerSummary>,
): PlayerSummary {
  return {
    player_id: playerId,
    name: playerId,
    position: null,
    fantasy_positions:
      overrides.position === undefined || overrides.position === null
        ? []
        : [overrides.position],
    team: null,
    status: "Active",
    injury_status: null,
    depth_chart_order: null,
    years_exp: null,
    search_rank: null,
    ...overrides,
  };
}
