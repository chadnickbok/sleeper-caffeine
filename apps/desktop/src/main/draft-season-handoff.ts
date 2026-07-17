import { createHash } from "node:crypto";
import type {
  Dashboard,
  DraftPlan,
  PlayerView,
  WatchlistEntry,
} from "@sleeper-caffeine/ipc-contract";

export type DraftPlanAlignment =
  | "primary"
  | "fallback"
  | "later"
  | "researched"
  | "avoid"
  | "unplanned"
  | "no_plan"
  | "unknown_player";

export interface DraftedPlayerOutcome {
  pickNo: number;
  round: number;
  player: PlayerView | null;
  currentlyRostered: boolean;
  planAlignment: DraftPlanAlignment;
  assessment: string;
}

export interface PinnedResearchTarget {
  player: PlayerView;
  hypothesis?: string;
  trigger?: string;
}

export interface DraftHandoffProvenance {
  source: "manager_draft_pick" | "pinned_research_target";
  draftId: string;
  boardHash: string;
  effectivePeriod: "preseason";
  observedAt: string;
  researchGeneratedAt: string | null;
  researchFreshThrough: string | null;
  freshness:
    | "fresh_preseason_research"
    | "stale_preseason_research"
    | "unresearched_preseason";
  isCurrentWeekEvidence: false;
}

export interface DraftHandoffWatchlistSeed {
  entry: WatchlistEntry;
  provenance: DraftHandoffProvenance;
}

export type DraftSeasonHandoffStatus =
  | "no_draft"
  | "draft_in_progress"
  | "complete"
  | "complete_no_manager_picks";

export interface DraftSeasonHandoffSummary {
  status: DraftSeasonHandoffStatus;
  eyebrow: "Season handoff";
  headline: string;
  body: string;
  draftedCount: number;
  rosteredDraftedCount: number;
  plannedSelectionCount: number;
  externalMonitorCount: number;
  newWatchlistCount: number;
  skippedExistingCount: number;
  skippedNotRosteredCount: number;
  canBuildWeekOneOutlook: boolean;
}

export interface DraftSeasonHandoff {
  draftId: string | null;
  boardHash: string | null;
  season: string;
  week: 1;
  outcomes: DraftedPlayerOutcome[];
  watchlistSeeds: DraftHandoffWatchlistSeed[];
  warnings: string[];
  summary: DraftSeasonHandoffSummary;
}

/**
 * Creates a deterministic bridge from a completed draft snapshot to Week 1.
 *
 * The function does not persist anything. The caller can store each returned
 * `watchlistSeeds[].entry` with the existing watchlist upsert and retain the
 * provenance beside the final draft snapshot or as evidence metadata.
 */
