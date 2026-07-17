import { describe, expect, it } from "vitest";
import type {
  DraftCandidateView,
  PlayerView,
} from "@sleeper-caffeine/ipc-contract";
import { selectVisibleDraftCandidates } from "./candidate-selectors.js";

function player(playerId: string, name: string, position: string): PlayerView {
  return {
    playerId,
    name,
    position,
    nflTeam: "TEST",
    injuryStatus: null,
    status: "Active",
    isStarter: false,
    isReserve: false,
    isTaxi: false,
    rosterSlot: null,
  };
}

function candidate(
  playerId: string,
  name: string,
  position: string,
  rank: number,
): DraftCandidateView {
  return {
    rank,
    player: player(playerId, name, position),
    marketRank: rank,
    positionRank: rank,
    score: 100 - rank,
    fitLabel: "value",
    rationale: "Test ranking",
    pinned: false,
    scoreBreakdown: {
      market: 1,
      rosterFit: 1,
      scarcity: 1,
      pickWindow: 1,
      upside: 1,
    },
  };
}

describe("selectVisibleDraftCandidates", () => {
  const candidates = [
    candidate("alpha", "Alpha Runner", "RB", 1),
    candidate("bravo", "Bravo Receiver", "WR", 2),
    candidate("charlie", "Charlie Runner", "RB", 3),
  ];

  it("promotes researched plan ranks ahead of the deterministic baseline", () => {
    const result = selectVisibleDraftCandidates({
      candidates,
      recommendations: [
        {
          player: candidates[2]!.player,
          planRank: 1,
          baselineRank: 3,
          tier: "A",
          role: "primary",
          rationale: "Best team fit",
          risks: [],
          confidence: "high",
          expectedAvailability: "possible",
        },
      ],
      position: "ALL",
      query: "",
    });
    expect(result.map((item) => item.player.playerId)).toEqual([
      "charlie",
      "alpha",
      "bravo",
    ]);
  });

  it("filters by position and normalized player search", () => {
    const result = selectVisibleDraftCandidates({
      candidates,
      recommendations: [],
      position: "RB",
      query: "charlie",
    });
    expect(result.map((item) => item.player.playerId)).toEqual(["charlie"]);
  });
});
