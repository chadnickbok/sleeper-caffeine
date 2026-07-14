import type { z } from "zod/v4";
import type {
  BracketMatchSchema,
  DraftPickSchema,
  DraftSchema,
  LeagueSchema,
  MatchupSchema,
  NflStateSchema,
  RosterSchema,
  SleeperPlayerSchema,
  SleeperUserSchema,
  TradedPickSchema,
  TransactionSchema,
  TrendingPlayerSchema,
} from "./schemas.js";

export type SleeperUser = z.infer<typeof SleeperUserSchema>;
export type League = z.infer<typeof LeagueSchema>;
export type Roster = z.infer<typeof RosterSchema>;
export type Matchup = z.infer<typeof MatchupSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type TradedPick = z.infer<typeof TradedPickSchema>;
export type Draft = z.infer<typeof DraftSchema>;
export type DraftPick = z.infer<typeof DraftPickSchema>;
export type NflState = z.infer<typeof NflStateSchema>;
export type SleeperPlayer = z.infer<typeof SleeperPlayerSchema>;
export type TrendingPlayer = z.infer<typeof TrendingPlayerSchema>;
export type BracketMatch = z.infer<typeof BracketMatchSchema>;