export function buildDraftSeasonHandoff(input: {
  dashboard: Dashboard;
  draftPlan?: DraftPlan | null;
  pinnedResearchTargets?: readonly PinnedResearchTarget[];
  existingWatchlist?: readonly WatchlistEntry[];
  generatedAt?: string;
}): DraftSeasonHandoff {
  const { dashboard } = input;
  const draft = dashboard.draft;
  const pinnedResearchTargets = input.pinnedResearchTargets ?? [];
  const existingWatchlist = input.existingWatchlist ?? [];
  const generatedAt = input.generatedAt ?? dashboard.capturedAt;

  if (!draft) {
    return emptyHandoff({
      dashboard,
      status: "no_draft",
      headline: "No completed draft is available yet.",
      body: "Refresh after Sleeper exposes the league draft to prepare the Week 1 handoff.",
      warning: "Sleeper did not return a draft for this league.",
    });
  }

  const draftPlan =
    input.draftPlan?.draftId === draft.draftId ? input.draftPlan : null;

  const managerPicks = draft.picks
    .filter((pick) => pick.rosterId === dashboard.league.rosterId)
    .sort((a, b) => a.pickNo - b.pickNo);
  const rosteredPlayerIds = new Set(
    [
      ...dashboard.starters,
      ...dashboard.bench,
      ...dashboard.reserve,
      ...dashboard.taxi,
    ].map((player) => player.playerId),
  );
  const outcomes = managerPicks.map((pick): DraftedPlayerOutcome => {
    const player = pick.player;
    const currentlyRostered = player
      ? rosteredPlayerIds.has(player.playerId)
      : false;
    const planAlignment = alignmentFor(player?.playerId ?? null, draftPlan);
    return {
      pickNo: pick.pickNo,
      round: pick.round,
      player,
      currentlyRostered,
      planAlignment,
      assessment: outcomeAssessment({
        player,
        pickNo: pick.pickNo,
        currentlyRostered,
        planAlignment,
      }),
    };
  });

  if (draft.status !== "complete") {
    return {
      draftId: draft.draftId,
      boardHash: draft.boardHash,
      season: dashboard.league.season,
      week: 1,
      outcomes,
      watchlistSeeds: [],
      warnings: [
        "The draft is not complete, so Caffeine has not seeded Week 1 watchlist entries.",
      ],
      summary: summaryFor({
        status: "draft_in_progress",
        outcomes,
        seeds: [],
        skippedExistingCount: 0,
        skippedNotRosteredCount: 0,
      }),
    };
  }

  const warnings: string[] = [];
  if (input.draftPlan && !draftPlan)
    warnings.push(
      "The preserved Caffeine Plan belongs to a different draft and was not used to assess these selections.",
    );
  if (managerPicks.length === 0)
    warnings.push(
      "Sleeper marks the draft complete but returned no picks owned by the selected roster.",
    );
  if (managerPicks.some((pick) => pick.player === null))
    warnings.push(
      "At least one manager-owned pick did not include a resolvable player and was preserved without a watchlist seed.",
    );

  const existingPlayerIds = new Set(
    existingWatchlist.map((entry) => entry.playerId),
  );
  const seededPlayerIds = new Set<string>();
  const seeds: DraftHandoffWatchlistSeed[] = [];
  const skippedExistingPlayerIds = new Set<string>();
  let skippedNotRosteredCount = 0;

  for (const outcome of outcomes) {
    if (!outcome.player) continue;
    if (!outcome.currentlyRostered) {
      skippedNotRosteredCount += 1;
      continue;
    }
    if (existingPlayerIds.has(outcome.player.playerId)) {
      skippedExistingPlayerIds.add(outcome.player.playerId);
      continue;
    }
    seeds.push(
      seedForDraftedPlayer({
        dashboard,
        draftId: draft.draftId,
        boardHash: draft.boardHash,
        plan: draftPlan,
        outcome: { ...outcome, player: outcome.player },
        generatedAt,
      }),
    );
    seededPlayerIds.add(outcome.player.playerId);
  }

  const uniquePinnedTargets = dedupePinnedTargets(pinnedResearchTargets);
  for (const target of uniquePinnedTargets) {
    const playerId = target.player.playerId;
    if (seededPlayerIds.has(playerId)) continue;
    if (existingPlayerIds.has(playerId)) {
      skippedExistingPlayerIds.add(playerId);
      continue;
    }
    seeds.push(
      seedForPinnedTarget({
        dashboard,
        draftId: draft.draftId,
        boardHash: draft.boardHash,
        plan: draftPlan,
        target,
        generatedAt,
      }),
    );
    seededPlayerIds.add(playerId);
  }

  const status =
    managerPicks.length === 0 ? "complete_no_manager_picks" : "complete";
  return {
    draftId: draft.draftId,
    boardHash: draft.boardHash,
    season: dashboard.league.season,
    week: 1,
    outcomes,
    watchlistSeeds: seeds,
    warnings,
    summary: summaryFor({
      status,
      outcomes,
      seeds,
      skippedExistingCount: skippedExistingPlayerIds.size,
      skippedNotRosteredCount,
    }),
  };
}

function emptyHandoff(input: {
  dashboard: Dashboard;
  status: "no_draft";
  headline: string;
  body: string;
  warning: string;
}): DraftSeasonHandoff {
  return {
    draftId: null,
    boardHash: null,
    season: input.dashboard.league.season,
    week: 1,
    outcomes: [],
    watchlistSeeds: [],
    warnings: [input.warning],
    summary: {
      status: input.status,
      eyebrow: "Season handoff",
      headline: input.headline,
      body: input.body,
      draftedCount: 0,
      rosteredDraftedCount: 0,
      plannedSelectionCount: 0,
      externalMonitorCount: 0,
      newWatchlistCount: 0,
      skippedExistingCount: 0,
      skippedNotRosteredCount: 0,
      canBuildWeekOneOutlook: false,
    },
  };
}

function alignmentFor(
  playerId: string | null,
  plan: DraftPlan | null | undefined,
): DraftPlanAlignment {
  if (!playerId) return "unknown_player";
  if (!plan) return "no_plan";
  if (playerId === plan.primaryPlayerId) return "primary";
  if (plan.fallbackPlayerIds.includes(playerId)) return "fallback";
  const recommendation = plan.recommendations.find(
    (item) => item.player.playerId === playerId,
  );
  if (recommendation?.role === "later") return "later";
  if (recommendation?.role === "avoid") return "avoid";
  if (recommendation) return "researched";
  if (
    plan.futurePickPlans.some((future) =>
      future.targetPlayerIds.includes(playerId),
    )
  )
    return "later";
  return "unplanned";
}

