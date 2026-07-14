import { describe, expect, it } from "vitest";
import {
  getAvailablePlayers,
  getLeagueHistory,
  getMatchupContext,
  getTeamSnapshot,
  getTradeContext,
} from "@sleeper-caffeine/core";
import { createFixtureDependencies } from "../helpers.js";

describe("Sleeper domain services", () => {
  it("joins a team snapshot and finds its opponent", async () => {
    const result = await getTeamSnapshot(await createFixtureDependencies(), {
      league_id: "12345",
      username_or_user_id: "manager_one",
      week: 3,
    });

    const team = result.data["team"] as {
      starters: Array<{ name: string }>;
      bench: Array<{ name: string }>;
    };
    const matchup = result.data["matchup"] as {
      opponent: { roster_id: number };
    };
    expect(team.starters[0]?.name).toBe("Alice Quarterback");
    expect(team.bench[0]?.name).toBe("Bob Runner");
    expect(matchup.opponent.roster_id).toBe(2);
    expect(result.cache?.players_stale).toBe(false);
  });

  it("derives and ranks roster availability without including inactive players", async () => {
    const result = await getAvailablePlayers(
      await createFixtureDependencies(),
      {
        league_id: "12345",
        include_inactive: false,
        sort: "trending",
        limit: 30,
      },
    );
    const players = result.data["players"] as Array<{
      player_id: string;
      roster_availability: boolean;
      trending_add_count: number | null;
    }>;

    expect(players.map((player) => player.player_id)).toEqual([
      "p4",
      "p6",
      "SEA",
    ]);
    expect(players[0]).toMatchObject({
      roster_availability: true,
      trending_add_count: 42,
    });
    expect(players.some((player) => player.player_id === "p5")).toBe(false);
  });

  it("returns factual matchup context", async () => {
    const result = await getMatchupContext(await createFixtureDependencies(), {
      league_id: "12345",
      username_or_user_id: "u1",
      week: 3,
    });
    expect(result.data["matchup_id"]).toBe(7);
    expect((result.data["opponent"] as { roster_id: number }).roster_id).toBe(
      2,
    );
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_PLAYER_0" }),
    );
  });

  it("joins requested trade transactions", async () => {
    const result = await getTradeContext(await createFixtureDependencies(), {
      league_id: "12345",
      username_or_user_id: "u1",
      transaction_weeks: [3],
    });
    const transactionGroups = result.data["transactions"] as Array<{
      week: number;
      transactions: Array<{ transaction_id: string }>;
    }>;
    expect(transactionGroups[0]).toMatchObject({ week: 3 });
    expect(transactionGroups[0]?.transactions[0]?.transaction_id).toBe("tx1");
  });

  it("summarizes a league history chain", async () => {
    const result = await getLeagueHistory(await createFixtureDependencies(), {
      league_id: "12345",
      max_seasons: 5,
    });
    expect(result.data["seasons"]).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});
