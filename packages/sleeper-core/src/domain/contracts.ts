import { z } from "zod/v4";

const LeagueIdSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "league_id must contain only digits");
const UserIdentitySchema = z.string().trim().min(1).max(100);
const WeekSchema = z.number().int().min(1).max(25);

export const TeamSnapshotInputSchema = z.object({
  league_id: LeagueIdSchema,
  username_or_user_id: UserIdentitySchema,
  week: WeekSchema.optional(),
});

export const AvailablePlayersInputSchema = z.object({
  league_id: LeagueIdSchema,
  positions: z.array(z.string().trim().min(1).max(10)).max(10).optional(),
  query: z.string().trim().min(1).max(100).optional(),
  include_inactive: z.boolean().default(false),
  sort: z.enum(["trending", "search_rank", "name"]).default("trending"),
  limit: z.number().int().min(1).max(100).default(30),
});

export const MatchupContextInputSchema = z.object({
  league_id: LeagueIdSchema,
  username_or_user_id: UserIdentitySchema,
  week: WeekSchema.optional(),
});

export const TradeContextInputSchema = z.object({
  league_id: LeagueIdSchema,
  username_or_user_id: UserIdentitySchema,
  transaction_weeks: z.array(WeekSchema).max(8).optional(),
});

export const LeagueHistoryInputSchema = z.object({
  league_id: LeagueIdSchema,
  max_seasons: z.number().int().min(1).max(10).default(5),
});

export const DraftSnapshotInputSchema = z.object({
  league_id: LeagueIdSchema,
  roster_id: z.number().int().positive(),
});

export type TeamSnapshotInput = z.infer<typeof TeamSnapshotInputSchema>;
export type AvailablePlayersInput = z.infer<typeof AvailablePlayersInputSchema>;
export type MatchupContextInput = z.infer<typeof MatchupContextInputSchema>;
export type TradeContextInput = z.infer<typeof TradeContextInputSchema>;
export type LeagueHistoryInput = z.infer<typeof LeagueHistoryInputSchema>;
export type DraftSnapshotInput = z.infer<typeof DraftSnapshotInputSchema>;
