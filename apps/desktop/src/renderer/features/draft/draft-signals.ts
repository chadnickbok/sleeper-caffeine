import type { DraftPlan, DraftView } from "@sleeper-caffeine/ipc-contract";

export const DRAFT_POLL_INTERVAL_MS = 15_000;

export type DraftRoomSignal = {
  label: string;
  detail: string;
  tone: "neutral" | "accent" | "warning" | "success";
};

export type DraftRoomSignals = {
  board: DraftRoomSignal;
  position: DraftRoomSignal;
  tier: DraftRoomSignal;
};

export function startDraftPolling(
  refresh: () => void,
  intervalMs = DRAFT_POLL_INTERVAL_MS,
): () => void {
  const timer = globalThis.setInterval(refresh, intervalMs);
  return () => globalThis.clearInterval(timer);
}

export function selectDraftRoomSignals(
  draft: NonNullable<DraftView>,
  plan: DraftPlan | null,
): DraftRoomSignals {
  return {
    board: describeBoardMovement(draft, plan),
    position: describePositionRun(draft),
    tier: describeTierWindow(draft, plan),
  };
}

function describeBoardMovement(
  draft: NonNullable<DraftView>,
  plan: DraftPlan | null,
): DraftRoomSignal {
  if (!plan) {
    if (draft.status === "complete")
      return {
        label: "Final board locked",
        detail: `${String(draft.picks.length)} selections are preserved for retrospective review and season handoff.`,
        tone: "success",
      };
    if (draft.status === "scheduled")
      return {
        label: "Board staged",
        detail:
          "No selections have landed. Candidate rank can be researched now and refreshed once the room opens.",
        tone: "neutral",
      };
    if (draft.status === "pending" && draft.picks.length === 0)
      return {
        label: "Awaiting pick one",
        detail:
          "The room is available, but Sleeper has not recorded a selection. Polling can watch for the opening move.",
        tone: "neutral",
      };
    return {
      label: "Live board ready",
      detail: `${String(draft.picks.length)} picks are reflected in the deterministic baseline. Build a plan when the decision is valuable.`,
      tone: "neutral",
    };
  }

  if (plan.status === "completed")
    return {
      label: "Decision recorded",
      detail:
        plan.statusReason ??
        `Your pick at #${String(plan.targetPickNo)} is preserved in the plan history.`,
      tone: "success",
    };

  if (plan.status === "superseded")
    return {
      label: "Plan needs a rebuild",
      detail:
        plan.statusReason ??
        "The target window or pick inventory no longer matches this plan.",
      tone: "warning",
    };

  const picksSincePlan = Math.max(
    0,
    draft.picks.length - plan.basedOnPickCount,
  );
  const selectedById = new Map(
    draft.picks.flatMap((pick) =>
      pick.player ? [[pick.player.playerId, pick] as const] : [],
    ),
  );
  const draftedRecommendations = plan.recommendations.filter((item) =>
    selectedById.has(item.player.playerId),
  );
  const active = plan.recommendations.find(
    (item) => item.player.playerId === plan.activeRecommendationPlayerId,
  );

  if (picksSincePlan === 0)
    return {
      label: "Board unchanged",
      detail: `No selections have landed since this plan was built for #${String(plan.targetPickNo)}.`,
      tone: "accent",
    };

  if (plan.status === "fallback_active" && active) {
    const primary = plan.recommendations.find(
      (item) => item.player.playerId === plan.primaryPlayerId,
    );
    return {
      label: `${String(picksSincePlan)} picks since plan`,
      detail: `${primary?.player.name ?? "The primary target"} left the board; ${active.player.name} is now the approved lead.`,
      tone: "warning",
    };
  }

  if (draftedRecommendations.length > 0) {
    const names = draftedRecommendations
      .slice(0, 2)
      .map((item) => item.player.name)
      .join(" and ");
    return {
      label: `${String(picksSincePlan)} picks since plan`,
      detail: `${names}${draftedRecommendations.length > 2 ? " and other researched options" : ""} left the board. ${active ? `${active.player.name} still leads.` : "Rebuild before acting."}`,
      tone: active ? "warning" : "neutral",
    };
  }

  return {
    label: `${String(picksSincePlan)} picks since plan`,
    detail: `The board advanced, but every researched recommendation remains available at this snapshot.`,
    tone: "accent",
  };
}

