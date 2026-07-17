import type { PlayerSummary } from "../players/schemas.js";
import type { Roster, TrendingPlayer } from "../sleeper/types.js";

export type RosterPurpose = "start" | "insure" | "appreciate" | "pop";

export type RosterPurposeSignal = {
  purpose: RosterPurpose;
  code:
    | "current_starter"
    | "same_position_cover"
    | "taxi_development"
    | "young_player"
    | "favorable_depth_chart"
    | "trending_add";
  value: string | number | null;
  explanation: string;
};

export type RosterPurposeAssessment = {
  player_id: string;
  player: PlayerSummary;
  purposes: RosterPurpose[];
  signals: RosterPurposeSignal[];
};

export type BaselineRosterPurposesInput = {
  roster: Roster;
  players: ReadonlyMap<string, PlayerSummary>;
  trendingAdds?: readonly TrendingPlayer[];
};

/**
 * Assigns transparent Sleeper-only baseline purposes. This is deliberately
 * conservative and is intended as context for analysis, not a verdict about
 * trade value or a command to cut a player.
 */
export function baselineRosterPurposes(
  input: BaselineRosterPurposesInput,
): RosterPurposeAssessment[] {
  const starterIds = new Set(
    (input.roster.starters ?? []).filter((playerId) => playerId !== "0"),
  );
  const taxiIds = new Set(input.roster.taxi ?? []);
  const rosterIds = [
    ...new Set([
      ...(input.roster.players ?? []),
      ...(input.roster.starters ?? []),
      ...(input.roster.reserve ?? []),
      ...(input.roster.taxi ?? []),
    ]),
  ].filter((playerId) => playerId !== "0");
  const rosterPlayers = rosterIds.map((playerId) =>
    playerOrFallback(playerId, input.players),
  );
  const trendCounts = new Map(
    (input.trendingAdds ?? []).map((trend) => [trend.player_id, trend.count]),
  );
  const coverByPosition = directPositionCover(starterIds, rosterPlayers);

  return rosterPlayers.map((player) => {
    const signals: RosterPurposeSignal[] = [];
    if (starterIds.has(player.player_id)) {
      signals.push({
        purpose: "start",
        code: "current_starter",
        value: null,
        explanation: "Sleeper currently lists this player in a starting slot.",
      });
    }
    for (const position of coverByPosition.get(player.player_id) ?? []) {
      signals.push({
        purpose: "insure",
        code: "same_position_cover",
        value: position,
        explanation: `Best-ranked nonstarter on this roster who directly covers the ${position} position.`,
      });
    }
    if (taxiIds.has(player.player_id)) {
      signals.push({
        purpose: "appreciate",
        code: "taxi_development",
        value: null,
        explanation: "Sleeper currently lists this player on the taxi squad.",
      });
    }
    if (player.years_exp !== null && player.years_exp <= 2) {
      signals.push({
        purpose: "appreciate",
        code: "young_player",
        value: player.years_exp,
        explanation: `Sleeper lists ${String(player.years_exp)} years of NFL experience, leaving a plausible development path.`,
      });
    }
    if (
      player.depth_chart_order !== null &&
      player.depth_chart_order > 0 &&
      player.depth_chart_order <= 2
    ) {
      signals.push({
        purpose: "pop",
        code: "favorable_depth_chart",
        value: player.depth_chart_order,
        explanation: `Sleeper lists depth-chart order ${String(player.depth_chart_order)}, close enough for one role change to matter.`,
      });
    }
    const addCount = trendCounts.get(player.player_id) ?? 0;
    if (addCount > 0) {
      signals.push({
        purpose: "pop",
        code: "trending_add",
        value: addCount,
        explanation: `${String(addCount)} Sleeper trending adds in the supplied lookback window signal rising market attention.`,
      });
    }
    return {
      player_id: player.player_id,
      player,
      purposes: uniquePurposes(signals),
      signals,
    };
  });
}

function directPositionCover(
  starterIds: ReadonlySet<string>,
  rosterPlayers: readonly PlayerSummary[],
): ReadonlyMap<string, string[]> {
  const starterPositions = new Set(
    rosterPlayers
      .filter((player) => starterIds.has(player.player_id))
      .flatMap(playerPositions),
  );
  const coverByPlayer = new Map<string, string[]>();
  for (const position of [...starterPositions].sort((a, b) =>
    a.localeCompare(b),
  )) {
    const cover = rosterPlayers
      .filter(
        (player) =>
          !starterIds.has(player.player_id) &&
          playerPositions(player).includes(position),
      )
      .sort(compareCoverCandidates)[0];
    if (cover === undefined) {
      continue;
    }
    coverByPlayer.set(cover.player_id, [
      ...(coverByPlayer.get(cover.player_id) ?? []),
      position,
    ]);
  }
  return coverByPlayer;
}

function compareCoverCandidates(a: PlayerSummary, b: PlayerSummary): number {
  return (
    (a.search_rank ?? Number.MAX_SAFE_INTEGER) -
      (b.search_rank ?? Number.MAX_SAFE_INTEGER) ||
    (a.depth_chart_order ?? Number.MAX_SAFE_INTEGER) -
      (b.depth_chart_order ?? Number.MAX_SAFE_INTEGER) ||
    a.player_id.localeCompare(b.player_id)
  );
}

function playerPositions(player: PlayerSummary): string[] {
  return [
    ...new Set(
      [player.position, ...player.fantasy_positions]
        .filter((position): position is string => position !== null)
        .map((position) => position.toUpperCase()),
    ),
  ];
}

function uniquePurposes(
  signals: readonly RosterPurposeSignal[],
): RosterPurpose[] {
  const order: RosterPurpose[] = ["start", "insure", "appreciate", "pop"];
  const present = new Set(signals.map((signal) => signal.purpose));
  return order.filter((purpose) => present.has(purpose));
}

function playerOrFallback(
  playerId: string,
  players: ReadonlyMap<string, PlayerSummary>,
): PlayerSummary {
  return (
    players.get(playerId) ?? {
      player_id: playerId,
      name: playerId,
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
