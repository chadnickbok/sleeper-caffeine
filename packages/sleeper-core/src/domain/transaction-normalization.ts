import type { PlayerSummary } from "../players/schemas.js";
import type { Transaction } from "../sleeper/types.js";

export type JoinedTransactionPlayer = {
  player_id: string;
  roster_id: number;
  player: PlayerSummary;
};

/**
 * A lossless-for-analysis view of a Sleeper transaction. In particular,
 * settings and metadata are intentionally retained because Sleeper places
 * FAAB bids and failed-waiver context in those open-ended objects.
 */
export type NormalizedTransaction = {
  transaction_id: string;
  type: string;
  status: string;
  created: number | null;
  status_updated: number | null;
  leg: number | null;
  creator: string | null;
  roster_ids: number[];
  consenter_ids: number[];
  adds: JoinedTransactionPlayer[];
  drops: JoinedTransactionPlayer[];
  draft_picks: Transaction["draft_picks"];
  waiver_budget: Transaction["waiver_budget"];
  faab_bid: number | null;
  settings: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

export type NormalizedTransactionEvent = {
  event_id: string;
  event_type: "transaction";
  week: number;
  occurred_at: number | null;
  transaction_type: string;
  status: string;
  roster_ids: number[];
  player_ids: string[];
  transaction: NormalizedTransaction;
};

export function normalizeTransaction(
  transaction: Transaction,
  players: ReadonlyMap<string, PlayerSummary>,
): NormalizedTransaction {
  const joinRecord = (
    record: Record<string, number> | null | undefined,
  ): JoinedTransactionPlayer[] =>
    Object.entries(record ?? {})
      .map(([playerId, rosterId]) => ({
        player_id: playerId,
        roster_id: rosterId,
        player: playerOrFallback(playerId, players),
      }))
      .sort((a, b) =>
        a.roster_id === b.roster_id
          ? a.player_id.localeCompare(b.player_id)
          : a.roster_id - b.roster_id,
      );

  return {
    transaction_id: transaction.transaction_id,
    type: transaction.type,
    status: transaction.status,
    created: transaction.created ?? null,
    status_updated: transaction.status_updated ?? null,
    leg: transaction.leg ?? null,
    creator: transaction.creator ?? null,
    roster_ids: [...transaction.roster_ids],
    consenter_ids: [...(transaction.consenter_ids ?? [])],
    adds: joinRecord(transaction.adds),
    drops: joinRecord(transaction.drops),
    draft_picks: transaction.draft_picks,
    waiver_budget: transaction.waiver_budget,
    faab_bid: readFiniteNumber(transaction.settings?.["waiver_bid"]),
    settings: transaction.settings ?? null,
    metadata: transaction.metadata ?? null,
  };
}

export function normalizeTransactionEvents(
  week: number,
  transactions: readonly Transaction[],
  players: ReadonlyMap<string, PlayerSummary>,
): NormalizedTransactionEvent[] {
  return transactions
    .map((transaction) => {
      const normalized = normalizeTransaction(transaction, players);
      return {
        event_id: `transaction:${transaction.transaction_id}`,
        event_type: "transaction" as const,
        week,
        occurred_at: transaction.status_updated ?? transaction.created ?? null,
        transaction_type: transaction.type,
        status: transaction.status,
        roster_ids: [...transaction.roster_ids],
        player_ids: [...normalized.adds, ...normalized.drops]
          .map((entry) => entry.player_id)
          .filter(
            (playerId, index, values) => values.indexOf(playerId) === index,
          )
          .sort((a, b) => a.localeCompare(b)),
        transaction: normalized,
      };
    })
    .sort((a, b) => {
      const occurredDifference = (a.occurred_at ?? 0) - (b.occurred_at ?? 0);
      return occurredDifference !== 0
        ? occurredDifference
        : a.event_id.localeCompare(b.event_id);
    });
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
