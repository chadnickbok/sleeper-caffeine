import { z } from "zod/v4";
import { PlayerSummarySchema } from "../players/schemas.js";

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
