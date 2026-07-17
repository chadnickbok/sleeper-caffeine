import type {
  DraftCandidateView,
  DraftPlan,
} from "@sleeper-caffeine/ipc-contract";

export type DraftPlanRecommendation = DraftPlan["recommendations"][number];

export function selectLivePlanRecommendations(
  candidates: readonly DraftCandidateView[],
  plan: DraftPlan | null,
): DraftPlanRecommendation[] {
  if (!plan) return [];
  const available = new Set(
    candidates.map((candidate) => candidate.player.playerId),
  );
  return plan.recommendations
    .filter((recommendation) => available.has(recommendation.player.playerId))
    .toSorted((a, b) => {
      if (a.player.playerId === plan.activeRecommendationPlayerId) return -1;
      if (b.player.playerId === plan.activeRecommendationPlayerId) return 1;
      return a.planRank - b.planRank;
    });
}

export function selectVisibleDraftCandidates({
  candidates,
  recommendations,
  position,
  query,
  limit = 24,
}: {
  candidates: readonly DraftCandidateView[];
  recommendations: readonly DraftPlanRecommendation[];
  position: string;
  query: string;
  limit?: number;
}): DraftCandidateView[] {
  const recommendationRank = new Map(
    recommendations.map((item) => [item.player.playerId, item.planRank]),
  );
  const normalizedQuery = query.trim().toLowerCase();
  return candidates
    .filter(
      (candidate) =>
        position === "ALL" || candidate.player.position === position,
    )
    .filter((candidate) =>
      `${candidate.player.name} ${candidate.player.nflTeam ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
    )
    .toSorted((a, b) => {
      const aPlanRank = recommendationRank.get(a.player.playerId);
      const bPlanRank = recommendationRank.get(b.player.playerId);
      if (aPlanRank !== undefined && bPlanRank !== undefined)
        return aPlanRank - bPlanRank;
      if (aPlanRank !== undefined) return -1;
      if (bPlanRank !== undefined) return 1;
      return a.rank - b.rank;
    })
    .slice(0, limit);
}
