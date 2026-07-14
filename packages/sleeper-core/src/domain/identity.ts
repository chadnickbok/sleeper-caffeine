import { SleeperMcpError } from "../errors.js";
import type { League, Roster, SleeperUser } from "../sleeper/types.js";
import type { SleeperApi } from "../sleeper/endpoints.js";

export type ResolvedTeam = {
  user: SleeperUser;
  leagueUser: SleeperUser;
  roster: Roster;
};

export async function resolveTeam(
  api: SleeperApi,
  league: League,
  users: SleeperUser[],
  rosters: Roster[],
  usernameOrUserId: string,
): Promise<ResolvedTeam> {
  const user = await api.getUser(usernameOrUserId);
  const candidates = rosters.filter(
    (roster) =>
      roster.owner_id === user.user_id ||
      roster.co_owners?.includes(user.user_id) === true,
  );

  if (candidates.length !== 1) {
    throw new SleeperMcpError(
      "TEAM_NOT_FOUND",
      candidates.length === 0
        ? `User ${user.user_id} does not own a roster in league ${league.league_id}.`
        : `User ${user.user_id} matches multiple rosters in league ${league.league_id}.`,
      { details: { league_id: league.league_id, user_id: user.user_id } },
    );
  }

  const roster = candidates[0];
  if (roster === undefined) {
    throw new SleeperMcpError(
      "TEAM_NOT_FOUND",
      "The resolved Sleeper roster was unavailable.",
    );
  }
  const leagueUser =
    users.find((candidate) => candidate.user_id === user.user_id) ?? user;
  return { user, leagueUser, roster };
}
