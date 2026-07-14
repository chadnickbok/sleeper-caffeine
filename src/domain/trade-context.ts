import type { PlayerSummary } from "../players/schemas.js";
import type { Transaction } from "../sleeper/types.js";
import type { TradeContextInput } from "./contracts.js";
import { cacheMetadata, leagueSummary, pickInventory, rosterView } from "./common.js";
import { resolveTeam } from "./identity.js";
import type { DomainDependencies, DomainResult, ToolWarning } from "./types.js";

export async function getTradeContext(
  dependencies: DomainDependencies,
  input: TradeContextInput,
): Promise<DomainResult<Record<string, unknown>>> {
  const { api, players } = dependencies;
  const [league, users, rosters, tradedPicks, drafts, directory] = await Promise.all([
    api.getLeague(input.league_id),
    api.getLeagueUsers(input.league_id),
    api.getRosters(input.league_id),
    api.getTradedPicks(input.league_id),
    api.getDrafts(input.league_id),
    players.get(),
  ]);
  const resolved = await resolveTeam(api, league, users, rosters, input.username_or_user_id);
  const transactionWeeks = [...new Set(input.transaction_weeks ?? [])].sort((a, b) => a - b);
  const transactionGroups = await Promise.all(
    transactionWeeks.map(async (week) => ({ week, transactions: await api.getTransactions(input.league_id, week) })),
  );
  const warnings: ToolWarning[] = [];

  return {
    cache: cacheMetadata(directory, warnings),
    warnings,
    data: {
      league: leagueSummary(league),
      team: rosterView(league, resolved.roster, users, directory.players, warnings),
      pick_inventory: pickInventory(resolved.roster.roster_id, tradedPicks),
      traded_picks: tradedPicks,
      league_rosters: rosters.map((roster) => ({
        ...rosterView(league, roster, users, directory.players, warnings),
        pick_inventory: pickInventory(roster.roster_id, tradedPicks),
      })),
      transactions: transactionGroups.map(({ week, transactions }) => ({
        week,
        transactions: transactions.map((transaction) => summarizeTransaction(transaction, directory.players)),
      })),
      drafts: drafts.map((draft) => ({
        draft_id: draft.draft_id,
        season: draft.season,
        season_type: draft.season_type ?? null,
        status: draft.status,
        type: draft.type,
        start_time: draft.start_time ?? null,
        settings: draft.settings,
        metadata: draft.metadata ?? null,
      })),
    },
  };
}

function summarizeTransaction(transaction: Transaction, players: ReadonlyMap<string, PlayerSummary>) {
  const joinRecord = (record: Record<string, number> | null | undefined) =>
    Object.entries(record ?? {}).map(([playerId, rosterId]) => ({
      roster_id: rosterId,
      player: players.get(playerId) ?? { player_id: playerId, name: playerId },
    }));

  return {
    transaction_id: transaction.transaction_id,
    type: transaction.type,
    status: transaction.status,
    created: transaction.created ?? null,
    status_updated: transaction.status_updated ?? null,
    roster_ids: transaction.roster_ids,
    adds: joinRecord(transaction.adds),
    drops: joinRecord(transaction.drops),
    draft_picks: transaction.draft_picks,
    waiver_budget: transaction.waiver_budget,
  };
}
