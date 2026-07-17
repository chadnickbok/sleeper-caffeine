import {
  supportsWeeklyManagement,
  type CompetitiveLane,
  type LeagueWeek,
  type TuesdayActionOutput,
  type WeeklyAction,
  type WeeklyActionStatus,
  type WeeklyPhase,
  type WeeklyPhaseBrief,
  type WeeklyPlan,
  type WeeklyPlanPlayer,
  type WeeklyPlanStatus,
} from "@sleeper-caffeine/ipc-contract";

export type WeeklyPageMode =
  | "unsupported"
  | "needs_refresh"
  | "ready"
  | "building"
  | "current"
  | "changed"
  | "stale"
  | "failed";

export type WeeklyPhaseStep = {
  phase: Exclude<WeeklyPhase, "complete">;
  label: string;
  description: string;
  state: "complete" | "current" | "upcoming";
};

export type WeeklyDecisionCard = {
  id: "lineup" | "waivers" | "upgrades" | "lane" | "market";
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "accent" | "success" | "warning";
};

const PHASES = ["tuesday", "wednesday", "thursday", "weekend"] as const;

export function weeklyPageMode(input: {
  leagueStatus: string;
  leagueWeek: LeagueWeek | null;
  plan: WeeklyPlan | null;
  running: boolean;
  failed: boolean;
}): WeeklyPageMode {
  if (!supportsWeeklyManagement(input.leagueStatus)) return "unsupported";
  if (!input.leagueWeek) return "needs_refresh";
  if (input.running) return "building";
  if (input.failed || input.leagueWeek.planStatus === "failed") return "failed";
  if (!input.plan || input.leagueWeek.planStatus === "not_built")
    return "ready";
  if (input.leagueWeek.planStatus === "data_changed") return "changed";
  if (input.leagueWeek.planStatus === "research_stale") return "stale";
  return "current";
}

export function weeklyPhaseSteps(
  phase: WeeklyPhase,
  completedPhases?: ReadonlySet<Exclude<WeeklyPhase, "complete">>,
): WeeklyPhaseStep[] {
  if (completedPhases) {
    const activeIndex = PHASES.findIndex(
      (candidate) => !completedPhases.has(candidate),
    );
    return PHASES.map((candidate, index) => ({
      phase: candidate,
      label: phaseLabel(candidate),
      description: phaseDescription(candidate),
      state: completedPhases.has(candidate)
        ? "complete"
        : index === activeIndex
          ? "current"
          : "upcoming",
    }));
  }
  const activeIndex =
    phase === "complete" ? PHASES.length : PHASES.indexOf(phase);
  return PHASES.map((candidate, index) => ({
    phase: candidate,
    label: phaseLabel(candidate),
    description: phaseDescription(candidate),
    state:
      index < activeIndex
        ? "complete"
        : index === activeIndex
          ? "current"
          : "upcoming",
  }));
}

export function fiveDecisions(
  plan: WeeklyPlan,
  thursday: Extract<WeeklyPhaseBrief, { phase: "thursday" }> | null = null,
  actions: readonly WeeklyAction[] = [],
): WeeklyDecisionCard[] {
  const output = plan.output;
  const upgradeCount = output.actions.filter((action) =>
    ["free_agent_add", "roster_upgrade", "drop"].includes(action.kind),
  ).length;
  const lineupActions = actions.filter(
    (action) =>
      action.actionKey.startsWith("thursday:") &&
      action.status !== "superseded",
  );
  const openLineupActions = unresolvedActions(lineupActions);
  const recommendedLineupMoves = thursday?.output.recommendedMoves.length ?? 0;
  const lineupDecision = thursday
    ? {
        value:
          openLineupActions.length > 0
            ? `${String(openLineupActions.length)} open ${openLineupActions.length === 1 ? "call" : "calls"}`
            : recommendedLineupMoves > 0 && lineupActions.length === 0
              ? `${String(recommendedLineupMoves)} recommended`
              : recommendedLineupMoves > 0
                ? "Lineup set"
                : "Current lineup holds",
        detail: thursday.output.headline,
        tone:
          openLineupActions.length > 0 ||
          (recommendedLineupMoves > 0 && lineupActions.length === 0)
            ? ("accent" as const)
            : ("success" as const),
      }
    : {
        value: "Thursday pass",
        detail: "Not built in the Tuesday plan",
        tone: "neutral" as const,
      };
  return [
    {
      id: "lineup",
      label: "Lineup",
      ...lineupDecision,
    },
    {
      id: "waivers",
      label: "Waivers",
      value: `${String(output.waiverClaims.length)} ranked ${output.waiverClaims.length === 1 ? "claim" : "claims"}`,
      detail:
        output.waiverClaims.length > 0
          ? "Ordered with add/drop contingencies"
          : "No worthwhile claim identified",
      tone: output.waiverClaims.length > 0 ? "accent" : "success",
    },
    {
      id: "upgrades",
      label: "Roster upgrades",
      value: `${String(upgradeCount)} ${upgradeCount === 1 ? "move" : "moves"}`,
      detail: `${String(output.addNow.length)} add now · ${String(output.exit.length)} exit`,
      tone: upgradeCount > 0 ? "accent" : "neutral",
    },
    {
      id: "lane",
      label: "Competitive lane",
      value: competitiveLaneLabel(output.competitiveLane.lane),
      detail: `${capitalize(output.competitiveLane.confidence)} confidence this week`,
      tone:
        output.competitiveLane.lane === "contender"
          ? "success"
          : output.competitiveLane.lane === "retooler"
            ? "warning"
            : "neutral",
    },
    {
      id: "market",
      label: "Market",
      value: "One focused read",
      detail: output.marketObservation.headline,
      tone: "accent",
    },
  ];
}

