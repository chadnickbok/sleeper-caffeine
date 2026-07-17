import { SleeperMcpError } from "../errors.js";
import type { PlayerSummary } from "../players/schemas.js";
import type {
  League,
  Matchup,
  NflState,
  Roster,
  SleeperUser,
  Transaction,
  TrendingPlayer,
} from "../sleeper/types.js";
import type { WeeklyContextInput } from "./contracts.js";
import {
  cacheMetadata,
  leagueSummary,
  rosterView,
  type RosterView,
} from "./common.js";
import { resolveTeam } from "./identity.js";
import {
  optimizeLegalLineup,
  startingLineupSlots,
  type ScoredLineupPlayer,
} from "./optimal-lineup.js";
import {
  baselineRosterPurposes,
  type RosterPurposeAssessment,
} from "./roster-purpose-baseline.js";
import {
  normalizeTransaction,
  normalizeTransactionEvents,
  type NormalizedTransaction,
  type NormalizedTransactionEvent,
} from "./transaction-normalization.js";
import type { DomainDependencies, DomainResult, ToolWarning } from "./types.js";
import {
  rankWeeklyCandidates,
  type RankedWeeklyCandidate,
} from "./waiver-candidate-ranking.js";

export type WeeklyStanding = {
  roster_id: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number | null;
  points_against: number | null;
  waiver_position: number | null;
  record_rank: number;
  points_rank: number | null;
  total_rosters: number;
};

export type WeeklyRosterFaab = {
  starting_budget: number | null;
  used: number | null;
  remaining: number | null;
  waiver_position: number | null;
};

export type WeeklyMatchupView = {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  custom_points: number | null;
  player_ids: string[];
  starter_ids: string[];
  players: PlayerSummary[];
  starters: PlayerSummary[];
  player_points: Array<{
    player_id: string;
    points: number;
    player: PlayerSummary;
  }>;
  optimal_lineup: WeeklyOptimalLineup | null;
};

export type WeeklyOptimalLineup = {
  actual_starter_points: number;
  optimal_points: number;
  points_left_on_bench: number;
  assignments: Array<{
    slot: string;
    canonical_slot: string;
    slot_index: number;
    player_id: string;
    points: number;
    player: PlayerSummary;
  }>;
};

export type WeeklyTrendView = {
  player_id: string;
  count: number;
  player: PlayerSummary;
};

export type WeeklyContextData = {
  key: { league_id: string; season: string; week: number };
  captured_context: {
    nfl_state: NflState;
    matchup_weeks: number[];
    trending_lookback_hours: number;
  };
  league: ReturnType<typeof leagueSummary> & {
    waiver_type: unknown;
    faab_starting_budget: number | null;
  };
  my_team: RosterView & {
    identity: {
      user_id: string | null;
      username: string | null;
      display_name: string | null;
    };
    standings: WeeklyStanding | undefined;
    faab: WeeklyRosterFaab;
    roster_purpose_baseline: RosterPurposeAssessment[];
  };
  league_rosters: Array<
    RosterView & {
      standings: WeeklyStanding | undefined;
      faab: WeeklyRosterFaab;
    }
  >;
  league_table: WeeklyStanding[];
  recent_matchups: Array<{ week: number; matchups: WeeklyMatchupView[] }>;
  current_week_transactions: {
    week: number;
    raw: Transaction[];
    normalized: NormalizedTransaction[];
    events: NormalizedTransactionEvent[];
  };
  trending: {
    lookback_hours: number;
    adds: WeeklyTrendView[];
    drops: WeeklyTrendView[];
  };
  available_candidate_pool: {
    definition: string;
    total_returned: number;
    limit: number;
    players: RankedWeeklyCandidate[];
  };
  limitations: string[];
};

