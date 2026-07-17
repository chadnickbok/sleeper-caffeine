import type {
  Dashboard,
  DraftPlan,
  PlayerView,
  WatchlistEntry,
} from "@sleeper-caffeine/ipc-contract";
import { describe, expect, it } from "vitest";
import {
  buildDraftSeasonHandoff,
  type PinnedResearchTarget,
} from "./draft-season-handoff.js";

const capturedAt = "2026-08-28T12:00:00.000Z";
const generatedAt = "2026-08-28T13:00:00.000Z";

function player(id: string, name = id): PlayerView {
  return {
    playerId: id,
    name,
    position: "WR",
    nflTeam: "SEA",
    injuryStatus: null,
    status: "Active",
    isStarter: false,
    isReserve: false,
    isTaxi: false,
    rosterSlot: null,
  };
}

function dashboard(
  input: {
    status?: NonNullable<Dashboard["draft"]>["status"];
    includeDraft?: boolean;
    picks?: Array<{
      pickNo: number;
      round: number;
      rosterId: number | null;
      player: PlayerView | null;
    }>;
    rostered?: PlayerView[];
  } = {},
): Dashboard {
  const picks = input.picks ?? [
    { pickNo: 2, round: 1, rosterId: 7, player: player("alpha", "Alpha") },
    { pickNo: 4, round: 1, rosterId: 2, player: player("rival", "Rival") },
    { pickNo: 19, round: 2, rosterId: 7, player: player("beta", "Beta") },
  ];
  const draft =
    input.includeDraft === false
      ? null
      : {
          draftId: "draft-1",
          status: input.status ?? ("complete" as const),
          sourceStatus: input.status ?? "complete",
          type: "snake",
          startTime: null,
          lastPicked: Date.parse(capturedAt),
          rounds: 3,
          teams: 12,
          totalPicks: 36,
          currentPickNo: null,
          boardHash: "final-board",
          picks: picks.map((pick) => ({
            ...pick,
            draftSlot: ((pick.pickNo - 1) % 12) + 1,
            isKeeper: false,
          })),
          draftTeams: [],
          board: [],
          myUpcomingPickNumbers: [],
          candidatePoolMode: "rookies" as const,
          candidates: [],
        };
  return {
    league: {
      leagueId: "league-1",
      name: "Test League",
      season: "2026",
      rosterId: 7,
      userId: "user-7",
      teamName: "Caffeinated",
      avatar: null,
      lastRefreshedAt: capturedAt,
      isActive: true,
    },
    capturedAt,
    week: 1,
    leagueStatus: "pre_draft",
    scoringLabel: "Half PPR",
    rosterPositions: ["QB", "RB", "WR", "FLEX", "BN"],
    starters: [],
    bench: input.rostered ?? [player("alpha", "Alpha"), player("beta", "Beta")],
    reserve: [],
    taxi: [],
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0 },
    pickInventory: {},
    warnings: [],
    draft,
    nextMatchup: null,
  };
}

function plan(): DraftPlan {
  return {
    draftId: "draft-1",
    boardHash: "earlier-board",
    inputHash: "input",
    basedOnPickCount: 1,
    currentPickNo: 2,
    targetPickNo: 2,
    generatedAt: "2026-08-28T10:00:00.000Z",
    researchFreshThrough: "2026-08-28T22:00:00.000Z",
    status: "completed",
    statusReason: "Alpha selected",
    activeRecommendationPlayerId: null,
    selectedPlayerId: "alpha",
    primaryPlayerId: "alpha",
    fallbackPlayerIds: ["gamma"],
    recommendations: [
      {
        player: player("alpha", "Alpha"),
        planRank: 1,
        baselineRank: 2,
        tier: "Target",
        role: "primary",
        rationale:
          "Alpha has a plausible early-season role and durable upside.",
        risks: ["The depth chart remains unsettled"],
        confidence: "medium",
        expectedAvailability: "possible",
      },
      {
        player: player("gamma", "Gamma"),
        planRank: 2,
        baselineRank: 4,
        tier: "Fallback",
        role: "fallback",
        rationale: "Gamma is a useful pivot.",
        risks: [],
        confidence: "medium",
        expectedAvailability: "likely",
      },
    ],
    futurePickPlans: [
      {
        pickNo: 19,
        targetPlayerIds: ["beta"],
        strategy: "Take Beta later.",
      },
    ],
  };
}