function outcomeAssessment(input: {
  player: PlayerView | null;
  pickNo: number;
  currentlyRostered: boolean;
  planAlignment: DraftPlanAlignment;
}): string {
  if (!input.player)
    return `Pick #${String(input.pickNo)} is complete, but Sleeper did not provide a resolvable player.`;
  if (!input.currentlyRostered)
    return `${input.player.name} was selected at #${String(input.pickNo)} but is not on the selected roster now; no roster-purpose claim will be seeded.`;
  const planText: Record<DraftPlanAlignment, string> = {
    primary: "matched the primary Caffeine target",
    fallback: "matched an approved Caffeine fallback",
    later: "matched a later-pick Caffeine target",
    researched: "appeared in the researched Caffeine board",
    avoid: "was selected despite an avoid label in the preserved plan",
    unplanned: "was outside the preserved Caffeine plan",
    no_plan: "was selected without a preserved Caffeine plan",
    unknown_player: "could not be matched to the preserved plan",
  };
  return `${input.player.name} ${planText[input.planAlignment]} at #${String(input.pickNo)} and remains on the selected roster.`;
}

function seedForDraftedPlayer(input: {
  dashboard: Dashboard;
  draftId: string;
  boardHash: string;
  plan: DraftPlan | null;
  outcome: DraftedPlayerOutcome & { player: PlayerView };
  generatedAt: string;
}): DraftHandoffWatchlistSeed {
  const recommendation = input.plan?.recommendations.find(
    (item) => item.player.playerId === input.outcome.player.playerId,
  );
  const hypothesis = recommendation
    ? `Preseason draft thesis: ${recommendation.rationale} Revalidate which Week 1 roster purpose—Start, Insure, Appreciate, or Pop—${input.outcome.player.name} serves.`
    : `Confirm which Week 1 roster purpose—Start, Insure, Appreciate, or Pop—${input.outcome.player.name} serves after being selected at pick #${String(input.outcome.pickNo)}.`;
  const trigger = recommendation?.risks.length
    ? `Fresh role, usage, injury, or depth-chart evidence resolves these preseason risks: ${recommendation.risks.join("; ")}`
    : `Fresh role, usage, injury, or depth-chart evidence either establishes ${input.outcome.player.name}'s purpose or shows the roster spot can be improved.`;
  return seed({
    dashboard: input.dashboard,
    draftId: input.draftId,
    boardHash: input.boardHash,
    plan: input.plan,
    player: input.outcome.player,
    source: "manager_draft_pick",
    hypothesis,
    trigger,
    generatedAt: input.generatedAt,
  });
}

function seedForPinnedTarget(input: {
  dashboard: Dashboard;
  draftId: string;
  boardHash: string;
  plan: DraftPlan | null;
  target: PinnedResearchTarget;
  generatedAt: string;
}): DraftHandoffWatchlistSeed {
  return seed({
    dashboard: input.dashboard,
    draftId: input.draftId,
    boardHash: input.boardHash,
    plan: input.plan,
    player: input.target.player,
    source: "pinned_research_target",
    hypothesis:
      input.target.hypothesis?.trim() ||
      `Preseason monitor: ${input.target.player.name} was explicitly pinned during draft research; compare their Week 1 role and availability with the bottom of this roster.`,
    trigger:
      input.target.trigger?.trim() ||
      `A role increase, unexpected availability, or a clearer Start, Insure, Appreciate, or Pop case makes ${input.target.player.name} actionable.`,
    generatedAt: input.generatedAt,
  });
}