export async function getWeeklyContext(
  dependencies: DomainDependencies,
  input: WeeklyContextInput,
): Promise<DomainResult<WeeklyContextData>> {
  const { api, players } = dependencies;
  const [league, state] = await Promise.all([
    api.getLeague(input.league_id),
    api.getNflState(),
  ]);
  const week = input.week ?? Math.max(1, state.week);
  const matchupWeeks = recentWeeks(week, input.recent_matchup_weeks);
  const [users, rosters, directory, transactions, trendingAdds, trendingDrops] =
    await Promise.all([
      api.getLeagueUsers(input.league_id),
      api.getRosters(input.league_id),
      players.get(),
      api.getTransactions(input.league_id, week),
      api.getTrending(
        "add",
        input.trending_lookback_hours,
        Math.max(100, input.candidate_limit),
      ),
      api.getTrending(
        "drop",
        input.trending_lookback_hours,
        Math.max(100, input.candidate_limit),
      ),
    ]);
  const matchupGroups = await Promise.all(
    matchupWeeks.map(async (matchupWeek) => ({
      week: matchupWeek,
      matchups: await api.getMatchups(input.league_id, matchupWeek),
    })),
  );
  const selected = await resolveSelectedRoster(
    dependencies,
    input,
    league,
    users,
    rosters,
  );
  const warnings: ToolWarning[] = [];
  const standings = buildStandings(league, rosters);
  const faabStartingBudget = finiteSetting(league.settings, "waiver_budget");
  const normalizedTransactions = transactions.map((transaction) =>
    normalizeTransaction(transaction, directory.players),
  );
  const candidatePool = rankWeeklyCandidates({
    rosters,
    players: directory.players,
    trendingAdds,
    trendingDrops,
    rosterPositions: league.roster_positions,
    limit: input.candidate_limit,
  });

  return {
    cache: cacheMetadata(directory, warnings),
    warnings,
    data: {
      key: {
        league_id: league.league_id,
        season: league.season,
        week,
      },
      captured_context: {
        nfl_state: state,
        matchup_weeks: matchupWeeks,
        trending_lookback_hours: input.trending_lookback_hours,
      },
      league: {
        ...leagueSummary(league),
        waiver_type: league.settings["waiver_type"] ?? null,
        faab_starting_budget: faabStartingBudget,
      },
      my_team: {
        identity: selected.identity,
        ...rosterView(
          league,
          selected.roster,
          users,
          directory.players,
          warnings,
        ),
        standings: standings.find(
          (standing) => standing.roster_id === selected.roster.roster_id,
        ),
        faab: rosterFaab(selected.roster, faabStartingBudget),
        roster_purpose_baseline: baselineRosterPurposes({
          roster: selected.roster,
          players: directory.players,
          trendingAdds,
        }),
      },
      league_rosters: rosters
        .map((roster) => ({
          ...rosterView(league, roster, users, directory.players, warnings),
          standings: standings.find(
            (standing) => standing.roster_id === roster.roster_id,
          ),
          faab: rosterFaab(roster, faabStartingBudget),
        }))
        .sort((a, b) => a.roster_id - b.roster_id),
      league_table: standings,
      recent_matchups: matchupGroups.map(({ week: matchupWeek, matchups }) => ({
        week: matchupWeek,
        matchups: matchups
          .map((matchup) =>
            matchupView(matchup, directory.players, league.roster_positions),
          )
          .sort((a, b) => a.roster_id - b.roster_id),
      })),
      current_week_transactions: {
        week,
        // Raw parsed records are retained for future reconciliation as Sleeper
        // adds new open-ended settings or metadata fields.
        raw: transactions,
        normalized: normalizedTransactions,
        events: normalizeTransactionEvents(
          week,
          transactions,
          directory.players,
        ),
      },
      trending: {
        lookback_hours: input.trending_lookback_hours,
        adds: joinTrends(trendingAdds, directory.players),
        drops: joinTrends(trendingDrops, directory.players),
      },
      available_candidate_pool: {
        definition:
          "A deterministic research cohort of players absent from every current roster. It is not a projection or proof of waiver clearance.",
        total_returned: candidatePool.length,
        limit: input.candidate_limit,
        players: candidatePool,
      },
      limitations: [
        "Sleeper does not provide independent projections, current news, weather, or an optimal-lineup recommendation. Any optimal lineup shown here is a retrospective calculation using actual player points.",
        "A matchup's optimal_lineup is null unless its complete roster, starter slots, player positions, and actual per-player scoring are available.",
        "Roster availability does not prove that a player has cleared waivers.",
      ],
    },
  };
}

