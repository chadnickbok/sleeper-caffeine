import type { PlayerSummary } from "../players/schemas.js";
import type { Roster, TrendingPlayer } from "../sleeper/types.js";

export type WeeklyCandidateSignal = {
  code:
    | "trending_add"
    | "trending_drop"
    | "sleeper_search_rank"
    | "depth_chart"
    | "inactive";
  value: number | string | null;
  score: number;
};

export type RankedWeeklyCandidate = PlayerSummary & {
  roster_availability: true;
  baseline_rank: number;
  baseline_score: number;
  trending_add_count: number;
  trending_drop_count: number;
  signals: WeeklyCandidateSignal[];
};

export type RankWeeklyCandidatesInput = {
  rosters: readonly Roster[];
  players: ReadonlyMap<string, PlayerSummary>;
  trendingAdds: readonly TrendingPlayer[];
  trendingDrops: readonly TrendingPlayer[];
  rosterPositions?: readonly string[];
  limit?: number;
  includeInactive?: boolean;
};

/**
 * Creates a bounded, explainable research cohort without pretending the
 * local score is a projection. Codex or another analyst can reorder the
 * cohort later, but every inclusion has deterministic Sleeper-derived
 * signals.
 */
export function rankWeeklyCandidates(
  input: RankWeeklyCandidatesInput,
): RankedWeeklyCandidate[] {
  const rostered = new Set(
    input.rosters.flatMap((roster) => roster.players ?? []),
  );
  const trendingAdds = new Map(
    input.trendingAdds.map((entry) => [entry.player_id, entry.count]),
  );
  const trendingDrops = new Map(
    input.trendingDrops.map((entry) => [entry.player_id, entry.count]),
  );
  const candidates: Array<Omit<RankedWeeklyCandidate, "baseline_rank">> = [];

  for (const player of input.players.values()) {
    if (
      rostered.has(player.player_id) ||
      !isFantasyPlayer(player) ||
      !isRelevantToLeague(player, input.rosterPositions)
    ) {
      continue;
    }
    const inactive = isInactive(player);
    if (inactive && input.includeInactive !== true) {
      continue;
    }
    const addCount = trendingAdds.get(player.player_id) ?? 0;
    const dropCount = trendingDrops.get(player.player_id) ?? 0;
    const signals = candidateSignals(player, addCount, dropCount, inactive);
    const baselineScore = signals.reduce(
      (total, signal) => total + signal.score,
      0,
    );
    candidates.push({
      ...player,
      roster_availability: true,
      baseline_score: roundScore(baselineScore),
      trending_add_count: addCount,
      trending_drop_count: dropCount,
      signals,
    });
  }

  candidates.sort((a, b) => {
    const scoreDifference = b.baseline_score - a.baseline_score;
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    const searchRankDifference =
      (a.search_rank ?? Number.MAX_SAFE_INTEGER) -
      (b.search_rank ?? Number.MAX_SAFE_INTEGER);
    return searchRankDifference !== 0
      ? searchRankDifference
      : a.player_id.localeCompare(b.player_id);
  });

  return candidates.slice(0, input.limit ?? 40).map((candidate, index) => ({
    ...candidate,
    baseline_rank: index + 1,
  }));
}

function candidateSignals(
  player: PlayerSummary,
  addCount: number,
  dropCount: number,
  inactive: boolean,
): WeeklyCandidateSignal[] {
  const signals: WeeklyCandidateSignal[] = [];
  if (addCount > 0) {
    signals.push({
      code: "trending_add",
      value: addCount,
      score: Math.min(45, Math.log2(addCount + 1) * 8),
    });
  }
  if (dropCount > 0) {
    signals.push({
      code: "trending_drop",
      value: dropCount,
      score: -Math.min(24, Math.log2(dropCount + 1) * 5),
    });
  }
  if (player.search_rank !== null) {
    signals.push({
      code: "sleeper_search_rank",
      value: player.search_rank,
      score: Math.max(0, 30 - player.search_rank / 100),
    });
  }
  if (player.depth_chart_order !== null) {
    signals.push({
      code: "depth_chart",
      value: player.depth_chart_order,
      score: Math.max(0, 14 - (player.depth_chart_order - 1) * 4),
    });
  }
  if (inactive) {
    signals.push({ code: "inactive", value: player.status, score: -100 });
  }
  return signals;
}

function isFantasyPlayer(player: PlayerSummary): boolean {
  return player.position !== null || player.fantasy_positions.length > 0;
}

function isRelevantToLeague(
  player: PlayerSummary,
  rosterPositions: readonly string[] | undefined,
): boolean {
  if (!rosterPositions?.length) return true;
  const eligible = new Set<string>();
  for (const rawSlot of rosterPositions) {
    const slot = rawSlot.trim().toUpperCase().replaceAll("-", "_");
    if (["BN", "BENCH", "IR", "RESERVE", "TAXI"].includes(slot)) continue;
    if (["FLEX", "W_R_T"].includes(slot)) {
      eligible.add("RB");
      eligible.add("WR");
      eligible.add("TE");
      continue;
    }
    if (["REC_FLEX", "WR_TE_FLEX"].includes(slot)) {
      eligible.add("WR");
      eligible.add("TE");
      continue;
    }
    if (["WRRB_FLEX", "W/R", "WR/RB", "RB/WR", "W_R"].includes(slot)) {
      eligible.add("RB");
      eligible.add("WR");
      continue;
    }
    if (
      ["SUPER_FLEX", "SUPERFLEX", "Q/W/R/T", "QB_WR_RB_TE", "OP"].includes(slot)
    ) {
      eligible.add("QB");
      eligible.add("RB");
      eligible.add("WR");
      eligible.add("TE");
      continue;
    }
    if (["IDP_FLEX", "IDP"].includes(slot)) {
      for (const position of ["DL", "DE", "DT", "LB", "DB", "CB", "S"])
        eligible.add(position);
      continue;
    }
    eligible.add(slot === "DST" ? "DEF" : slot);
  }
  const playerPositions = [player.position, ...player.fantasy_positions]
    .filter((position): position is string => Boolean(position))
    .map((position) => position.toUpperCase());
  return playerPositions.some((position) => eligible.has(position));
}

function isInactive(player: PlayerSummary): boolean {
  const status = player.status?.toLocaleLowerCase();
  return status === "inactive" || status === "retired";
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