export function playerMap(plan: WeeklyPlan): Map<string, WeeklyPlanPlayer> {
  return new Map(plan.players.map((player) => [player.playerId, player]));
}

export function actionOutputFor(
  plan: WeeklyPlan,
  action: WeeklyAction,
): TuesdayActionOutput | null {
  return (
    plan.output.actions.find(
      (candidate) => candidate.actionKey === action.actionKey,
    ) ?? null
  );
}

export function actionStatusPresentation(status: WeeklyActionStatus): {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
} {
  const presentations = {
    pending: { label: "Pending", tone: "info" },
    completed: { label: "Done", tone: "success" },
    dismissed: { label: "Dismissed", tone: "neutral" },
    declined: { label: "Declined", tone: "warning" },
    failed: { label: "Failed", tone: "danger" },
    not_possible: { label: "Not possible", tone: "warning" },
    observed_in_sleeper: { label: "Seen in Sleeper", tone: "info" },
    superseded: { label: "Superseded", tone: "neutral" },
  } as const;
  return presentations[status];
}

export function unresolvedActions(
  actions: readonly WeeklyAction[],
): WeeklyAction[] {
  return actions.filter((action) =>
    ["pending", "observed_in_sleeper"].includes(action.status),
  );
}

export function completedActions(
  actions: readonly WeeklyAction[],
): WeeklyAction[] {
  return actions.filter((action) => action.status === "completed");
}

export function weeklyStatusPresentation(status: WeeklyPlanStatus): {
  label: string;
  tone: "neutral" | "accent" | "live" | "stale" | "warning" | "danger";
} {
  const presentations = {
    not_built: { label: "Not built", tone: "neutral" },
    building: { label: "Building", tone: "live" },
    current: { label: "Current", tone: "live" },
    data_changed: { label: "Data changed", tone: "warning" },
    research_stale: { label: "Research stale", tone: "stale" },
    failed: { label: "Last run failed", tone: "danger" },
    superseded: { label: "Superseded", tone: "neutral" },
  } as const;
  return presentations[status];
}

export function formatFaabRange(
  claim: WeeklyPlan["output"]["waiverClaims"][number],
): string {
  if (
    claim.faabPercentMin === null ||
    claim.faabPercentTarget === null ||
    claim.faabPercentMax === null
  ) {
    return "Priority claim";
  }
  if (claim.faabPercentMin === claim.faabPercentMax) {
    return `${formatPercent(claim.faabPercentTarget)} FAAB`;
  }
  return `${formatPercent(claim.faabPercentMin)}–${formatPercent(claim.faabPercentMax)} FAAB`;
}

export function competitiveLaneLabel(lane: CompetitiveLane): string {
  if (lane === "retooler") return "Retooler";
  if (lane === "contender") return "Contender";
  return "Uncertain";
}

export function phaseLabel(phase: Exclude<WeeklyPhase, "complete">): string {
  if (phase === "weekend") return "Weekend";
  return capitalize(phase);
}

function phaseDescription(phase: Exclude<WeeklyPhase, "complete">): string {
  if (phase === "tuesday") return "Build the plan";
  if (phase === "wednesday") return "Review outcomes";
  if (phase === "thursday") return "Set the lineup";
  return "Protect optionality";
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