async function resolveSelectedRoster(
  dependencies: DomainDependencies,
  input: WeeklyContextInput,
  league: League,
  users: SleeperUser[],
  rosters: Roster[],
): Promise<{
  roster: Roster;
  identity: {
    user_id: string | null;
    username: string | null;
    display_name: string | null;
  };
}> {
  let rosterFromIdentity: Roster | undefined;
  let identityUser: SleeperUser | undefined;
  if (input.username_or_user_id !== undefined) {
    const resolved = await resolveTeam(
      dependencies.api,
      league,
      users,
      rosters,
      input.username_or_user_id,
    );
    rosterFromIdentity = resolved.roster;
    identityUser = resolved.leagueUser;
  }
  const rosterFromId =
    input.roster_id === undefined
      ? undefined
      : rosters.find((roster) => roster.roster_id === input.roster_id);
  if (input.roster_id !== undefined && rosterFromId === undefined) {
    throw new SleeperMcpError(
      "TEAM_NOT_FOUND",
      `Roster ${String(input.roster_id)} does not exist in league ${league.league_id}.`,
      { details: { league_id: league.league_id, roster_id: input.roster_id } },
    );
  }
  if (
    rosterFromIdentity !== undefined &&
    rosterFromId !== undefined &&
    rosterFromIdentity.roster_id !== rosterFromId.roster_id
  ) {
    throw new SleeperMcpError(
      "TEAM_NOT_FOUND",
      "roster_id and username_or_user_id resolve to different league rosters.",
      { details: { league_id: league.league_id } },
    );
  }
  const roster = rosterFromIdentity ?? rosterFromId;
  if (roster === undefined) {
    throw new SleeperMcpError(
      "TEAM_NOT_FOUND",
      "A Sleeper roster could not be resolved.",
    );
  }
  const owner =
    identityUser ?? users.find((user) => user.user_id === roster.owner_id);
  return {
    roster,
    identity: {
      user_id: owner?.user_id ?? roster.owner_id ?? null,
      username: owner?.username ?? null,
      display_name: owner?.display_name ?? null,
    },
  };
}

function recentWeeks(week: number, count: number): number[] {
  const first = Math.max(1, week - count + 1);
  return Array.from({ length: week - first + 1 }, (_, index) => first + index);
}

function matchupView(
  matchup: Matchup,
  players: ReadonlyMap<string, PlayerSummary>,
  rosterPositions: readonly string[],
): WeeklyMatchupView {
  const playerIds = matchup.players ?? [];
  const starterIds = matchup.starters ?? [];
  return {
    roster_id: matchup.roster_id,
    matchup_id: matchup.matchup_id ?? null,
    points: matchup.points ?? null,
    custom_points: matchup.custom_points ?? null,
    player_ids: playerIds,
    starter_ids: starterIds,
    players: playerIds.map((playerId) => playerOrFallback(playerId, players)),
    starters: starterIds.map((playerId) => playerOrFallback(playerId, players)),
    player_points: Object.entries(matchup.players_points ?? {})
      .map(([playerId, points]) => ({
        player_id: playerId,
        points,
        player: playerOrFallback(playerId, players),
      }))
      .sort((a, b) => a.player_id.localeCompare(b.player_id)),
    optimal_lineup: retrospectiveOptimalLineup(
      matchup,
      players,
      rosterPositions,
    ),
  };
}

function retrospectiveOptimalLineup(
  matchup: Matchup,
  players: ReadonlyMap<string, PlayerSummary>,
  rosterPositions: readonly string[],
): WeeklyOptimalLineup | null {
  const slots = startingLineupSlots(rosterPositions);
  const playerIds = matchup.players ?? [];
  const starterIds = matchup.starters ?? [];
  const points = matchup.players_points;
  if (
    points === undefined ||
    slots.length === 0 ||
    starterIds.length !== slots.length ||
    playerIds.length < slots.length ||
    playerIds.includes("0") ||
    starterIds.includes("0") ||
    new Set(playerIds).size !== playerIds.length ||
    !starterIds.every((playerId) => playerIds.includes(playerId))
  ) {
    return null;
  }

  const scoredPlayers: ScoredLineupPlayer[] = [];
  for (const playerId of playerIds) {
    const player = players.get(playerId);
    const playerPoints = points[playerId];
    if (
      player === undefined ||
      playerPoints === undefined ||
      !Number.isFinite(playerPoints)
    ) {
      return null;
    }
    const positions = [
      ...player.fantasy_positions,
      ...(player.position === null ? [] : [player.position]),
    ];
    if (positions.length === 0) {
      return null;
    }
    scoredPlayers.push({
      player_id: playerId,
      points: playerPoints,
      positions,
    });
  }

  const optimal = optimizeLegalLineup({ slots, players: scoredPlayers });
  const starterPool = scoredPlayers.filter((player) =>
    starterIds.includes(player.player_id),
  );
  const legalStarterLineup = optimizeLegalLineup({
    slots,
    players: starterPool,
  });
  if (optimal === null || legalStarterLineup === null) {
    return null;
  }

  const actualStarterPoints = preciseSum(
    starterIds.map((playerId) => points[playerId] ?? Number.NaN),
  );
  if (!Number.isFinite(actualStarterPoints)) {
    return null;
  }
  return {
    actual_starter_points: actualStarterPoints,
    optimal_points: optimal.points,
    points_left_on_bench: preciseNumber(
      Math.max(0, optimal.points - actualStarterPoints),
    ),
    assignments: optimal.assignments.map((assignment) => ({
      slot: assignment.slot,
      canonical_slot: assignment.canonical_slot,
      slot_index: assignment.slot_index,
      player_id: assignment.player_id,
      points: assignment.points,
      player: playerOrFallback(assignment.player_id, players),
    })),
  };
}

