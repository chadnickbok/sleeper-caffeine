import { z } from "zod/v4";
import { PlayerMapSchema } from "../sleeper/schemas.js";

export const PLAYER_CACHE_SOURCE =
  "https://api.sleeper.app/v1/players/nfl" as const;

export const PlayerCacheFileSchema = z.object({
  schemaVersion: z.literal(1),
  fetchedAt: z.iso.datetime(),
  source: z.literal(PLAYER_CACHE_SOURCE),
  players: PlayerMapSchema,
});

export type PlayerCacheFile = z.infer<typeof PlayerCacheFileSchema>;

export const PlayerSummarySchema = z.object({
  player_id: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  fantasy_positions: z.array(z.string()),
  team: z.string().nullable(),
  status: z.string().nullable(),
  injury_status: z.string().nullable(),
  depth_chart_order: z.number().nullable(),
  years_exp: z.number().nullable(),
  search_rank: z.number().nullable(),
});

export type PlayerSummary = z.infer<typeof PlayerSummarySchema>;
