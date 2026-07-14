import type { PlayerSummary } from "../players/schemas.js";
import type { AvailablePlayersInput } from "./contracts.js";
import { cacheMetadata } from "./common.js";
import type { DomainDependencies, DomainResult, ToolWarning } from "./types.js";

type AvailablePlayer = PlayerSummary & {
  roster_availability: true;
  trending_add_count: number | null;
  trending_lookback_hours: number | null;
};

export async function getAvailablePlayers(
  dependencies: DomainDependencies,
  input: AvailablePlayersInput,
): Promise<DomainResult<Record<string, unknown>>> {
  const { api, players } = dependencies;
  const shouldFetchTrending = input.sort === "trending";
  const [rosters, directory, trending] = await Promise.all([
    api.getRosters(input.league_id),
    players.get(),
    shouldFetchTrending ? api.getTrending("add", 24, 100) : Promise.resolve([]),
  ]);
  const warnings: ToolWarning[] = [];
  const rostered = new Set(rosters.flatMap((roster) => roster.players ?? []));
  const trendingCounts = new Map(trending.map((entry) => [entry.player_id, entry.count]));
  const positions = new Set((input.positions ?? []).map((position) => position.toUpperCase()));
  const query = input.query?.toLocaleLowerCase();

  const available: AvailablePlayer[] = [];
  for (const player of directory.players.values()) {
    if (rostered.has(player.player_id) || !isFantasyPlayer(player)) {
      continue;
    }
    if (!input.include_inactive && isInactive(player)) {
      continue;
    }
    if (positions.size > 0 && !playerMatchesPositions(player, positions)) {
      continue;
    }
    if (query !== undefined && !`${player.name} ${player.team ?? ""} ${player.position ?? ""}`.toLocaleLowerCase().includes(query)) {
      continue;
    }
    available.push({
      ...player,
      roster_availability: true,
      trending_add_count: trendingCounts.get(player.player_id) ?? null,
      trending_lookback_hours: shouldFetchTrending ? 24 : null,
    });
  }

  available.sort(sortPlayers(input.sort));
  const results = available.slice(0, input.limit);
  return {
    cache: cacheMetadata(directory, warnings),
    warnings,
    data: {
      league_id: input.league_id,
      definition: "Players absent from every current league roster; this does not assert waiver clearance or lineup eligibility.",
      filters: {
        positions: [...positions],
        query: input.query ?? null,
        include_inactive: input.include_inactive,
        sort: input.sort,
        limit: input.limit,
      },
      total_matching: available.length,
      players: results,
    },
  };
}

function isFantasyPlayer(player: PlayerSummary): boolean {
  return player.position !== null || player.fantasy_positions.length > 0;
}

function isInactive(player: PlayerSummary): boolean {
  const status = player.status?.toLocaleLowerCase();
  return status === "inactive" || status === "retired";
}

function playerMatchesPositions(player: PlayerSummary, positions: ReadonlySet<string>): boolean {
  return (
    (player.position !== null && positions.has(player.position.toUpperCase())) ||
    player.fantasy_positions.some((position) => positions.has(position.toUpperCase()))
  );
}

function sortPlayers(sort: AvailablePlayersInput["sort"]): (a: AvailablePlayer, b: AvailablePlayer) => number {
  if (sort === "name") {
    return (a, b) => a.name.localeCompare(b.name);
  }
  if (sort === "search_rank") {
    return (a, b) => (a.search_rank ?? Number.MAX_SAFE_INTEGER) - (b.search_rank ?? Number.MAX_SAFE_INTEGER);
  }
  return (a, b) => {
    const trendingDifference = (b.trending_add_count ?? -1) - (a.trending_add_count ?? -1);
    return trendingDifference !== 0
      ? trendingDifference
      : (a.search_rank ?? Number.MAX_SAFE_INTEGER) - (b.search_rank ?? Number.MAX_SAFE_INTEGER);
  };
}