function joinTrends(
  trends: readonly TrendingPlayer[],
  players: ReadonlyMap<string, PlayerSummary>,
): WeeklyTrendView[] {
  return [...trends]
    .sort((a, b) =>
      b.count === a.count
        ? a.player_id.localeCompare(b.player_id)
        : b.count - a.count,
    )
    .map((trend) => ({
      player_id: trend.player_id,
      count: trend.count,
      player: playerOrFallback(trend.player_id, players),
    }));
}

function playerOrFallback(
  playerId: string,
  players: ReadonlyMap<string, PlayerSummary>,
): PlayerSummary {
  return (
    players.get(playerId) ?? {
      player_id: playerId,
      name: playerId === "0" ? "Empty slot" : playerId,
      position: null,
      fantasy_positions: [],
      team: null,
      status: null,
      injury_status: null,
      depth_chart_order: null,
      depth_chart_position: null,
      years_exp: null,
      search_rank: null,
      number: null,
    }
  );
}

function rosterFaab(
  roster: Roster,
  startingBudget: number | null,
): WeeklyRosterFaab {
  const used = finiteSetting(roster.settings, "waiver_budget_used");
  return {
    starting_budget: startingBudget,
    used,
    remaining:
      startingBudget === null || used === null
        ? null
        : Math.max(0, startingBudget - used),
    waiver_position: finiteSetting(roster.settings, "waiver_position"),
  };
}

function buildStandings(
  league: League,
  rosters: readonly Roster[],
): WeeklyStanding[] {
  const rows = rosters.map((roster) => ({
    roster_id: roster.roster_id,
    wins: finiteSetting(roster.settings, "wins") ?? 0,
    losses: finiteSetting(roster.settings, "losses") ?? 0,
    ties: finiteSetting(roster.settings, "ties") ?? 0,
    points_for: pointsSetting(roster.settings, "fpts", "fpts_decimal"),
    points_against: pointsSetting(
      roster.settings,
      "fpts_against",
      "fpts_against_decimal",
    ),
    waiver_position: finiteSetting(roster.settings, "waiver_position"),
  }));
  const byRecord = [...rows].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.ties - a.ties ||
      (b.points_for ?? Number.NEGATIVE_INFINITY) -
        (a.points_for ?? Number.NEGATIVE_INFINITY) ||
      a.roster_id - b.roster_id,
  );
  const byPoints = [...rows].sort(
    (a, b) =>
      (b.points_for ?? Number.NEGATIVE_INFINITY) -
        (a.points_for ?? Number.NEGATIVE_INFINITY) || a.roster_id - b.roster_id,
  );
  return rows
    .map((row) => ({
      ...row,
      record_rank:
        byRecord.findIndex(
          (candidate) => candidate.roster_id === row.roster_id,
        ) + 1,
      points_rank:
        row.points_for === null
          ? null
          : byPoints.findIndex(
              (candidate) => candidate.roster_id === row.roster_id,
            ) + 1,
      total_rosters: league.total_rosters,
    }))
    .sort((a, b) => a.record_rank - b.record_rank);
}

function pointsSetting(
  settings: Record<string, unknown>,
  wholeKey: string,
  decimalKey: string,
): number | null {
  const whole = finiteSetting(settings, wholeKey);
  if (whole === null) {
    return null;
  }
  return whole + (finiteSetting(settings, decimalKey) ?? 0) / 100;
}

function finiteSetting(
  settings: Record<string, unknown>,
  key: string,
): number | null {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function preciseSum(values: readonly number[]): number {
  return preciseNumber(values.reduce((total, value) => total + value, 0));
}

function preciseNumber(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
