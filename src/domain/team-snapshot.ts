import type { TeamSnapshotInput } from "./contracts.js";
import { cacheMetadata, leagueSummary, pickInventory, rosterView } from "./common.js";
import { resolveTeam } from "./identity.js";
import type { DomainDependencies, DomainResult, ToolWarning } from "./types.js";

export async function getTeamSnapshot(
  dependencies: DomainDependencies,
  input: TeamSnapshotInput,
): Promise<DomainResult<Record<string, unknown>>> {
  const { api, players } = dependencies;
  const week = input.week ?? (await api.getNflState()).week;
  const [league, users, rosters, matchups, tradedPicks, directory] = await Promise.all([
    api.getLeague(input.league_id),
    api.getLeagueUsers(input.league_id),
    api.getRosters(input.league_id),
    api.getMatchups(input.league_id, week),
    api.getTradedPicks(input.league_id),
    players.get(),
  ]);
  const resolved = await resolveTeam(api, league, users, rosters, input.username_or_user_id);
  const warnings: ToolWarning[] = [];
  const team = rosterView(league, resolved.roster, users, directory.players, warnings);
  const teamMatchup = matchups.find((matchup) => matchup.roster_id === resolved.roster.roster_id);
  const opponentMatchup =
    teamMatchup?.matchup_id === undefined || teamMatchup.matchup_id === null
      ? undefined
      : matchups.find(
          (matchup) =>
            matchup.matchup_id === teamMatchup.matchup_id && matchup.roster_id !== resolved.roster.roster_id,
        );
  const opponentRoster =
    opponentMatchup === undefined
      ? undefined
      : rosters.find((roster) => roster.roster_id === opponentMatchup.roster_id);

  return {
    cache: cacheMetadata(directory, warnings),
    warnings,
    data: {
      league: leagueSummary(league),
      week,
      user: {
        user_id: resolved.user.user_id,
        username: resolved.leagueUser.username ?? resolved.user.username ?? null,
        display_name: resolved.leagueUser.display_name ?? resolved.user.display_name ?? null,
      },
      team,
      matchup: {
        matchup_id: teamMatchup?.matchup_id ?? null,
        points: teamMatchup?.points ?? null,
        custom_points: teamMatchup?.custom_points ?? null,
        opponent:
          opponentRoster === undefined
            ? null
            : {
                ...rosterView(league, opponentRoster, users, directory.players, warnings),
                points: opponentMatchup?.points ?? null,
                custom_points: opponentMatchup?.custom_points ?? null,
              },
      },
      pick_inventory: pickInventory(resolved.roster.roster_id, tradedPicks),
    },
  };
}