function describePositionRun(draft: NonNullable<DraftView>): DraftRoomSignal {
  const recent = draft.picks
    .toSorted((a, b) => a.pickNo - b.pickNo)
    .flatMap((pick) => (pick.player?.position ? [pick.player.position] : []))
    .slice(-6);
  if (recent.length === 0)
    return {
      label: "Waiting for pick one",
      detail: "Position pressure appears here as the board begins to move.",
      tone: "neutral",
    };

  const trailingPosition = recent.at(-1);
  let trailingCount = 0;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (recent[index] !== trailingPosition) break;
    trailingCount += 1;
  }
  if (trailingPosition && trailingCount >= 2)
    return {
      label: `${trailingPosition} run · ${String(trailingCount)} straight`,
      detail: `Recent board: ${recent.join(" · ")}. Watch scarcity, but do not chase the run automatically.`,
      tone: "warning",
    };

  const counts = new Map<string, number>();
  for (const position of recent)
    counts.set(position, (counts.get(position) ?? 0) + 1);
  const leader = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0];
  if (leader && leader[1] >= 3)
    return {
      label: `${leader[0]} pressure building`,
      detail: `${String(leader[1])} of the last ${String(recent.length)} picks were ${leader[0]}. Compare the tier before reacting.`,
      tone: "warning",
    };

  return {
    label: "No position run",
    detail: `Recent board: ${recent.join(" · ")}. The room is not forcing a positional response yet.`,
    tone: "neutral",
  };
}

function describeTierWindow(
  draft: NonNullable<DraftView>,
  plan: DraftPlan | null,
): DraftRoomSignal {
  if (plan) {
    const available = new Set(
      draft.candidates.map((candidate) => candidate.player.playerId),
    );
    const active = plan.recommendations.find(
      (item) => item.player.playerId === plan.activeRecommendationPlayerId,
    );
    if (active) {
      const inTier = plan.recommendations.filter(
        (item) =>
          item.tier === active.tier &&
          item.role !== "avoid" &&
          available.has(item.player.playerId),
      );
      const nextTier = plan.recommendations.find(
        (item) =>
          item.tier !== active.tier &&
          item.role !== "avoid" &&
          available.has(item.player.playerId),
      );
      return {
        label: active.tier,
        detail: `${String(inTier.length)} researched ${pluralize("option", inTier.length)} remain in the active tier${nextTier ? `; ${nextTier.tier} is the next step down` : ""}.`,
        tone: inTier.length <= 1 ? "warning" : "accent",
      };
    }
  }

  const ranked = draft.candidates.toSorted((a, b) => a.rank - b.rank);
  const leader = ranked[0];
  if (!leader)
    return {
      label: "Pool not published",
      detail:
        "Refresh after Sleeper exposes available players and search rank.",
      tone: "neutral",
    };
  const baselineBand = ranked.filter(
    (candidate) => leader.score - candidate.score <= 3,
  );
  return {
    label: "Baseline value band",
    detail:
      baselineBand.length > 1
        ? `${String(baselineBand.length)} players sit within three deterministic points of ${leader.player.name}. AI tiering begins only when you build a plan.`
        : `${leader.player.name} is the clear deterministic leader. Build a plan to add researched tiers and fallbacks.`,
    tone: baselineBand.length > 1 ? "neutral" : "accent",
  };
}

function pluralize(value: string, count: number) {
  return count === 1 ? value : `${value}s`;
}
