import { createHash } from "node:crypto";
import type { DraftSnapshotInput } from "./contracts.js";
import type { DomainDependencies, DomainResult } from "./types.js";

export async function getDraftSnapshot(
  dependencies: DomainDependencies,
  input: DraftSnapshotInput,
): Promise<DomainResult<Record<string, unknown>>> {
  const [league, drafts, rosters, directory] = await Promise.all([
    dependencies.api.getLeague(input.league_id),
    dependencies.api.getDrafts(input.league_id),
    dependencies.api.getRosters(input.league_id),
    dependencies.players.get(),
  ]);
  const draft =
    drafts.find((candidate) => candidate.draft_id === league.draft_id) ??
    drafts[0];
  if (!draft)
    return {
      data: {
        league_id: input.league_id,
        draft: null,
        limitations: ["Sleeper has not attached a draft to this league."],
      },
      warnings: [],
      cache: {
        players_fetched_at: directory.fetchedAt,
        players_stale: directory.stale,
      },
    };
  const [picks, tradedPicks] = await Promise.all([
    dependencies.api.getDraftPicks(draft.draft_id),
    dependencies.api.getDraftTradedPicks(draft.draft_id),
  ]);
  const teams = integer(draft.settings["teams"]);
  const rounds = integer(draft.settings["rounds"]);
  const totalPicks = teams && rounds ? teams * rounds : null;
  const picked = new Set(picks.map((pick) => pick.pick_no));
  const pickByNumber = new Map(picks.map((pick) => [pick.pick_no, pick]));
  let currentPickNo: number | null = null;
  if (totalPicks)
    for (let pickNo = 1; pickNo <= totalPicks; pickNo += 1)
      if (!picked.has(pickNo)) {
        currentPickNo = pickNo;
        break;
      }
  const slotToRoster = new Map<number, number>();
  for (const [slot, rosterId] of Object.entries(
    draft.slot_to_roster_id ?? {},
  )) {
    const parsedSlot = Number(slot);
    const parsedRoster = Number(rosterId);
    if (Number.isInteger(parsedSlot) && Number.isInteger(parsedRoster))
      slotToRoster.set(parsedSlot, parsedRoster);
  }
  if (slotToRoster.size === 0)
    for (const [userId, slot] of Object.entries(draft.draft_order ?? {})) {
      const roster = rosters.find((candidate) => candidate.owner_id === userId);
      if (roster) slotToRoster.set(slot, roster.roster_id);
    }
  if (slotToRoster.size === 0)
    [...rosters]
      .sort((a, b) => a.roster_id - b.roster_id)
      .forEach((roster, index) => slotToRoster.set(index + 1, roster.roster_id));

  const board = teams && rounds
    ? Array.from({ length: rounds }, (_, roundIndex) => roundIndex + 1).flatMap(
        (round) =>
          Array.from({ length: teams }, (_, slotIndex) => {
            const draftSlot = slotIndex + 1;
            const pickNo = pickNumber(
              draft.type,
              round,
              draftSlot,
              teams,
              integer(draft.settings["reversal_round"]),
            );
            const pick = pickByNumber.get(pickNo);
            const originalRosterId = slotToRoster.get(draftSlot) ?? null;
            const trade = [...tradedPicks]
              .reverse()
              .find(
                (candidate) =>
                  candidate.season === draft.season &&
                  candidate.round === round &&
                  candidate.roster_id === originalRosterId,
              );
            const ownerRosterId = pick?.roster_id ?? trade?.owner_id ?? originalRosterId;
            return {
              pickNo,
              ownerRosterId,
              playerId: pick?.player_id ?? null,
              isKeeper: pick?.is_keeper ?? false,
            };
          }),
      )
    : [];
  const remainingOwnedPicks = board
    .filter(
      (cell) =>
        cell.ownerRosterId === input.roster_id && cell.playerId === null,
    )
    .map((cell) => cell.pickNo)
    .sort((a, b) => a - b);
  const completedPicks = [...picks]
    .sort((a, b) => a.pick_no - b.pick_no)
    .map((pick) => {
      const player = directory.players.get(pick.player_id);
      return {
        pick_no: pick.pick_no,
        round: pick.round,
        draft_slot: pick.draft_slot,
        roster_id: pick.roster_id ?? null,
        player_id: pick.player_id,
        player_name: player?.name ?? pick.metadata?.["first_name"] ?? pick.player_id,
        position: player?.position ?? pick.metadata?.["position"] ?? null,
        team: player?.team ?? pick.metadata?.["team"] ?? null,
        is_keeper: pick.is_keeper ?? false,
      };
    });
  const boardHash = createHash("sha256")
    .update(JSON.stringify(board))
    .digest("hex")
    .slice(0, 16);
  return {
    data: {
      league_id: input.league_id,
      roster_id: input.roster_id,
      draft: {
        draft_id: draft.draft_id,
        status: picks.length > 0 && draft.status === "pre_draft" ? "live" : draft.status,
        source_status: draft.status,
        type: draft.type,
        teams,
        rounds,
        total_picks: totalPicks,
        current_pick_no: currentPickNo,
        board_hash: boardHash,
        completed_picks: completedPicks,
        remaining_owned_pick_numbers: remainingOwnedPicks.sort((a, b) => a - b),
      },
      limitations: [
        "Sleeper does not expose the private draft-room ranking through its documented public API.",
      ],
    },
    warnings: [],
    cache: {
      players_fetched_at: directory.fetchedAt,
      players_stale: directory.stale,
    },
  };
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function pickNumber(
  type: string,
  round: number,
  slot: number,
  teams: number,
  reversalRound: number | null,
) {
  if (type !== "snake") return (round - 1) * teams + slot;
  let reverse = round % 2 === 0;
  if (reversalRound && round >= reversalRound) reverse = !reverse;
  const position = reverse ? teams - slot + 1 : slot;
  return (round - 1) * teams + position;
}
