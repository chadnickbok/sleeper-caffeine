import { createHash } from "node:crypto";
import type {
  Dashboard,
  DraftPlan,
  DraftPlanOutput,
} from "@sleeper-caffeine/ipc-contract";

const RESEARCH_TTL_MS = 12 * 60 * 60 * 1000;

export function draftPlanInputHash(dashboard: Dashboard): string {
  const draft = requireDraft(dashboard);
  return createHash("sha256")
    .update(
      JSON.stringify({
        boardHash: draft.boardHash,
        rosterPositions: dashboard.rosterPositions,
        scoringLabel: dashboard.scoringLabel,
        starters: dashboard.starters.map((player) => player.playerId).sort(),
        bench: dashboard.bench.map((player) => player.playerId).sort(),
        reserve: dashboard.reserve.map((player) => player.playerId).sort(),
        taxi: dashboard.taxi.map((player) => player.playerId).sort(),
        upcomingPicks: draft.myUpcomingPickNumbers,
        candidates: draft.candidates.map((candidate) => ({
          id: candidate.player.playerId,
          rank: candidate.rank,
          score: candidate.score,
          pinned: candidate.pinned,
        })),
        version: 2,
      }),
    )
    .digest("hex")
    .slice(0, 20);
}

export function buildDraftPlan(input: {
  dashboard: Dashboard;
  output: DraftPlanOutput;
  generatedAt?: string;
}): DraftPlan {
  const draft = requireDraft(input.dashboard);
  const targetPickNo = draft.myUpcomingPickNumbers[0];
  if (!targetPickNo)
    throw new Error("There is no remaining owned pick to build a plan for");
  const candidateById = new Map(
    draft.candidates.map((candidate) => [candidate.player.playerId, candidate]),
  );
  const recommendations = [...input.output.recommendations].sort(
    (a, b) => a.planRank - b.planRank,
  );
  const ids = new Set<string>();
  const ranks = new Set<number>();
  for (const recommendation of recommendations) {
    if (ids.has(recommendation.playerId))
      throw new Error("The draft plan returned a player more than once");
    if (ranks.has(recommendation.planRank))
      throw new Error("The draft plan returned a duplicate plan rank");
    if (!candidateById.has(recommendation.playerId))
      throw new Error(
        `The draft plan recommended unavailable player ${recommendation.playerId}`,
      );
    ids.add(recommendation.playerId);
    ranks.add(recommendation.planRank);
  }
  if (
    recommendations.some(
      (recommendation, index) => recommendation.planRank !== index + 1,
    )
  )
    throw new Error(
      "The draft plan ranks must be consecutive and start at one",
    );
  if (!ids.has(input.output.primaryPlayerId))
    throw new Error("The primary draft target is not in the ranked plan");
  if (
    recommendations[0]?.playerId !== input.output.primaryPlayerId ||
    recommendations[0]?.role !== "primary"
  )
    throw new Error("The primary draft target must be plan rank one");
  const fallbackIds = new Set<string>();
  for (const playerId of input.output.fallbackPlayerIds)
    if (fallbackIds.has(playerId))
      throw new Error("The draft plan returned a fallback more than once");
    else if (!ids.has(playerId))
      throw new Error("A fallback target is not in the ranked plan");
    else {
      fallbackIds.add(playerId);
      if (
        recommendations.find(
          (recommendation) => recommendation.playerId === playerId,
        )?.role !== "fallback"
      )
        throw new Error("Every fallback target must use the fallback role");
    }

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return {
    draftId: draft.draftId,
    boardHash: draft.boardHash,
    inputHash: draftPlanInputHash(input.dashboard),
    basedOnPickCount: draft.picks.length,
    currentPickNo: draft.currentPickNo,
    targetPickNo,
    generatedAt,
    researchFreshThrough: new Date(
      Date.parse(generatedAt) + RESEARCH_TTL_MS,
    ).toISOString(),
    status: "current",
    statusReason: null,
    activeRecommendationPlayerId: input.output.primaryPlayerId,
    selectedPlayerId: null,
    primaryPlayerId: input.output.primaryPlayerId,
    fallbackPlayerIds: [...input.output.fallbackPlayerIds],
    recommendations: recommendations.map((recommendation) => {
      const baseline = candidateById.get(recommendation.playerId);
      if (!baseline) throw new Error("Draft candidate disappeared");
      return {
        player: baseline.player,
        planRank: recommendation.planRank,
        baselineRank: baseline.rank,
        tier: recommendation.tier,
        role: recommendation.role,
        rationale: recommendation.rationale,
        risks: recommendation.risks,
        confidence: recommendation.confidence,
        expectedAvailability: recommendation.expectedAvailability,
      };
    }),
    futurePickPlans: input.output.futurePickPlans.map((future) => ({
      ...future,
      targetPlayerIds: future.targetPlayerIds.filter((playerId) =>
        candidateById.has(playerId),
      ),
    })),
  };
}

