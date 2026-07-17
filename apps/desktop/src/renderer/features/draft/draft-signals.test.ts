import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  DraftCandidateView,
  DraftPlan,
  DraftView,
  PlayerView,
} from "@sleeper-caffeine/ipc-contract";
import {
  DRAFT_POLL_INTERVAL_MS,
  selectDraftRoomSignals,
  startDraftPolling,
} from "./draft-signals.js";

afterEach(() => vi.useRealTimers());

test("polling refreshes on a short interval and stops cleanly", () => {
  vi.useFakeTimers();
  const refresh = vi.fn();
  const stop = startDraftPolling(refresh);

  vi.advanceTimersByTime(DRAFT_POLL_INTERVAL_MS * 2);
  expect(refresh).toHaveBeenCalledTimes(2);

  stop();
  vi.advanceTimersByTime(DRAFT_POLL_INTERVAL_MS);
  expect(refresh).toHaveBeenCalledTimes(2);
});

describe("draft room signals", () => {
  test("explains an activated fallback and a live positional run", () => {
    const draft = draftView();
    const plan = draftPlan();
    draft.picks = [
      pick(1, "primary", "Primary Target", "WR"),
      pick(2, "wr-two", "Second Receiver", "WR"),
      pick(3, "wr-three", "Third Receiver", "WR"),
    ];
    draft.candidates = [candidate("fallback", "Fallback Target", "RB", 1, 90)];
    plan.status = "fallback_active";
    plan.activeRecommendationPlayerId = "fallback";

    const signals = selectDraftRoomSignals(draft, plan);

    expect(signals.board.label).toBe("3 picks since plan");
    expect(signals.board.detail).toContain("Fallback Target");
    expect(signals.position.label).toBe("WR run · 3 straight");
    expect(signals.tier.label).toBe("Tier 2");
  });

  test("builds a deterministic value band before an AI plan exists", () => {
    const draft = draftView();
    draft.candidates = [
      candidate("one", "Prospect One", "WR", 1, 90),
      candidate("two", "Prospect Two", "RB", 2, 88),
      candidate("three", "Prospect Three", "TE", 3, 82),
    ];

    const signals = selectDraftRoomSignals(draft, null);

    expect(signals.board.label).toBe("Live board ready");
    expect(signals.position.label).toBe("Waiting for pick one");
    expect(signals.tier.detail).toContain("2 players");
  });

  test("uses lifecycle-specific board language without an AI plan", () => {
    const scheduled = draftView();
    scheduled.status = "scheduled";
    expect(selectDraftRoomSignals(scheduled, null).board.label).toBe(
      "Board staged",
    );

    const complete = draftView();
    complete.status = "complete";
    complete.picks = [pick(1, "one", "One", "RB")];
    expect(selectDraftRoomSignals(complete, null).board.label).toBe(
      "Final board locked",
    );
  });
});

function draftView(): NonNullable<DraftView> {
  return {
    draftId: "draft-1",
    status: "live",
    sourceStatus: "drafting",
    type: "snake",
    startTime: null,
    lastPicked: null,
    rounds: 2,
    teams: 2,
    totalPicks: 4,
    currentPickNo: 1,
    boardHash: "board-1",
    picks: [],
    draftTeams: [],
    board: [],
    myUpcomingPickNumbers: [2, 4],
    candidatePoolMode: "rookies",
    candidates: [],
  };
}

function draftPlan(): DraftPlan {
  return {
    draftId: "draft-1",
    boardHash: "old-board",
    inputHash: "input-1",
    basedOnPickCount: 0,
    currentPickNo: 1,
    targetPickNo: 4,
    generatedAt: "2026-07-17T12:00:00.000Z",
    researchFreshThrough: "2026-07-18T00:00:00.000Z",
    status: "advanced_valid",
    statusReason: null,
    activeRecommendationPlayerId: "primary",
    selectedPlayerId: null,
    primaryPlayerId: "primary",
    fallbackPlayerIds: ["fallback"],
    recommendations: [
      {
        player: player("primary", "Primary Target", "WR"),
        planRank: 1,
        baselineRank: 1,
        tier: "Tier 1",
        role: "primary",
        rationale: "Best combination of value and fit.",
        risks: [],
        confidence: "high",
        expectedAvailability: "possible",
      },
      {
        player: player("fallback", "Fallback Target", "RB"),
        planRank: 2,
        baselineRank: 2,
        tier: "Tier 2",
        role: "fallback",
        rationale: "Approved pivot.",
        risks: [],
        confidence: "medium",
        expectedAvailability: "likely",
      },
    ],
    futurePickPlans: [],
  };
}

function pick(
  pickNo: number,
  playerId: string,
  name: string,
  position: string,
) {
  return {
    pickNo,
    round: 1,
    draftSlot: pickNo,
    rosterId: 2,
    isKeeper: false,
    player: player(playerId, name, position),
  };
}

function candidate(
  playerId: string,
  name: string,
  position: string,
  rank: number,
  score: number,
): DraftCandidateView {
  return {
    rank,
    player: player(playerId, name, position),
    marketRank: rank,
    positionRank: rank,
    score,
    fitLabel: "value",
    rationale: "Baseline rationale",
    pinned: false,
    scoreBreakdown: {
      market: 60,
      rosterFit: 15,
      scarcity: 10,
      pickWindow: 10,
      upside: 5,
    },
  };
}

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
