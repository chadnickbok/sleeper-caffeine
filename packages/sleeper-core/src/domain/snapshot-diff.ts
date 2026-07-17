import type { PlayerSummary } from "../players/schemas.js";
import type { Roster } from "../sleeper/types.js";

export type RosterOwnershipChange = {
  change_id: string;
  kind: "roster_add" | "roster_drop" | "roster_move";
  player_id: string;
  from_roster_id: number | null;
  to_roster_id: number | null;
};

export type PlayerSignalChange = {
  change_id: string;
  kind: "player_signal";
  player_id: string;
  field: "status" | "injury_status" | "depth_chart_order";
  previous_value: string | number | null;
  current_value: string | number | null;
};

/**
 * Compare two complete league-roster snapshots. The output is stable and
 * deduplicated so callers can persist change_id as an event identity.
 */
export function diffRosterOwnership(
  previousRosters: readonly Roster[],
  currentRosters: readonly Roster[],
): RosterOwnershipChange[] {
  const previous = ownershipIndex(previousRosters);
  const current = ownershipIndex(currentRosters);
  const playerIds = [...new Set([...previous.keys(), ...current.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );

  return playerIds.flatMap((playerId): RosterOwnershipChange[] => {
    const fromRosterId = previous.get(playerId) ?? null;
    const toRosterId = current.get(playerId) ?? null;
    if (fromRosterId === toRosterId) {
      return [];
    }
    const kind =
      fromRosterId === null
        ? "roster_add"
        : toRosterId === null
          ? "roster_drop"
          : "roster_move";
    return [
      {
        change_id: `ownership:${playerId}:${String(fromRosterId ?? "free")}:${String(toRosterId ?? "free")}`,
        kind,
        player_id: playerId,
        from_roster_id: fromRosterId,
        to_roster_id: toRosterId,
      },
    ];
  });
}

export function rosterOwnership(
  rosters: readonly Roster[],
): ReadonlyMap<string, number> {
  return ownershipIndex(rosters);
}

/** Compare only the Sleeper player fields that can materially stale advice. */
export function diffPlayerSignals(
  previousPlayers: ReadonlyMap<string, PlayerSummary>,
  currentPlayers: ReadonlyMap<string, PlayerSummary>,
): PlayerSignalChange[] {
  const fields: PlayerSignalChange["field"][] = [
    "status",
    "injury_status",
    "depth_chart_order",
  ];
  const playerIds = [...previousPlayers.keys()]
    .filter((playerId) => currentPlayers.has(playerId))
    .sort((a, b) => a.localeCompare(b));
  const changes: PlayerSignalChange[] = [];
  for (const playerId of playerIds) {
    const previous = previousPlayers.get(playerId);
    const current = currentPlayers.get(playerId);
    if (previous === undefined || current === undefined) {
      continue;
    }
    for (const field of fields) {
      if (previous[field] === current[field]) {
        continue;
      }
      changes.push({
        change_id: `player-signal:${playerId}:${field}:${String(previous[field])}:${String(current[field])}`,
        kind: "player_signal",
        player_id: playerId,
        field,
        previous_value: previous[field],
        current_value: current[field],
      });
    }
  }
  return changes;
}

function ownershipIndex(rosters: readonly Roster[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const roster of [...rosters].sort((a, b) => a.roster_id - b.roster_id)) {
    for (const playerId of roster.players ?? []) {
      // Invalid duplicate ownership is resolved deterministically to the
      // lowest roster ID instead of creating duplicate change events.
      if (!result.has(playerId)) {
        result.set(playerId, roster.roster_id);
      }
    }
  }
  return result;
}