export function reconcileDraftPlan(
  plan: DraftPlan,
  dashboard: Dashboard,
  now = Date.now(),
): DraftPlan {
  const draft = dashboard.draft;
  if (!draft || draft.draftId !== plan.draftId)
    return supersede(plan, "This plan belongs to a different draft");

  const targetCell = draft.board.find(
    (cell) => cell.pickNo === plan.targetPickNo,
  );
  if (targetCell?.pick) {
    if (targetCell.isMine) {
      const selectedPlayerId = targetCell.pick.player?.playerId ?? null;
      return {
        ...plan,
        status: "completed",
        statusReason: selectedPlayerId
          ? `${targetCell.pick.player?.name ?? "Your selection"} was selected at #${String(plan.targetPickNo)}`
          : `Your pick #${String(plan.targetPickNo)} is complete`,
        activeRecommendationPlayerId: null,
        selectedPlayerId,
      };
    }
    return supersede(plan, `Pick #${String(plan.targetPickNo)} has passed`);
  }
  if (!draft.myUpcomingPickNumbers.includes(plan.targetPickNo))
    return supersede(plan, "The target pick is no longer in your inventory");

  const available = new Set(
    draft.candidates.map((candidate) => candidate.player.playerId),
  );
  const ordered = [plan.primaryPlayerId, ...plan.fallbackPlayerIds];
  const active = ordered.find((playerId) => available.has(playerId)) ?? null;
  if (!active)
    return supersede(
      plan,
      "The primary target and every approved fallback are gone",
    );

  const researchStale = now > Date.parse(plan.researchFreshThrough);
  if (researchStale)
    return {
      ...plan,
      status: "research_stale",
      statusReason:
        "The board is usable, but its player research is over 12 hours old",
      activeRecommendationPlayerId: active,
      selectedPlayerId: null,
    };
  if (active !== plan.primaryPlayerId)
    return {
      ...plan,
      status: "fallback_active",
      statusReason:
        "The primary target is gone; the next approved fallback is active",
      activeRecommendationPlayerId: active,
      selectedPlayerId: null,
    };
  if (draft.boardHash !== plan.boardHash)
    return {
      ...plan,
      status: "advanced_valid",
      statusReason:
        "The board advanced, but the primary recommendation remains available",
      activeRecommendationPlayerId: active,
      selectedPlayerId: null,
    };
  return {
    ...plan,
    status: "current",
    statusReason: null,
    activeRecommendationPlayerId: active,
    selectedPlayerId: null,
  };
}

function supersede(plan: DraftPlan, statusReason: string): DraftPlan {
  return {
    ...plan,
    status: "superseded",
    statusReason,
    activeRecommendationPlayerId: null,
    selectedPlayerId: null,
  };
}

function requireDraft(dashboard: Dashboard) {
  if (!dashboard.draft)
    throw new Error("Refresh the draft before building a plan");
  return dashboard.draft;
}