function seed(input: {
  dashboard: Dashboard;
  draftId: string;
  boardHash: string;
  plan: DraftPlan | null;
  player: PlayerView;
  source: DraftHandoffProvenance["source"];
  hypothesis: string;
  trigger: string;
  generatedAt: string;
}): DraftHandoffWatchlistSeed {
  const researchRecommendation = input.plan?.recommendations.some(
    (item) => item.player.playerId === input.player.playerId,
  );
  const hasResearch = Boolean(input.plan && researchRecommendation);
  const freshThrough = hasResearch
    ? (input.plan?.researchFreshThrough ?? null)
    : null;
  const freshness: DraftHandoffProvenance["freshness"] = !hasResearch
    ? "unresearched_preseason"
    : Date.parse(input.generatedAt) <= Date.parse(freshThrough ?? "")
      ? "fresh_preseason_research"
      : "stale_preseason_research";
  return {
    entry: {
      id: deterministicWatchlistId(
        input.dashboard.league.leagueId,
        input.dashboard.league.season,
        input.player.playerId,
      ),
      leagueId: input.dashboard.league.leagueId,
      playerId: input.player.playerId,
      hypothesis: input.hypothesis,
      trigger: input.trigger,
      state: "active",
      createdSeason: input.dashboard.league.season,
      createdWeek: 1,
      expiresSeason: input.dashboard.league.season,
      expiresWeek: 1,
      createdAt: input.generatedAt,
      updatedAt: input.generatedAt,
    },
    provenance: {
      source: input.source,
      draftId: input.draftId,
      boardHash: input.boardHash,
      effectivePeriod: "preseason",
      observedAt: input.dashboard.capturedAt,
      researchGeneratedAt: hasResearch
        ? (input.plan?.generatedAt ?? null)
        : null,
      researchFreshThrough: freshThrough,
      freshness,
      isCurrentWeekEvidence: false,
    },
  };
}

function deterministicWatchlistId(
  leagueId: string,
  season: string,
  playerId: string,
): string {
  const digest = createHash("sha256")
    .update(`${leagueId}:${season}:1:${playerId}`)
    .digest("hex")
    .slice(0, 16);
  return `draft-handoff-${digest}`;
}

function dedupePinnedTargets(
  targets: readonly PinnedResearchTarget[],
): PinnedResearchTarget[] {
  const unique = new Map<string, PinnedResearchTarget>();
  for (const target of targets)
    if (!unique.has(target.player.playerId))
      unique.set(target.player.playerId, target);
  return [...unique.values()];
}

function summaryFor(input: {
  status: Exclude<DraftSeasonHandoffStatus, "no_draft">;
  outcomes: DraftedPlayerOutcome[];
  seeds: DraftHandoffWatchlistSeed[];
  skippedExistingCount: number;
  skippedNotRosteredCount: number;
}): DraftSeasonHandoffSummary {
  const rosteredDraftedCount = input.outcomes.filter(
    (outcome) => outcome.currentlyRostered,
  ).length;
  const plannedSelectionCount = input.outcomes.filter((outcome) =>
    ["primary", "fallback", "later", "researched"].includes(
      outcome.planAlignment,
    ),
  ).length;
  const externalMonitorCount = input.seeds.filter(
    (seed) => seed.provenance.source === "pinned_research_target",
  ).length;
  if (input.status === "draft_in_progress")
    return {
      status: input.status,
      eyebrow: "Season handoff",
      headline: "The draft is still in progress.",
      body: `${String(input.outcomes.length)} of your selections are preserved so far. Week 1 hypotheses will wait for the final board.`,
      draftedCount: input.outcomes.length,
      rosteredDraftedCount,
      plannedSelectionCount,
      externalMonitorCount: 0,
      newWatchlistCount: 0,
      skippedExistingCount: 0,
      skippedNotRosteredCount: 0,
      canBuildWeekOneOutlook: false,
    };
  if (input.status === "complete_no_manager_picks")
    return {
      status: input.status,
      eyebrow: "Season handoff",
      headline: "The final board needs a roster check.",
      body: `${String(externalMonitorCount)} explicit draft ${externalMonitorCount === 1 ? "monitor is" : "monitors are"} ready, but Sleeper did not identify selections for this roster.`,
      draftedCount: 0,
      rosteredDraftedCount: 0,
      plannedSelectionCount: 0,
      externalMonitorCount,
      newWatchlistCount: input.seeds.length,
      skippedExistingCount: input.skippedExistingCount,
      skippedNotRosteredCount: input.skippedNotRosteredCount,
      canBuildWeekOneOutlook: true,
    };
  return {
    status: input.status,
    eyebrow: "Season handoff",
    headline: "Your final board is ready for Week 1.",
    body: `${String(input.outcomes.length)} selections are preserved, ${String(input.seeds.length)} fresh roster hypotheses or monitors are ready, and every preseason claim remains labeled with its original freshness.`,
    draftedCount: input.outcomes.length,
    rosteredDraftedCount,
    plannedSelectionCount,
    externalMonitorCount,
    newWatchlistCount: input.seeds.length,
    skippedExistingCount: input.skippedExistingCount,
    skippedNotRosteredCount: input.skippedNotRosteredCount,
    canBuildWeekOneOutlook: true,
  };
}