function existing(playerId: string): WatchlistEntry {
  return {
    id: `existing-${playerId}`,
    leagueId: "league-1",
    playerId,
    hypothesis: "Already watching",
    trigger: "Existing trigger",
    state: "active",
    createdSeason: "2026",
    createdWeek: 1,
    expiresSeason: null,
    expiresWeek: null,
    createdAt: capturedAt,
    updatedAt: capturedAt,
  };
}

describe("draft season handoff", () => {
  it("preserves manager selections, assesses plan alignment, and seeds rostered picks", () => {
    const handoff = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      draftPlan: plan(),
      generatedAt,
    });

    expect(handoff.outcomes).toHaveLength(2);
    expect(handoff.outcomes.map((outcome) => outcome.planAlignment)).toEqual([
      "primary",
      "later",
    ]);
    expect(handoff.outcomes[0]?.assessment).toContain(
      "matched the primary Caffeine target",
    );
    expect(handoff.watchlistSeeds.map((seed) => seed.entry.playerId)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(handoff.watchlistSeeds[0]?.entry).toMatchObject({
      createdSeason: "2026",
      createdWeek: 1,
      expiresSeason: "2026",
      expiresWeek: 1,
    });
    expect(handoff.watchlistSeeds[0]?.entry.hypothesis).toContain(
      "Preseason draft thesis",
    );
    expect(handoff.summary).toMatchObject({
      status: "complete",
      draftedCount: 2,
      rosteredDraftedCount: 2,
      plannedSelectionCount: 2,
      newWatchlistCount: 2,
      canBuildWeekOneOutlook: true,
    });
  });

  it("never seeds a drafted player who is no longer on the selected roster", () => {
    const handoff = buildDraftSeasonHandoff({
      dashboard: dashboard({ rostered: [player("alpha", "Alpha")] }),
      draftPlan: plan(),
      generatedAt,
    });

    expect(handoff.watchlistSeeds.map((seed) => seed.entry.playerId)).toEqual([
      "alpha",
    ]);
    expect(handoff.outcomes[1]).toMatchObject({
      currentlyRostered: false,
      player: { playerId: "beta" },
    });
    expect(handoff.outcomes[1]?.assessment).toContain(
      "no roster-purpose claim",
    );
    expect(handoff.summary.skippedNotRosteredCount).toBe(1);
  });

  it("allows an off-roster player only when explicitly supplied as a pinned monitor", () => {
    const pinned: PinnedResearchTarget = {
      player: player("outside", "Outside Target"),
    };
    const handoff = buildDraftSeasonHandoff({
      dashboard: dashboard({ rostered: [player("alpha", "Alpha")] }),
      draftPlan: plan(),
      pinnedResearchTargets: [pinned],
      generatedAt,
    });

    const outside = handoff.watchlistSeeds.find(
      (seed) => seed.entry.playerId === "outside",
    );
    expect(outside).toMatchObject({
      provenance: { source: "pinned_research_target" },
      entry: { playerId: "outside" },
    });
    expect(outside?.entry.hypothesis).toContain("explicitly pinned");
    expect(handoff.summary.externalMonitorCount).toBe(1);
  });

  it("deduplicates drafted and pinned inputs and skips every existing watchlist player", () => {
    const handoff = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      draftPlan: plan(),
      pinnedResearchTargets: [
        { player: player("alpha", "Alpha") },
        { player: player("outside", "Outside") },
        { player: player("outside", "Outside duplicate") },
      ],
      existingWatchlist: [existing("beta"), existing("outside")],
      generatedAt,
    });

    expect(handoff.watchlistSeeds.map((seed) => seed.entry.playerId)).toEqual([
      "alpha",
    ]);
    expect(handoff.summary.skippedExistingCount).toBe(2);
  });

  it("does not double-count an existing player that is also pinned", () => {
    const handoff = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      pinnedResearchTargets: [{ player: player("alpha", "Alpha") }],
      existingWatchlist: [existing("alpha")],
      generatedAt,
    });

    expect(handoff.summary.skippedExistingCount).toBe(1);
    expect(
      handoff.watchlistSeeds.some((seed) => seed.entry.playerId === "alpha"),
    ).toBe(false);
  });

  it("uses stable entry IDs and deterministic timestamps for idempotent upserts", () => {
    const first = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      draftPlan: plan(),
    });
    const second = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      draftPlan: plan(),
    });

    expect(second.watchlistSeeds).toEqual(first.watchlistSeeds);
    expect(first.watchlistSeeds[0]?.entry.id).toMatch(
      /^draft-handoff-[a-f0-9]{16}$/,
    );
    expect(first.watchlistSeeds[0]?.entry.createdAt).toBe(capturedAt);
  });

  it("labels preseason research with original freshness instead of current-week truth", () => {
    const fresh = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      draftPlan: plan(),
      generatedAt,
    });
    const stale = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      draftPlan: plan(),
      generatedAt: "2026-08-29T12:00:00.000Z",
    });

    expect(fresh.watchlistSeeds[0]?.provenance).toMatchObject({
      effectivePeriod: "preseason",
      researchGeneratedAt: "2026-08-28T10:00:00.000Z",
      researchFreshThrough: "2026-08-28T22:00:00.000Z",
      freshness: "fresh_preseason_research",
      isCurrentWeekEvidence: false,
    });
    expect(stale.watchlistSeeds[0]?.provenance.freshness).toBe(
      "stale_preseason_research",
    );
    expect(
      stale.watchlistSeeds.find((seed) => seed.entry.playerId === "beta")
        ?.provenance.freshness,
    ).toBe("unresearched_preseason");
  });

  it("ignores a preserved plan from another draft", () => {
    const handoff = buildDraftSeasonHandoff({
      dashboard: dashboard(),
      draftPlan: { ...plan(), draftId: "another-draft" },
      generatedAt,
    });

    expect(handoff.outcomes.map((outcome) => outcome.planAlignment)).toEqual([
      "no_plan",
      "no_plan",
    ]);
    expect(handoff.warnings[0]).toContain("different draft");
    expect(handoff.watchlistSeeds[0]?.provenance.freshness).toBe(
      "unresearched_preseason",
    );
  });

  it("waits until completion and degrades safely when no draft exists", () => {
    const inProgress = buildDraftSeasonHandoff({
      dashboard: dashboard({ status: "live" }),
      pinnedResearchTargets: [{ player: player("outside", "Outside") }],
    });
    const noDraft = buildDraftSeasonHandoff({
      dashboard: dashboard({ includeDraft: false }),
    });

    expect(inProgress.summary.status).toBe("draft_in_progress");
    expect(inProgress.outcomes).toHaveLength(2);
    expect(inProgress.watchlistSeeds).toEqual([]);
    expect(inProgress.summary.canBuildWeekOneOutlook).toBe(false);
    expect(noDraft).toMatchObject({
      draftId: null,
      boardHash: null,
      outcomes: [],
      watchlistSeeds: [],
      summary: { status: "no_draft", canBuildWeekOneOutlook: false },
    });
  });

  it("preserves unresolved picks and still seeds explicit monitors when completed picks are missing", () => {
    const unresolved = buildDraftSeasonHandoff({
      dashboard: dashboard({
        picks: [{ pickNo: 2, round: 1, rosterId: 7, player: null }],
        rostered: [],
      }),
      pinnedResearchTargets: [{ player: player("outside", "Outside") }],
      generatedAt,
    });
    const noManagerPicks = buildDraftSeasonHandoff({
      dashboard: dashboard({
        picks: [
          {
            pickNo: 1,
            round: 1,
            rosterId: 2,
            player: player("rival", "Rival"),
          },
        ],
        rostered: [],
      }),
      pinnedResearchTargets: [{ player: player("outside", "Outside") }],
      generatedAt,
    });

    expect(unresolved.outcomes[0]).toMatchObject({
      player: null,
      planAlignment: "unknown_player",
    });
    expect(unresolved.warnings).toHaveLength(1);
    expect(unresolved.watchlistSeeds[0]?.entry.playerId).toBe("outside");
    expect(noManagerPicks.summary.status).toBe("complete_no_manager_picks");
    expect(noManagerPicks.warnings[0]).toContain("no picks owned");
    expect(noManagerPicks.watchlistSeeds[0]?.entry.playerId).toBe("outside");
  });
});
