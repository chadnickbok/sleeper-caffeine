import type {
  Draft,
  DraftPick,
  PlayerSummary,
  Roster,
  SleeperUser,
  TradedPick,
} from "@sleeper-caffeine/core";
import { describe, expect, it } from "vitest";
import { buildDraftModel, pickNumberForSlot, selectDraft } from "./draft-model.js";

const players = new Map<string, PlayerSummary>([
  ["p1", player("p1", "First Receiver", "WR", 10)],
  ["p2", player("p2", "Second Receiver", "WR", 20)],
  ["p3", player("p3", "Top Runner", "RB", 15)],
  ["owned", player("owned", "Rostered Player", "WR", 5, 2)],
]);
const users: SleeperUser[] = Array.from({ length: 3 }, (_, index) => ({
  user_id: `u${String(index + 1)}`,
  display_name: `Team ${String(index + 1)}`,
  metadata: { team_name: `Team ${String(index + 1)}` },
}));
const rosters: Roster[] = Array.from({ length: 3 }, (_, index) => ({
  roster_id: index + 1,
  owner_id: `u${String(index + 1)}`,
  players: index === 0 ? ["owned"] : [],
  starters: [],
  reserve: [],
  taxi: [],
  settings: {},
}));

describe("draft model", () => {
  it("treats pre_draft drafts with picks as live and respects traded ownership", () => {
    const model = buildDraftModel({
      draft: draft({ status: "pre_draft", start_time: null }),
      picks: [pick(1, 1, 1, "p1")],
      tradedPicks: [trade(1, 3, 1), trade(2, 1, 2)],
      saved: savedLeague(1),
      rosters,
      users,
      players,
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "FLEX"],
      leagueSettings: { type: 2 },
      pinnedPlayerIds: new Set(),
      now: 100,
    });

    expect(model.status).toBe("live");
    expect(model.currentPickNo).toBe(2);
    expect(model.myUpcomingPickNumbers).toEqual([3, 7]);
    expect(model.board.find((cell) => cell.pickNo === 4)).toMatchObject({
      originalRosterId: 1,
      ownerRosterId: 2,
      isTraded: true,
      isMine: false,
    });
  });

  it("uses the first missing pick after a commissioner undo", () => {
    const model = buildDraftModel({
      draft: draft({ status: "drafting" }),
      picks: [pick(1, 1, 1, "p1"), pick(3, 1, 3, "p2")],
      tradedPicks: [],
      saved: savedLeague(1),
      rosters,
      users,
      players,
      rosterPositions: [],
      leagueSettings: {},
      pinnedPlayerIds: new Set(),
    });
    expect(model.currentPickNo).toBe(2);
    expect(model.board.find((cell) => cell.pickNo === 2)?.isOnClock).toBe(true);
  });

  it("keeps pins in candidate context without changing their score", () => {
    const unpinned = buildDraftModel({
      draft: draft({ status: "pre_draft" }),
      picks: [],
      tradedPicks: [],
      saved: savedLeague(1),
      rosters,
      users,
      players,
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "FLEX"],
      leagueSettings: { type: 2 },
      pinnedPlayerIds: new Set(),
    });
    const pinned = buildDraftModel({
      draft: draft({ status: "pre_draft" }),
      picks: [],
      tradedPicks: [],
      saved: savedLeague(1),
      rosters,
      users,
      players,
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "FLEX"],
      leagueSettings: { type: 2 },
      pinnedPlayerIds: new Set(["p2"]),
    });
    const before = unpinned.candidates.find((candidate) => candidate.player.playerId === "p2");
    const after = pinned.candidates.find((candidate) => candidate.player.playerId === "p2");
    expect(after?.pinned).toBe(true);
    expect(after?.score).toBe(before?.score);
    expect(after?.rank).toBe(before?.rank);
  });

  it("includes players already drafted by this roster in roster-fit scoring", () => {
    const before = buildDraftModel({
      draft: draft({ status: "pre_draft" }),
      picks: [],
      tradedPicks: [],
      saved: savedLeague(1),
      rosters,
      users,
      players,
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "FLEX"],
      leagueSettings: { type: 2 },
      pinnedPlayerIds: new Set(),
    });
    const after = buildDraftModel({
      draft: draft({ status: "drafting" }),
      picks: [pick(1, 1, 1, "p1")],
      tradedPicks: [],
      saved: savedLeague(1),
      rosters,
      users,
      players,
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "FLEX"],
      leagueSettings: { type: 2 },
      pinnedPlayerIds: new Set(),
    });

    const beforeReceiver = before.candidates.find(
      (candidate) => candidate.player.playerId === "p2",
    );
    const afterReceiver = after.candidates.find(
      (candidate) => candidate.player.playerId === "p2",
    );
    expect(afterReceiver?.scoreBreakdown.rosterFit).toBeLessThan(
      beforeReceiver?.scoreBreakdown.rosterFit ?? 0,
    );
  });

  it("prefers the league's explicit draft and supports snake ordering", () => {
    const old = draft({ draft_id: "old", status: "complete" });
    const current = draft({ draft_id: "current", status: "pre_draft" });
    expect(selectDraft([old, current], "old")?.draft_id).toBe("old");
    expect(pickNumberForSlot("snake", 2, 1, 3)).toBe(6);
    expect(pickNumberForSlot("snake", 2, 3, 3)).toBe(4);
    expect(pickNumberForSlot("snake", 3, 1, 3, 3)).toBe(9);
  });
});

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    draft_id: "draft-1",
    league_id: "league-1",
    season: "2026",
    status: "pre_draft",
    type: "linear",
    start_time: null,
    settings: { teams: 3, rounds: 3 },
    metadata: { scoring_type: "dynasty_ppr" },
    draft_order: { u1: 1, u2: 2, u3: 3 },
    slot_to_roster_id: { "1": 1, "2": 2, "3": 3 },
    ...overrides,
  };
}

function pick(
  pickNo: number,
  round: number,
  draftSlot: number,
  playerId: string,
): DraftPick {
  return {
    draft_id: "draft-1",
    player_id: playerId,
    pick_no: pickNo,
    round,
    draft_slot: draftSlot,
    roster_id: draftSlot,
    is_keeper: false,
  };
}

function trade(round: number, rosterId: number, ownerId: number): TradedPick {
  return {
    season: "2026",
    round,
    roster_id: rosterId,
    previous_owner_id: rosterId,
    owner_id: ownerId,
  };
}

function player(
  id: string,
  name: string,
  position: string,
  searchRank: number,
  yearsExp = 0,
): PlayerSummary {
  return {
    player_id: id,
    name,
    position,
    fantasy_positions: [position],
    team: "TST",
    status: "Active",
    injury_status: null,
    depth_chart_order: 1,
    years_exp: yearsExp,
    search_rank: searchRank,
  };
}

function savedLeague(rosterId: number) {
  return {
    leagueId: "league-1",
    name: "Test League",
    season: "2026",
    rosterId,
    userId: `u${String(rosterId)}`,
    teamName: `Team ${String(rosterId)}`,
    avatar: null,
    lastRefreshedAt: null,
    isActive: true,
  };
}
