import type { SleeperPlayer } from "../sleeper/types.js";
import type { PlayerCache } from "./cache.js";
import type { PlayerSummary } from "./schemas.js";

export type PlayerDirectorySnapshot = {
  fetchedAt: string;
  stale: boolean;
  players: ReadonlyMap<string, PlayerSummary>;
};

export class PlayerDirectory {
  readonly #cache: PlayerCache;
  #indexedFetchedAt: string | undefined;
  #index: ReadonlyMap<string, PlayerSummary> | undefined;

  constructor(cache: PlayerCache) {
    this.#cache = cache;
  }

  async get(): Promise<PlayerDirectorySnapshot> {
    const cache = await this.#cache.get();
    if (
      this.#index === undefined ||
      this.#indexedFetchedAt !== cache.fetchedAt
    ) {
      this.#index = this.#buildIndex(cache.players);
      this.#indexedFetchedAt = cache.fetchedAt;
    }
    return {
      fetchedAt: cache.fetchedAt,
      stale: cache.stale,
      players: this.#index,
    };
  }

  async refresh(): Promise<PlayerDirectorySnapshot> {
    const cache = await this.#cache.refresh();
    this.#index = this.#buildIndex(cache.players);
    this.#indexedFetchedAt = cache.fetchedAt;
    return {
      fetchedAt: cache.fetchedAt,
      stale: cache.stale,
      players: this.#index,
    };
  }

  async clear(): Promise<void> {
    await this.#cache.clear();
    this.#index = undefined;
    this.#indexedFetchedAt = undefined;
  }

  #buildIndex(
    players: Record<string, SleeperPlayer>,
  ): ReadonlyMap<string, PlayerSummary> {
    return new Map(
      Object.entries(players).map(([id, player]) => [
        id,
        toPlayerSummary(id, player),
      ]),
    );
  }
}

export function toPlayerSummary(
  playerId: string,
  player: SleeperPlayer,
): PlayerSummary {
  const derivedName = [player.first_name, player.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    player_id: playerId,
    name: player.full_name?.trim() || derivedName || playerId,
    position: player.position ?? null,
    fantasy_positions:
      player.fantasy_positions ?? (player.position ? [player.position] : []),
    team: player.team ?? null,
    status: player.status ?? null,
    injury_status: player.injury_status ?? null,
    depth_chart_order: player.depth_chart_order ?? null,
    depth_chart_position: player.depth_chart_position ?? null,
    years_exp: player.years_exp ?? null,
    search_rank: player.search_rank ?? null,
    number: player.number ?? null,
  };
}
