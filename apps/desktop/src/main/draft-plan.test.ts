import type {
  Dashboard,
  DraftPlanOutput,
  PlayerView,
} from "@sleeper-caffeine/ipc-contract";
import { describe, expect, it } from "vitest";
import {
  buildDraftPlan,
  draftPlanInputHash,
  reconcileDraftPlan,
} from "./draft-plan.js";

const generatedAt = "2026-07-14T12:00:00.000Z";

function player(playerId: string, name: string, position = "WR"): PlayerView {
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

function dashboard(
  options: {
    boardHash?: string;
    candidates?: string[];
    targetPick?: PlayerView | null;
    targetIsMine?: boolean;
    upcoming?: number[];
  } = {},
): Dashboard {
  const candidates = options.candidates ?? ["primary", "fallback", "later"];
  const names = new Map([
    ["primary", "Primary Target"],
    ["fallback", "Fallback Target"],
    ["later", "Later Target"],
  ]);
  return {
    league: {
      leagueId: "league-1",
      name: "Test League",
      season: "2026",
      rosterId: 1,
      userId: "user-1",
      teamName: "My Team",
      avatar: null,
      lastRefreshedAt: generatedAt,
      isActive: true,
    },
    capturedAt: generatedAt,
    week: 1,
    leagueStatus: "drafting",
    scoringLabel: "PPR",
    rosterPositions: ["QB", "RB", "WR", "FLEX"],
    starters: [],
    bench: [],
    reserve: [],
    taxi: [],
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0 },
    pickInventory: null,
    warnings: [],
    draft: {
      draftId: "draft-1",
      status: "live",
      sourceStatus: "drafting",
      type: "snake",
      startTime: null,
      lastPicked: 6,
      rounds: 3,
      teams: 12,
      totalPicks: 36,
      currentPickNo: 7,
      boardHash: options.boardHash ?? "board-a",
      picks: [],
      draftTeams: [],
      board: [
        {
          pickNo: 12,
          round: 1,
          draftSlot: 12,
          originalRosterId: 1,
          ownerRosterId: 1,
          ownerTeamName: "My Team",
          isMine: options.targetIsMine ?? true,
          isTraded: false,
          isOnClock: false,
          pick: options.targetPick
            ? {
                pickNo: 12,
                round: 1,
                draftSlot: 12,
                rosterId: 1,
                isKeeper: false,
                player: options.targetPick,
              }
            : null,
        },
      ],
      myUpcomingPickNumbers: options.upcoming ?? [12, 36],
      candidatePoolMode: "rookies",
      candidates: candidates.map((id, index) => ({
        rank: index + 1,
        player: player(id, names.get(id) ?? id),
        marketRank: index + 1,
        positionRank: index + 1,
        score: 100 - index,
        fitLabel: "value" as const,
        rationale: "Deterministic baseline rationale",
        pinned: false,
        scoreBreakdown: {
          market: 50,
          rosterFit: 20,
          scarcity: 10,
          pickWindow: 10,
          upside: 10,
        },
      })),
    },
    nextMatchup: null,
  };
}

const output: DraftPlanOutput = {
  headline: "Take the primary target at twelve",
  summary: "The fallback remains viable if the board moves before your pick.",
  confidence: "high",
  cards: [],
  actions: [],
  sources: [],
  caveats: [],
  primaryPlayerId: "primary",
  fallbackPlayerIds: ["fallback"],
  recommendations: [
    {
      playerId: "primary",
      planRank: 1,
      tier: "Best fit",
      role: "primary",
      rationale: "Best combination of value and roster fit.",
      risks: [],
      confidence: "high",
      expectedAvailability: "possible",
    },
    {
      playerId: "fallback",
      planRank: 2,
      tier: "Fallback",
      role: "fallback",
      rationale: "A safe fallback if the primary target is selected.",
      risks: ["Lower ceiling"],
      confidence: "medium",
      expectedAvailability: "likely",
    },
  ],
  futurePickPlans: [
    {
      pickNo: 36,
      targetPlayerIds: ["later"],
      strategy: "Preserve optionality for the final pick.",
    },
  ],
};

describe("draft plan lifecycle", () => {
  it("binds a structured recommendation to the exact board snapshot", () => {
    const source = dashboard();
    const plan = buildDraftPlan({ dashboard: source, output, generatedAt });

    expect(plan.boardHash).toBe("board-a");
    expect(plan.inputHash).toBe(draftPlanInputHash(source));
    expect(plan.primaryPlayerId).toBe("primary");
    expect(plan.recommendations[0]?.baselineRank).toBe(1);
    expect(
      reconcileDraftPlan(plan, source, Date.parse(generatedAt)).status,
    ).toBe("current");
  });

  it("keeps a plan usable when the board advances without removing its target", () => {
    const plan = buildDraftPlan({
      dashboard: dashboard(),
      output,
      generatedAt,
    });
    const reconciled = reconcileDraftPlan(
      plan,
      dashboard({ boardHash: "board-b" }),
      Date.parse(generatedAt) + 60_000,
    );

    expect(reconciled.status).toBe("advanced_valid");
    expect(reconciled.activeRecommendationPlayerId).toBe("primary");
  });

  it("activates the approved fallback when the primary target is drafted", () => {
    const plan = buildDraftPlan({
      dashboard: dashboard(),
      output,
      generatedAt,
    });
    const reconciled = reconcileDraftPlan(
      plan,
      dashboard({ boardHash: "board-b", candidates: ["fallback", "later"] }),
      Date.parse(generatedAt) + 60_000,
    );

    expect(reconciled.status).toBe("fallback_active");
    expect(reconciled.activeRecommendationPlayerId).toBe("fallback");
  });

  it("completes the plan when the owned target pick is filled", () => {
    const plan = buildDraftPlan({
      dashboard: dashboard(),
      output,
      generatedAt,
    });
    const selected = player("primary", "Primary Target");
    const reconciled = reconcileDraftPlan(
      plan,
      dashboard({ targetPick: selected, upcoming: [36] }),
    );

    expect(reconciled.status).toBe("completed");
    expect(reconciled.selectedPlayerId).toBe("primary");
    expect(reconciled.activeRecommendationPlayerId).toBeNull();
  });

  it("rejects recommendations for players outside the live candidate pool", () => {
    expect(() =>
      buildDraftPlan({
        dashboard: dashboard(),
        output: {
          ...output,
          primaryPlayerId: "unavailable",
          recommendations: [
            ...output.recommendations,
            {
              ...output.recommendations[0]!,
              playerId: "unavailable",
              planRank: 3,
            },
          ],
        },
        generatedAt,
      }),
    ).toThrow("unavailable player");
  });
});
