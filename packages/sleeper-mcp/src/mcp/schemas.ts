import { z } from "zod/v4";
import { PlayerSummarySchema, TransactionSchema } from "@sleeper-caffeine/core";

const WarningSchema = z.object({ code: z.string(), message: z.string() });
const CacheSchema = z.object({
  players_fetched_at: z.iso.datetime(),
  players_stale: z.boolean(),
});
const LeagueSummarySchema = z
  .object({
    league_id: z.string(),
    name: z.string(),
    season: z.string(),
    status: z.string(),
    total_rosters: z.number(),
    roster_positions: z.array(z.string()),
    scoring_settings: z.record(z.string(), z.number()),
    settings: z.record(z.string(), z.unknown()),
  })
  .passthrough();
const RosterViewSchema = z
  .object({
    roster_id: z.number().int(),
    owner_id: z.string().nullable(),
    username: z.string().nullable(),
    display_name: z.string().nullable(),
    team_name: z.string().nullable(),
    settings: z.record(z.string(), z.unknown()),
    starters: z.array(PlayerSummarySchema.passthrough()),
    bench: z.array(PlayerSummarySchema),
    reserve: z.array(PlayerSummarySchema),
    taxi: z.array(PlayerSummarySchema),
    all_players: z.array(PlayerSummarySchema),
  })
  .passthrough();

function envelope<T extends z.ZodType>(data: T) {
  return z.object({
    as_of: z.iso.datetime(),
    source: z.literal("sleeper"),
    cache: CacheSchema.optional(),
    warnings: z.array(WarningSchema),
    data,
  });
}

