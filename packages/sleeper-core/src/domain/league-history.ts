import { SleeperMcpError } from "../errors.js";
import type {
  BracketMatch,
  League,
  Roster,
  SleeperUser,
} from "../sleeper/types.js";
import type { LeagueHistoryInput } from "./contracts.js";
import { leagueSummary, userForRoster } from "./common.js";
import type { DomainDependencies, DomainResult, ToolWarning } from "./types.js";

export async function getLeagueHistory(
  dependencies: DomainDependencies,
  input: LeagueHistoryInput,
): Promise<DomainResult<Record<string, unknown>>> {
  const { api } = dependencies;
  const warnings: ToolWarning[] = [];
  const seasons: Record<string, unknown>[] = [];
  const visited = new Set<string>();
  let leagueId: string | null = input.league_id;

  while (leagueId !== null && seasons.length < input.max_seasons) {
    if (visited.has(leagueId)) {
      warnings.push({
        code: "LEAGUE_HISTORY_CYCLE",
        message: `League history repeats league ID ${leagueId}.`,
      });
      break;
    }
    visited.add(leagueId);

    let league: League;
    try {
      league = await api.getLeague(leagueId);
    } catch (error) {
      if (seasons.length === 0) {
        throw error;
      }
      const normalized =
        error instanceof SleeperMcpError ? error.code : "SLEEPER_UNAVAILABLE";
      warnings.push({
        code: "LEAGUE_HISTORY_INCOMPLETE",
        message: `Could not load linked league ${leagueId} (${normalized}).`,
      });
      break;
    }

    const [users, rosters, bracket] = await Promise.all([
      api.getLeagueUsers(league.league_id),
      api.getRosters(league.league_id),
      loadBracket(dependencies, league, warnings),
    ]);
    const championRosterId = findChampion(bracket);
    seasons.push({
      league: leagueSummary(league),
      teams: rosters.map((roster) => summarizeHistoricalRoster(roster, users)),
      champion:
        championRosterId === null
          ? null
          : summarizeHistoricalRoster(
              rosters.find((roster) => roster.roster_id === championRosterId),
              users,
            ),
    });
    leagueId = league.previous_league_id ?? null;
  }

  if (leagueId !== null && seasons.length >= input.max_seasons) {
    warnings.push({
      code: "LEAGUE_HISTORY_LIMIT_REACHED",
      message: `Stopped after the requested ${String(input.max_seasons)} seasons.`,
    });
  }

  return {
    warnings,
    data: {
      starting_league_id: input.league_id,
      seasons,
    },
  };
}

async function loadBracket(
  dependencies: DomainDependencies,
  league: League,
  warnings: ToolWarning[],
): Promise<BracketMatch[]> {
  if (league.status !== "complete") {
    return [];
  }
  try {
    return await dependencies.api.getWinnersBracket(league.league_id);
  } catch {
    warnings.push({
      code: "PLAYOFF_BRACKET_UNAVAILABLE",
      message: `Could not load the winners bracket for ${league.name} (${league.season}).`,
    });
    return [];
  }
}

function findChampion(bracket: BracketMatch[]): number | null {
  const titleMatch = bracket.find(
    (match) => match.p === 1 && match.w !== null && match.w !== undefined,
  );
  if (titleMatch?.w !== undefined && titleMatch.w !== null) {
    return titleMatch.w;
  }
  const completed = bracket.filter(
    (match) => match.w !== null && match.w !== undefined,
  );
  const lastRound = completed.reduce<BracketMatch | undefined>(
    (latest, match) =>
      latest === undefined || match.r > latest.r ? match : latest,
    undefined,
  );
  return lastRound?.w ?? null;
}

function summarizeHistoricalRoster(
  roster: Roster | undefined,
  users: SleeperUser[],
) {
  if (roster === undefined) {
    return null;
  }
  const user = userForRoster(roster, users);
  const teamName = user?.metadata?.["team_name"];
  return {
    roster_id: roster.roster_id,
    owner_id: roster.owner_id ?? null,
    username: user?.username ?? null,
    display_name: user?.display_name ?? null,
    team_name: typeof teamName === "string" ? teamName : null,
    settings: roster.settings,
  };
}
