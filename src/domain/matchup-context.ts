import type { MatchupContextInput } from "./contracts.js";
import { cacheMetadata, leagueSummary, rosterView } from "./common.js";
import { resolveTeam } from "./identity.js";
import type { DomainDependencies, DomainResult, ToolWarning } from "./types.js";

export async function getMatchupContext(
  dependencies: DomainDependencies,
  input: MatchupContextInput,
): Promise<DomainResult<Record<string, unknown>>> {
  const { api, players } = dependencies;
  const week = input.week ?? (await api.getNflState()).week;
  const [league, users, rosters, matchups, directory] = await Promise.all([
    api.getLeague(input.league_id),
    api.getLeagueUsers(input.league_id),
    api.getRosters(input.league_id),
    api.getMatchups(input.league_id, week),
    players.get(),
  ]);
  const resolved = await resolveTeam(api, league, users, rosters, input.username_or_user_id);
  const warnings: ToolWarning[] = [];
  const teamMatchup = matchups.find((matchup) => matchup.roster_id === resolved.roster.roster_id);
  const opponentMatchup =
    teamMatchup?.matchup_id === undefined || teamMatchup.matchup_id === null
      ? undefined
      : matchups.find(
          (matchup) =>
            matchup.matchup_id === teamMatchup.matchup_id && matchup.roster_id !== resolved.roster.roster_id,
        );
  const opponentRoster = rosters.find((roster) => roster.roster_id === opponentMatchup?.roster_id);

  if (teamMatchup === undefined) {
    warnings.push({
      code: "MATCHUP_NOT_SCHEDULED",
      message: `No matchup row exists for roster ${String(resolved.roster.roster_id)} in week ${String(week)}.`,
    });
  } else if (opponentMatchup === undefined) {
    warnings.push({
      code: "OPPONENT_NOT_SCHEDULED",
      message: `No opponent shares matchup ID ${String(teamMatchup.matchup_id)} in week ${String(week)}.`,
    });
  }

  return {
    cache: cacheMetadata(directory, warnings),
    warnings,
    data: {
      league: leagueSummary(league),
      week,
      matchup_id: teamMatchup?.matchup_id ?? null,
      team: {
        ...rosterView(league, resolved.roster, users, directory.players, warnings),
        points: teamMatchup?.points ?? null,
        custom_points: teamMatchup?.custom_points ?? null,
      },
      opponent:
        opponentRoster === undefined
          ? null
          : {
              ...rosterView(league, opponentRoster, users, directory.players, warnings),
              points: opponentMatchup?.points ?? null,
              custom_points: opponentMatchup?.custom_points ?? null,
            },
      limitations: [
        "Sleeper matchup data does not supply current news, weather, independent projections, or an optimal-lineup recommendation.",
      ],
    },
  };
}