const JoinedTransactionPlayerSchema = z.object({
  player_id: z.string(),
  roster_id: z.number().int(),
  player: PlayerSummarySchema,
});
const NormalizedTransactionOutputSchema = z.object({
  transaction_id: z.string(),
  type: z.string(),
  status: z.string(),
  created: z.number().nullable(),
  status_updated: z.number().nullable(),
  leg: z.number().int().nullable(),
  creator: z.string().nullable(),
  roster_ids: z.array(z.number().int()),
  consenter_ids: z.array(z.number().int()),
  adds: z.array(JoinedTransactionPlayerSchema),
  drops: z.array(JoinedTransactionPlayerSchema),
  draft_picks: z.array(z.record(z.string(), z.unknown())),
  waiver_budget: z.array(z.record(z.string(), z.unknown())),
  faab_bid: z.number().nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
const NormalizedTransactionEventOutputSchema = z.object({
  event_id: z.string(),
  event_type: z.literal("transaction"),
  week: z.number().int(),
  occurred_at: z.number().nullable(),
  transaction_type: z.string(),
  status: z.string(),
  roster_ids: z.array(z.number().int()),
  player_ids: z.array(z.string()),
  transaction: NormalizedTransactionOutputSchema,
});
const WeeklyOptimalLineupSchema = z.object({
  actual_starter_points: z.number(),
  optimal_points: z.number(),
  points_left_on_bench: z.number(),
  assignments: z.array(
    z.object({
      slot: z.string(),
      canonical_slot: z.string(),
      slot_index: z.number().int().nonnegative(),
      player_id: z.string(),
      points: z.number(),
      player: PlayerSummarySchema,
    }),
  ),
});
const WeeklyMatchupViewSchema = z.object({
  roster_id: z.number().int(),
  matchup_id: z.number().int().nullable(),
  points: z.number().nullable(),
  custom_points: z.number().nullable(),
  player_ids: z.array(z.string()),
  starter_ids: z.array(z.string()),
  players: z.array(PlayerSummarySchema),
  starters: z.array(PlayerSummarySchema),
  player_points: z.array(
    z.object({
      player_id: z.string(),
      points: z.number(),
      player: PlayerSummarySchema,
    }),
  ),
  optimal_lineup: WeeklyOptimalLineupSchema.nullable(),
});

export const TeamSnapshotOutputSchema = envelope(
  z
    .object({
      league: LeagueSummarySchema,
      week: z.number().int(),
      user: z.object({
        user_id: z.string(),
        username: z.string().nullable(),
        display_name: z.string().nullable(),
      }),
      team: RosterViewSchema,
      matchup: z.record(z.string(), z.unknown()),
      pick_inventory: z.record(z.string(), z.unknown()),
    })
    .passthrough(),
);

export const AvailablePlayersOutputSchema = envelope(
  z.object({
    league_id: z.string(),
    definition: z.string(),
    filters: z.record(z.string(), z.unknown()),
    total_matching: z.number().int(),
    players: z.array(
      PlayerSummarySchema.extend({
        roster_availability: z.literal(true),
        trending_add_count: z.number().nullable(),
        trending_lookback_hours: z.number().nullable(),
      }),
    ),
  }),
);

export const MatchupContextOutputSchema = envelope(
  z.object({
    league: LeagueSummarySchema,
    week: z.number().int(),
    matchup_id: z.number().int().nullable(),
    team: RosterViewSchema,
    opponent: RosterViewSchema.nullable(),
    limitations: z.array(z.string()),
  }),
);

export const TradeContextOutputSchema = envelope(
  z.object({
    league: LeagueSummarySchema,
    team: RosterViewSchema,
    pick_inventory: z.record(z.string(), z.unknown()),
    traded_picks: z.array(z.record(z.string(), z.unknown())),
    league_rosters: z.array(RosterViewSchema),
    transactions: z.array(z.record(z.string(), z.unknown())),
    drafts: z.array(z.record(z.string(), z.unknown())),
  }),
);

export const LeagueHistoryOutputSchema = envelope(
  z.object({
    starting_league_id: z.string(),
    seasons: z.array(z.record(z.string(), z.unknown())),
  }),
);

export const DraftSnapshotOutputSchema = envelope(
  z
    .object({
      league_id: z.string(),
      roster_id: z.number().int().optional(),
      draft: z.record(z.string(), z.unknown()).nullable(),
      limitations: z.array(z.string()),
    })
    .passthrough(),
);

export const WeeklyContextOutputSchema = envelope(
  z
    .object({
      key: z.object({
        league_id: z.string(),
        season: z.string(),
        week: z.number().int(),
      }),
      captured_context: z.record(z.string(), z.unknown()),
      league: LeagueSummarySchema,
      my_team: RosterViewSchema.extend({
        identity: z.object({
          user_id: z.string().nullable(),
          username: z.string().nullable(),
          display_name: z.string().nullable(),
        }),
        standings: z.record(z.string(), z.unknown()).optional(),
        faab: z.record(z.string(), z.unknown()),
        roster_purpose_baseline: z.array(
          z.object({
            player_id: z.string(),
            player: PlayerSummarySchema,
            purposes: z.array(z.enum(["start", "insure", "appreciate", "pop"])),
            signals: z.array(z.record(z.string(), z.unknown())),
          }),
        ),
      }),
      league_rosters: z.array(RosterViewSchema.passthrough()),
      league_table: z.array(z.record(z.string(), z.unknown())),
      recent_matchups: z.array(
        z.object({
          week: z.number().int(),
          matchups: z.array(WeeklyMatchupViewSchema),
        }),
      ),
      current_week_transactions: z.object({
        week: z.number().int(),
        raw: z.array(TransactionSchema),
        normalized: z.array(NormalizedTransactionOutputSchema),
        events: z.array(NormalizedTransactionEventOutputSchema),
      }),
      trending: z.object({
        lookback_hours: z.number().int(),
        adds: z.array(z.record(z.string(), z.unknown())),
        drops: z.array(z.record(z.string(), z.unknown())),
      }),
      available_candidate_pool: z.object({
        definition: z.string(),
        total_returned: z.number().int(),
        limit: z.number().int(),
        players: z.array(PlayerSummarySchema.passthrough()),
      }),
      limitations: z.array(z.string()),
    })
    .passthrough(),
);
