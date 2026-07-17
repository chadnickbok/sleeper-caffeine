import { z } from "zod/v4";

const UnknownRecordSchema = z.record(z.string(), z.unknown());
const NumberRecordSchema = z.record(z.string(), z.number());

export const SleeperUserSchema = z
  .object({
    user_id: z.string(),
    username: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    metadata: UnknownRecordSchema.nullable().optional(),
    is_owner: z.boolean().nullable().optional(),
  })
  .passthrough();

export const LeagueSchema = z
  .object({
    league_id: z.string(),
    name: z.string(),
    season: z.string(),
    season_type: z.string().optional(),
    status: z.string(),
    sport: z.string().optional(),
    total_rosters: z.number(),
    roster_positions: z.array(z.string()).default([]),
    scoring_settings: NumberRecordSchema.default({}),
    settings: UnknownRecordSchema.default({}),
    metadata: UnknownRecordSchema.nullable().optional(),
    previous_league_id: z.string().nullable().optional(),
    draft_id: z.string().nullable().optional(),
  })
  .passthrough();

export const RosterSchema = z
  .object({
    roster_id: z.number().int(),
    owner_id: z.string().nullable().optional(),
    co_owners: z.array(z.string()).nullable().optional(),
    league_id: z.string().optional(),
    players: z.array(z.string()).nullable().optional(),
    starters: z.array(z.string()).nullable().optional(),
    reserve: z.array(z.string()).nullable().optional(),
    taxi: z.array(z.string()).nullable().optional(),
    settings: UnknownRecordSchema.default({}),
    metadata: UnknownRecordSchema.nullable().optional(),
  })
  .passthrough();

export const MatchupSchema = z
  .object({
    roster_id: z.number().int(),
    matchup_id: z.number().int().nullable().optional(),
    players: z.array(z.string()).nullable().optional(),
    starters: z.array(z.string()).nullable().optional(),
    points: z.number().nullable().optional(),
    custom_points: z.number().nullable().optional(),
    players_points: NumberRecordSchema.optional(),
  })
  .passthrough();

export const TradedPickSchema = z
  .object({
    season: z.string(),
    round: z.number().int(),
    roster_id: z.number().int(),
    previous_owner_id: z.number().int(),
    owner_id: z.number().int(),
  })
  .passthrough();

export const TransactionSchema = z
  .object({
    transaction_id: z.string(),
    type: z.string(),
    status: z.string(),
    status_updated: z.number().optional(),
    created: z.number().optional(),
    leg: z.number().int().optional(),
    creator: z.string().nullable().optional(),
    roster_ids: z.array(z.number().int()).default([]),
    consenter_ids: z.array(z.number().int()).nullable().optional(),
    adds: z.record(z.string(), z.number().int()).nullable().optional(),
    drops: z.record(z.string(), z.number().int()).nullable().optional(),
    draft_picks: z.array(TradedPickSchema).default([]),
    waiver_budget: z
      .array(
        z
          .object({
            sender: z.number().int(),
            receiver: z.number().int(),
            amount: z.number(),
          })
          .passthrough(),
      )
      .default([]),
    settings: UnknownRecordSchema.nullable().optional(),
    metadata: UnknownRecordSchema.nullable().optional(),
  })
  .passthrough();

export const DraftSchema = z
  .object({
    draft_id: z.string(),
    league_id: z.string().nullable().optional(),
    season: z.string(),
    season_type: z.string().optional(),
    status: z.string(),
    type: z.string(),
    start_time: z.number().nullable().optional(),
    settings: UnknownRecordSchema.default({}),
    metadata: UnknownRecordSchema.nullable().optional(),
    draft_order: z.record(z.string(), z.number()).nullable().optional(),
    slot_to_roster_id: z
      .record(z.string(), z.union([z.number().int(), z.string()]))
      .nullable()
      .optional(),
    last_picked: z.number().nullable().optional(),
    created: z.number().nullable().optional(),
  })
  .passthrough();

export const DraftPickSchema = z
  .object({
    draft_id: z.string(),
    player_id: z.string(),
    pick_no: z.number().int(),
    round: z.number().int(),
    draft_slot: z.number().int(),
    roster_id: z.number().int().nullable().optional(),
    picked_by: z.string().nullable().optional(),
    is_keeper: z.boolean().nullable().optional(),
    metadata: UnknownRecordSchema.nullable().optional(),
  })
  .passthrough();

export const NflStateSchema = z
  .object({
    week: z.number().int(),
    leg: z.number().int().optional(),
    season: z.string(),
    season_type: z.string(),
    display_week: z.number().int().optional(),
    league_season: z.string().optional(),
    previous_season: z.string().optional(),
  })
  .passthrough();

export const SleeperPlayerSchema = z
  .object({
    player_id: z.string().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
    search_full_name: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    fantasy_positions: z.array(z.string()).nullable().optional(),
    team: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    injury_status: z.string().nullable().optional(),
    depth_chart_order: z.number().nullable().optional(),
    depth_chart_position: z
      .union([z.string(), z.number()])
      .nullable()
      .optional(),
    years_exp: z.number().nullable().optional(),
    search_rank: z.number().nullable().optional(),
    number: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export const PlayerMapSchema = z.record(z.string(), SleeperPlayerSchema);

export const TrendingPlayerSchema = z
  .object({
    player_id: z.string(),
    count: z.number(),
  })
  .passthrough();

export const BracketMatchSchema = z
  .object({
    r: z.number().int(),
    m: z.number().int(),
    t1: z.number().int().nullable().optional(),
    t2: z.number().int().nullable().optional(),
    w: z.number().int().nullable().optional(),
    l: z.number().int().nullable().optional(),
    p: z.number().int().nullable().optional(),
  })
  .passthrough();

export const LeagueUsersSchema = z.array(SleeperUserSchema);
export const RostersSchema = z.array(RosterSchema);
export const MatchupsSchema = z.array(MatchupSchema);
export const TransactionsSchema = z.array(TransactionSchema);
export const TradedPicksSchema = z.array(TradedPickSchema);
export const DraftsSchema = z.array(DraftSchema);
export const DraftPicksSchema = z.array(DraftPickSchema);
export const TrendingPlayersSchema = z.array(TrendingPlayerSchema);
export const BracketSchema = z.array(BracketMatchSchema);
