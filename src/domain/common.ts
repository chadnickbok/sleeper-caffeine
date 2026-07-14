import type { PlayerDirectorySnapshot } from "../players/directory.js";
import type { PlayerSummary } from "../players/schemas.js";
import type { League, Roster, SleeperUser, TradedPick } from "../sleeper/types.js";
import type { CacheMetadata, ToolWarning } from "./types.js";

export type RosterPlayer = PlayerSummary & { starter_slot?: string };

export type RosterView = {
  roster_id: number;
  owner_id: string | null;
  co_owner_ids: string[];
  username: string | null;
  display_name: string | null;
  team_name: string | null;
  settings: Record<string, unknown>;
  starters: RosterPlayer[];
  bench: PlayerSummary[];
  reserve: PlayerSummary[];
  taxi: PlayerSummary[];
  all_players: PlayerSummary[];
};

export function cacheMetadata(directory: PlayerDirectorySnapshot, warnings: ToolWarning[]): CacheMetadata {
  if (directory.stale) {
    const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(directory.fetchedAt)) / 1_000));
    warnings.push({
      code: "STALE_PLAYER_CACHE",
      message: `Player metadata refresh failed; using cache from ${directory.fetchedAt} (${String(ageSeconds)} seconds old).`,
    });
  }
  return {
    players_fetched_at: directory.fetchedAt,
    players_stale: directory.stale,
  };
}

export function rosterView(
  league: League,
  roster: Roster,
  users: SleeperUser[],
  players: ReadonlyMap<string, PlayerSummary>,
  warnings: ToolWarning[],
): RosterView {
  const owner = users.find((user) => user.user_id === roster.owner_id);
  const allIds = roster.players ?? [];
  const starterIds = roster.starters ?? [];
  const reserveIds = roster.reserve ?? [];
  const taxiIds = roster.taxi ?? [];
  const excludedFromBench = new Set([...starterIds, ...reserveIds, ...taxiIds]);

  const join = (playerId: string): PlayerSummary => {
    if (playerId === "0") {
      return {
        player_id: "0",
        name: "Empty slot",
        position: null,
        fantasy_positions: [],
        team: null,
        status: null,
        injury_status: null,
        depth_chart_order: null,
        years_exp: null,
        search_rank: null,
      };
    }
    const found = players.get(playerId);
    if (found !== undefined) {
      return found;
    }
    if (!warnings.some((warning) => warning.code === `UNKNOWN_PLAYER_${playerId}`)) {
      warnings.push({
        code: `UNKNOWN_PLAYER_${playerId}`,
        message: `Sleeper player ID ${playerId} was not present in the cached player directory.`,
      });
    }
    return {
      player_id: playerId,
      name: playerId,
      position: null,
      fantasy_positions: [],
      team: null,
      status: null,
      injury_status: null,
      depth_chart_order: null,
      years_exp: null,
      search_rank: null,
    };
  };

  const metadata = owner?.metadata ?? {};
  const metadataTeamName = metadata["team_name"];
  return {
    roster_id: roster.roster_id,
    owner_id: roster.owner_id ?? null,
    co_owner_ids: roster.co_owners ?? [],
    username: owner?.username ?? null,
    display_name: owner?.display_name ?? null,
    team_name: typeof metadataTeamName === "string" ? metadataTeamName : null,
    settings: roster.settings,
    starters: starterIds.map((playerId, index) => {
      const player = join(playerId);
      const starterSlot = league.roster_positions[index];
      return starterSlot === undefined ? player : { ...player, starter_slot: starterSlot };
    }),
    bench: allIds.filter((playerId) => !excludedFromBench.has(playerId)).map(join),
    reserve: reserveIds.map(join),
    taxi: taxiIds.map(join),
    all_players: allIds.map(join),
  };
}

export function leagueSummary(league: League) {
  return {
    league_id: league.league_id,
    name: league.name,
    season: league.season,
    season_type: league.season_type ?? null,
    status: league.status,
    total_rosters: league.total_rosters,
    roster_positions: league.roster_positions,
    scoring_settings: league.scoring_settings,
    settings: league.settings,
  };
}

export function pickInventory(rosterId: number, picks: TradedPick[]) {
  return {
    acquired: picks.filter((pick) => pick.owner_id === rosterId && pick.roster_id !== rosterId),
    sent: picks.filter((pick) => pick.roster_id === rosterId && pick.owner_id !== rosterId),
    all_traded_picks_currently_owned: picks.filter((pick) => pick.owner_id === rosterId),
    scope: "Sleeper's traded-picks ledger; untraded native picks are not enumerated",
  };
}

export function userForRoster(roster: Roster, users: SleeperUser[]): SleeperUser | undefined {
  return users.find((user) => user.user_id === roster.owner_id);
}
