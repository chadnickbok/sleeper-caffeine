import { SleeperClient } from "./client.js";
import {
  BracketSchema,
  DraftPicksSchema,
  DraftsSchema,
  LeagueSchema,
  LeagueUsersSchema,
  MatchupsSchema,
  NflStateSchema,
  PlayerMapSchema,
  RostersSchema,
  SleeperUserSchema,
  TradedPicksSchema,
  TransactionsSchema,
  TrendingPlayersSchema,
} from "./schemas.js";

function segment(value: string): string {
  return encodeURIComponent(value);
}

export class SleeperApi {
  constructor(readonly client: SleeperClient = new SleeperClient()) {}

  getUser(usernameOrUserId: string) {
    return this.client.get(`/user/${segment(usernameOrUserId)}`, SleeperUserSchema);
  }

  getNflState() {
    return this.client.get("/state/nfl", NflStateSchema);
  }

  getLeague(leagueId: string) {
    return this.client.get(`/league/${segment(leagueId)}`, LeagueSchema);
  }

  getLeagueUsers(leagueId: string) {
    return this.client.get(`/league/${segment(leagueId)}/users`, LeagueUsersSchema);
  }

  getRosters(leagueId: string) {
    return this.client.get(`/league/${segment(leagueId)}/rosters`, RostersSchema);
  }

  getMatchups(leagueId: string, week: number) {
    return this.client.get(`/league/${segment(leagueId)}/matchups/${week}`, MatchupsSchema);
  }

  getTransactions(leagueId: string, week: number) {
    return this.client.get(`/league/${segment(leagueId)}/transactions/${week}`, TransactionsSchema);
  }

  getTradedPicks(leagueId: string) {
    return this.client.get(`/league/${segment(leagueId)}/traded_picks`, TradedPicksSchema);
  }

  getDrafts(leagueId: string) {
    return this.client.get(`/league/${segment(leagueId)}/drafts`, DraftsSchema);
  }

  getDraftPicks(draftId: string) {
    return this.client.get(`/draft/${segment(draftId)}/picks`, DraftPicksSchema);
  }

  getPlayers() {
    return this.client.get("/players/nfl", PlayerMapSchema);
  }

  getTrending(type: "add" | "drop", lookbackHours = 24, limit = 100) {
    return this.client.get(`/players/nfl/trending/${type}`, TrendingPlayersSchema, {
      lookback_hours: lookbackHours,
      limit,
    });
  }

  getWinnersBracket(leagueId: string) {
    return this.client.get(`/league/${segment(leagueId)}/winners_bracket`, BracketSchema);
  }

  getLosersBracket(leagueId: string) {
    return this.client.get(`/league/${segment(leagueId)}/losers_bracket`, BracketSchema);
  }
}
