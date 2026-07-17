import type {
  CodexStatus,
  CurrentWeeklyBriefs,
  Dashboard,
  EvidenceSource,
  LeagueWeek,
  PlayerView,
  RosterPurposeAssessment,
  WeeklyAction,
  WeeklyActionStatus,
  WeeklyBriefPhase,
  WeeklyPhaseBrief,
  WeeklyPhaseBriefRequest,
  WeeklyPlan,
  WeeklyPlanPlayer,
  WeeklyPlanRequest,
} from "@sleeper-caffeine/ipc-contract";
import type { ReactNode } from "react";
import {
  AiGenerationProgress,
  AiRunButton,
} from "../../components/ai/index.js";
import {
  Eyebrow,
  Page,
  PageHeading,
  SectionTitle,
} from "../../components/layout/PageLayout.js";
import { PlayerPhoto } from "../../components/player/PlayerPhoto.js";
import {
  Badge,
  Button,
  Icon,
  OverflowMenu,
  OverflowMenuItem,
  OverflowMenuSeparator,
  Panel,
} from "../../components/ui/index.js";
import { formatDateTime, formatRelativeTime } from "../../lib/time.js";
import { EvidenceDisclosure } from "../evidence/index.js";
import {
  actionOutputFor,
  actionStatusPresentation,
  completedActions,
  competitiveLaneLabel,
  fiveDecisions,
  formatFaabRange,
  playerMap,
  unresolvedActions,
  weeklyPageMode,
  weeklyPhaseSteps,
  weeklyStatusPresentation,
} from "./weekly-presenters.js";
import styles from "./WeeklyPlanPage.module.css";

export type WeeklyPlanGenerationState = {
  mode: WeeklyPlanRequest["mode"];
  stage: "reading_league" | "researching_candidates" | "building_plan";
};

export type WeeklyPhaseGenerationState = {
  phase: WeeklyBriefPhase;
  mode: WeeklyPhaseBriefRequest["mode"];
  stage:
    | "reading_league"
    | "reconciling_week"
    | "researching_players"
    | "optimizing_lineup"
    | "building_brief";
};

export type WeeklyPhaseErrors = Partial<
  Record<WeeklyBriefPhase, string | null>
>;

export interface WeeklyPlanPageProps {
  dashboard: Dashboard;
  leagueWeek: LeagueWeek | null;
  plan: WeeklyPlan | null;
  actions: WeeklyAction[];
  briefs: CurrentWeeklyBriefs;
  codex: CodexStatus;
  generation?: WeeklyPlanGenerationState | null | undefined;
  phaseGeneration?: WeeklyPhaseGenerationState | null | undefined;
  error?: string | null | undefined;
  phaseErrors?: WeeklyPhaseErrors | undefined;
  refreshing?: boolean | undefined;
  pendingActionId?: string | null | undefined;
  onRefresh(): void;
  onGenerate(mode: WeeklyPlanRequest["mode"]): void;
  onLogin(): void;
  onUpdateAction(actionId: string, status: WeeklyActionStatus): void;
  onGeneratePhase(
    phase: WeeklyBriefPhase,
    mode: WeeklyPhaseBriefRequest["mode"],
  ): void;
  onOpenDraft?(): void;
  onOpenTeamAnalysis?(): void;
  onOpenTradeLab?(): void;
  onOpenLineup?(): void;
  onOpenAnalyst?(): void;
}

const generationStages = [
  "Reading league and roster state",
  "Researching the focused candidate set",
  "Building claims, contingencies and alternatives",
] as const;

export function WeeklyPlanPage(props: WeeklyPlanPageProps) {
  const running = Boolean(props.generation);
  const mode = weeklyPageMode({
    leagueStatus: props.dashboard.leagueStatus,
    leagueWeek: props.leagueWeek,
    plan: props.plan,
    running,
    failed: Boolean(props.error),
  });
  const primaryMode = generationMode(mode, Boolean(props.plan));

  return (
    <Page className={styles.page}>
      <PageHeading
        eyebrow={`Week ${String(props.dashboard.week)} · Weekly command center`}
        title="Run this week like a front office"
        description="Build one evidence-backed plan, make the calls yourself, and refine only when the league gives you a reason."
        action={
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              leading={<Icon name="refresh" spin={Boolean(props.refreshing)} />}
              loading={Boolean(props.refreshing)}
              disabled={running}
              onClick={props.onRefresh}
            >
              Refresh data
            </Button>
            {mode !== "unsupported" && (
              <AiRunButton
                status={props.codex}
                running={running}
                hasResult={Boolean(props.plan)}
                labels={generationLabels(mode, Boolean(props.plan))}
                disabled={!props.leagueWeek}
                onRun={() => props.onGenerate(primaryMode)}
                onLogin={props.onLogin}
              />
            )}
          </div>
        }
      />

      {props.leagueWeek && (
        <WeeklyPhaseRail
          leagueWeek={props.leagueWeek}
          plan={props.plan}
          briefs={props.briefs}
        />
      )}

      {mode === "unsupported" ? (
        <UnsupportedState {...props} />
      ) : mode === "needs_refresh" ? (
        <NeedsRefreshState {...props} />
      ) : mode === "ready" && !props.plan ? (
        <ReadyState {...props} />
      ) : mode === "building" && !props.plan ? (
        <BuildingState generation={props.generation} />
      ) : mode === "failed" && !props.plan ? (
        <FailedState {...props} />
      ) : props.plan && props.leagueWeek ? (
        <PlanContent
          {...props}
          plan={props.plan}
          leagueWeek={props.leagueWeek}
        />
      ) : (
        <ReadyState {...props} />
      )}
    </Page>
  );
}

function WeeklyPhaseRail({
  leagueWeek,
  plan,
  briefs,
}: {
  leagueWeek: LeagueWeek;
  plan: WeeklyPlan | null;
  briefs: CurrentWeeklyBriefs;
}) {
  const completed = new Set<"tuesday" | WeeklyBriefPhase>();
  if (plan) completed.add("tuesday");
  if (briefs.wednesday) completed.add("wednesday");
  if (briefs.thursday) completed.add("thursday");
  if (briefs.weekend) completed.add("weekend");
  return (
    <nav className={styles.phaseRail} aria-label="Weekly plan phases">
      {weeklyPhaseSteps(leagueWeek.phase, completed).map((step, index) => (
        <a
          key={step.phase}
          href={`#phase-${step.phase}`}
          className={styles[step.state]}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span>
            {step.state === "complete" ? <Icon name="check" /> : index + 1}
          </span>
          <div>
            <strong>{step.label}</strong>
            <small>{step.description}</small>
          </div>
        </a>
      ))}
    </nav>
  );
}

function UnsupportedState(props: WeeklyPlanPageProps) {
  return (
    <Panel className={styles.entryState}>
      <span className={styles.entryIcon}>
        <Icon name="target" />
      </span>
      <Eyebrow>Preseason workspace</Eyebrow>
      <h2>Build the roster before you manage the week.</h2>
      <p>
        Weekly plans activate when Sleeper marks this league in season. Your
        Draft Room and roster research stay fully available in the meantime.
      </p>
      <div className={styles.entryActions}>
        {props.onOpenDraft && (
          <Button
            variant="primary"
            onClick={props.onOpenDraft}
            leading={<Icon name="target" />}
          >
            Open Draft Room
          </Button>
        )}
        {props.onOpenTeamAnalysis && (
          <Button variant="secondary" onClick={props.onOpenTeamAnalysis}>
            Review team analysis
          </Button>
        )}
      </div>
    </Panel>
  );
}

function NeedsRefreshState(props: WeeklyPlanPageProps) {
  return (
    <Panel className={styles.entryState}>
      <span className={styles.entryIcon}>
        <Icon name="refresh" />
      </span>
      <Eyebrow>Fresh facts first</Eyebrow>
      <h2>Refresh Sleeper to open Week {props.dashboard.week}.</h2>
      <p>
        Refreshing builds the deterministic league context and costs no AI turn.
        You decide when Caffeine should research and build the actual plan.
      </p>
      <Preflight dashboard={props.dashboard} />
      <Button
        variant="primary"
        leading={<Icon name="refresh" />}
        loading={Boolean(props.refreshing)}
        onClick={props.onRefresh}
      >
        Refresh Sleeper
      </Button>
    </Panel>
  );
}

function ReadyState(props: WeeklyPlanPageProps) {
  const signedOut = props.codex.state === "signed_out";
  return (
    <Panel className={styles.entryState}>
      <span className={styles.entryIcon}>
        <Icon name="spark" />
      </span>
      <Eyebrow>
        {signedOut ? "Ready when connected" : "Fresh context ready"}
      </Eyebrow>
      <h2>
        {signedOut
          ? "Connect ChatGPT to build the plan."
          : "Make the first call of the week."}
      </h2>
      <p>
        Caffeine will research a focused set of realistic additions, audit every
        roster spot, and return one recommended course with credible
        alternatives.
      </p>
      <Preflight dashboard={props.dashboard} />
      <AiRunButton
        status={props.codex}
        running={false}
        hasResult={false}
        labels={{ run: "Build my plan", connect: "Connect ChatGPT" }}
        onRun={() => props.onGenerate("build")}
        onLogin={props.onLogin}
      />
      <small>No AI turn has been spent yet.</small>
    </Panel>
  );
}

function BuildingState({
  generation,
}: {
  generation: WeeklyPlanGenerationState | null | undefined;
}) {
  return (
    <AiGenerationProgress
      eyebrow="Building your Week plan"
      title="Caffeine is working the problem"
      description="Your league context is frozen while Codex compares the most relevant candidates and constructs a valid decision ladder."
      stages={generationStages}
      activeStage={generationStageIndex(generation?.stage)}
    />
  );
}

function FailedState(props: WeeklyPlanPageProps) {
  return (
    <Panel
      className={`${styles.entryState} ${styles.failedState}`}
      role="alert"
    >
      <span className={styles.entryIcon}>
        <Icon name="alert" />
      </span>
      <Eyebrow>Plan not built</Eyebrow>
      <h2>The last research run stopped short.</h2>
      <p>
        {props.error ?? "Caffeine could not validate a complete weekly plan."}
      </p>
      <AiRunButton
        status={props.codex}
        running={false}
        hasResult={false}
        labels={{ run: "Try again" }}
        onRun={() => props.onGenerate("build")}
        onLogin={props.onLogin}
      />
    </Panel>
  );
}

function Preflight({ dashboard }: { dashboard: Dashboard }) {
  const rostered =
    dashboard.starters.length +
    dashboard.bench.length +
    dashboard.reserve.length +
    dashboard.taxi.length;
  return (
    <div className={styles.preflight}>
      <span>
        <small>Team</small>
        <strong>{dashboard.league.teamName}</strong>
      </span>
      <span>
        <small>Record</small>
        <strong>{recordLabel(dashboard)}</strong>
      </span>
      <span>
        <small>Rostered</small>
        <strong>{rostered}</strong>
      </span>
      <span>
        <small>Format</small>
        <strong>{dashboard.scoringLabel}</strong>
      </span>
    </div>
  );
}

function PlanContent(
  props: WeeklyPlanPageProps & { plan: WeeklyPlan; leagueWeek: LeagueWeek },
) {
  const mode = weeklyPageMode({
    leagueStatus: props.dashboard.leagueStatus,
    leagueWeek: props.leagueWeek,
    plan: props.plan,
    running: Boolean(props.generation),
    failed: Boolean(props.error),
  });
  const players = playerMap(props.plan);
  return (
    <div className={styles.plan} data-testid="weekly-plan-page">
      <PlanLifecycleCallout {...props} mode={mode} />
      <PlanBrief plan={props.plan} leagueWeek={props.leagueWeek} />
      <DecisionScorecard
        plan={props.plan}
        thursday={
          props.briefs.thursday?.phase === "thursday"
            ? props.briefs.thursday
            : null
        }
        actions={props.actions}
      />
      <ActionChecklist
        plan={props.plan}
        actions={props.actions.filter(
          (action) =>
            !action.actionKey.startsWith("thursday:") &&
            !action.actionKey.startsWith("weekend:"),
        )}
        pendingActionId={props.pendingActionId ?? null}
        players={players}
        onUpdateAction={props.onUpdateAction}
      />
      <WaiverLadder plan={props.plan} players={players} />
      <Alternatives plan={props.plan} players={players} />
      <CandidateLists plan={props.plan} players={players} />
      <RosterAudit plan={props.plan} players={players} />
      <MarketObservation
        plan={props.plan}
        onOpenTradeLab={props.onOpenTradeLab}
      />
      <WeeklyOutlook
        {...props}
        plan={props.plan}
        leagueWeek={props.leagueWeek}
      />
      <EvidenceDisclosure
        className={styles.allEvidence}
        sources={props.plan.output.sources}
        caveats={props.plan.output.uncertainties}
        eyebrow="Research ledger"
        title="Sources and uncertainties"
        caveatTitle="What could change the call"
        showFreshness
      />
    </div>
  );
}

function PlanLifecycleCallout(
  props: WeeklyPlanPageProps & {
    plan: WeeklyPlan;
    leagueWeek: LeagueWeek;
    mode: ReturnType<typeof weeklyPageMode>;
  },
) {
  if (props.generation) {
    return (
      <div
        className={`${styles.callout} ${styles.calloutLive}`}
        aria-live="polite"
      >
        <Icon name="spark" />
        <div>
          <strong>
            {props.generation.mode === "refine"
              ? "Refining the plan"
              : "Building a fresh plan"}
          </strong>
          <span>
            {generationStages[generationStageIndex(props.generation.stage)]}
          </span>
        </div>
        <Badge tone="live">Working</Badge>
      </div>
    );
  }
  if (props.error) {
    return (
      <div className={`${styles.callout} ${styles.calloutDanger}`} role="alert">
        <Icon name="alert" />
        <div>
          <strong>The latest run failed</strong>
          <span>{props.error} Your last successful plan is still here.</span>
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={() => props.onGenerate("regenerate")}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (props.codex.state === "signed_out") {
    return (
      <div className={styles.callout}>
        <Icon name="lock" />
        <div>
          <strong>Your saved plan is still available</strong>
          <span>
            Connect ChatGPT only when you want to refine or regenerate it.
          </span>
        </div>
        <Button size="small" variant="secondary" onClick={props.onLogin}>
          Connect
        </Button>
      </div>
    );
  }
  if (props.mode === "changed") {
    return (
      <div className={styles.changedBlock}>
        <div className={`${styles.callout} ${styles.calloutWarning}`}>
          <Icon name="refresh" />
          <div>
            <strong>
              {props.leagueWeek.meaningfulChanges.length} material{" "}
              {props.leagueWeek.meaningfulChanges.length === 1
                ? "change"
                : "changes"}{" "}
              since this plan
            </strong>
            <span>
              {props.plan.statusReason ??
                "Review the changes before acting; the original plan remains visible below."}
            </span>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={() => props.onGenerate("refine")}
          >
            Refine plan
          </Button>
        </div>
        {props.leagueWeek.meaningfulChanges.length > 0 && (
          <div className={styles.changeList}>
            {props.leagueWeek.meaningfulChanges.map((change) => (
              <article key={change.id}>
                <Badge tone="warning">{change.kind.replaceAll("_", " ")}</Badge>
                <div>
                  <strong>{change.headline}</strong>
                  <p>{change.description}</p>
                </div>
                <small>Detected {formatRelativeTime(change.detectedAt)}</small>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (props.mode === "stale") {
    return (
      <div className={`${styles.callout} ${styles.calloutWarning}`}>
        <Icon name="clock" />
        <div>
          <strong>The research window has expired</strong>
          <span>
            Sleeper facts may still be current, but verify player news before
            acting.
          </span>
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={() => props.onGenerate("regenerate")}
        >
          Regenerate
        </Button>
      </div>
    );
  }
  return null;
}

function PlanBrief({
  plan,
  leagueWeek,
}: {
  plan: WeeklyPlan;
  leagueWeek: LeagueWeek;
}) {
  const status = weeklyStatusPresentation(leagueWeek.planStatus);
  const lane = plan.output.competitiveLane;
  return (
    <Panel id="phase-tuesday" className={styles.planBrief}>
      <div className={styles.briefMeta}>
        <Badge tone={status.tone}>{status.label}</Badge>
        <Badge
          tone={
            lane.lane === "contender"
              ? "success"
              : lane.lane === "retooler"
                ? "warning"
                : "neutral"
          }
        >
          {competitiveLaneLabel(lane.lane)} · {lane.confidence} confidence
        </Badge>
      </div>
      <h2>{plan.output.headline}</h2>
      <p>{plan.output.summary}</p>
      <div className={styles.laneGrid}>
        <div>
          <small>Why this lane</small>
          <ul>
            {lane.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div>
          <small>What argues against it</small>
          {lane.contraryEvidence.length > 0 ? (
            <ul>
              {lane.contraryEvidence.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p>No material contrary signal surfaced.</p>
          )}
        </div>
      </div>
      <div className={styles.provenance}>
        <span>
          <small>Built</small>
          {formatRelativeTime(plan.generatedAt)}
        </span>
        <span>
          <small>Snapshot</small>
          {formatRelativeTime(leagueWeek.latestSnapshotAt ?? plan.generatedAt)}
        </span>
        <span>
          <small>Research fresh through</small>
          {formatDateTime(plan.researchFreshThrough)}
        </span>
        <span>
          <small>Model</small>
          {plan.model}
        </span>
        <span>
          <small>Sources</small>
          {plan.output.sources.length}
        </span>
        <span>
          <small>Version</small>v{plan.version}
        </span>
      </div>
    </Panel>
  );
}

function DecisionScorecard({
  plan,
  thursday,
  actions,
}: {
  plan: WeeklyPlan;
  thursday: ThursdayBrief | null;
  actions: WeeklyAction[];
}) {
  return (
    <section className={styles.section} aria-labelledby="five-decisions-title">
      <SectionTitle
        eyebrow="The operating system"
        title="Five decisions this week"
      />
      <div className={styles.decisionGrid} id="five-decisions-title">
        {fiveDecisions(plan, thursday, actions).map((decision, index) => (
          <article
            key={decision.id}
            className={`${styles.decisionCard} ${styles[decision.tone]}`}
          >
            <span>0{index + 1}</span>
            <small>{decision.label}</small>
            <strong>{decision.value}</strong>
            <p>{decision.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ActionChecklist({
  plan,
  actions,
  players,
  pendingActionId,
  onUpdateAction,
}: {
  plan: WeeklyPlan;
  actions: WeeklyAction[];
  players: Map<string, WeeklyPlanPlayer>;
  pendingActionId: string | null;
  onUpdateAction(actionId: string, status: WeeklyActionStatus): void;
}) {
  return (
    <Panel className={`${styles.section} ${styles.checklist}`}>
      <SectionTitle
        eyebrow="Current plan"
        title="Your decision checklist"
        trailing={
          <Badge
            tone={unresolvedActions(actions).length > 0 ? "accent" : "success"}
          >
            {unresolvedActions(actions).length} open
          </Badge>
        }
      />
      {actions.length === 0 ? (
        <EmptyWithin
          title="No actions needed"
          copy="The plan did not identify a move worth forcing this week."
        />
      ) : (
        <div className={styles.actionList}>
          {actions.map((action, index) => {
            const presentation = actionStatusPresentation(action.status);
            const output = actionOutputFor(plan, action);
            const sources = sourcesFor(plan, output?.sourceIds ?? []);
            const pending = pendingActionId === action.id;
            const resolved = !["pending", "observed_in_sleeper"].includes(
              action.status,
            );
            return (
              <article
                className={`${styles.actionRow} ${resolved ? styles.resolvedAction : ""}`}
                key={action.id}
              >
                <span className={styles.actionNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className={styles.actionCopy}>
                  <div className={styles.actionMeta}>
                    <Badge
                      tone={
                        action.priority === "now"
                          ? "accent"
                          : action.priority === "soon"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {action.priority}
                    </Badge>
                    <span>{actionKindLabel(action.kind)}</span>
                    <Badge tone={presentation.tone}>{presentation.label}</Badge>
                  </div>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                  {action.playerIds.length > 0 && (
                    <div className={styles.playerChips}>
                      {action.playerIds.map((id) => (
                        <PlanPlayer
                          key={id}
                          player={players.get(id)}
                          playerId={id}
                        />
                      ))}
                    </div>
                  )}
                  {output?.keyUncertainty && (
                    <small className={styles.uncertainty}>
                      Watch: {output.keyUncertainty}
                    </small>
                  )}
                  {sources.length > 0 && (
                    <EvidenceDisclosure
                      className={styles.actionEvidence}
                      sources={sources}
                      eyebrow="Evidence"
                      title="Why Caffeine made this call"
                      summary={`${String(sources.length)} ${sources.length === 1 ? "source" : "sources"}`}
                      showFreshness
                    />
                  )}
                </div>
                <div className={styles.actionControls}>
                  {!resolved ? (
                    <Button
                      size="small"
                      variant="secondary"
                      loading={pending}
                      onClick={() => onUpdateAction(action.id, "completed")}
                    >
                      {action.status === "observed_in_sleeper"
                        ? "Confirm done"
                        : "Mark done"}
                    </Button>
                  ) : (
                    <Badge
                      className={styles.resolvedMark}
                      tone={presentation.tone}
                    >
                      <Icon name={resolvedStatusIcon(action.status)} />
                      {presentation.label}
                    </Badge>
                  )}
                  <ActionMenu
                    action={action}
                    disabled={pending}
                    onUpdateAction={onUpdateAction}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ActionMenu({
  action,
  disabled,
  onUpdateAction,
}: {
  action: WeeklyAction;
  disabled: boolean;
  onUpdateAction(actionId: string, status: WeeklyActionStatus): void;
}) {
  const resolved = !["pending", "observed_in_sleeper"].includes(action.status);
  return (
    <OverflowMenu
      label={`More options for ${action.title}`}
      disabled={disabled}
    >
      {resolved ? (
        <OverflowMenuItem
          leading={<Icon name="refresh" />}
          onSelect={() => onUpdateAction(action.id, "pending")}
        >
          Reopen recommendation
        </OverflowMenuItem>
      ) : (
        <>
          <OverflowMenuItem
            leading={<Icon name="ban" />}
            onSelect={() => onUpdateAction(action.id, "dismissed")}
          >
            Dismiss
          </OverflowMenuItem>
          {action.kind === "trade" && (
            <OverflowMenuItem
              leading={<Icon name="swap" />}
              onSelect={() => onUpdateAction(action.id, "declined")}
            >
              Trade was declined
            </OverflowMenuItem>
          )}
          <OverflowMenuSeparator />
          <OverflowMenuItem
            leading={<Icon name="alert" />}
            onSelect={() => onUpdateAction(action.id, "failed")}
          >
            Tried, but it failed
          </OverflowMenuItem>
          <OverflowMenuItem
            tone="danger"
            leading={<Icon name="close" />}
            onSelect={() => onUpdateAction(action.id, "not_possible")}
          >
            Not possible
          </OverflowMenuItem>
        </>
      )}
    </OverflowMenu>
  );
}

function WaiverLadder({
  plan,
  players,
}: {
  plan: WeeklyPlan;
  players: Map<string, WeeklyPlanPlayer>;
}) {
  const claims = [...plan.output.waiverClaims].sort(
    (a, b) => a.priority - b.priority,
  );
  const groupSizes = new Map<string, number>();
  for (const claim of claims)
    groupSizes.set(
      claim.contingencyGroup,
      (groupSizes.get(claim.contingencyGroup) ?? 0) + 1,
    );
  return (
    <Panel className={`${styles.section} ${styles.waiverPanel}`}>
      <SectionTitle
        eyebrow="Waiver architecture"
        title="Ranked claim ladder"
        trailing={<Badge tone="neutral">Read-only</Badge>}
      />
      {claims.length === 0 ? (
        <EmptyWithin
          title="Hold your position"
          copy="No available player cleared the threshold for a recommended claim."
        />
      ) : (
        <>
          <div className={styles.waiverHeader} aria-hidden="true">
            <span>Priority</span>
            <span>Add</span>
            <span>Drop</span>
            <span>Bid</span>
            <span>Why</span>
          </div>
          <div className={styles.waiverRows}>
            {claims.map((claim) => (
              <article
                key={`${claim.contingencyGroup}-${String(claim.priority)}`}
                className={styles.waiverRow}
              >
                <strong className={styles.claimPriority}>
                  #{claim.priority}
                </strong>
                <PlanPlayer
                  player={players.get(claim.addPlayerId)}
                  playerId={claim.addPlayerId}
                />
                <div className={styles.dropPlayer}>
                  {claim.dropPlayerId ? (
                    <PlanPlayer
                      player={players.get(claim.dropPlayerId)}
                      playerId={claim.dropPlayerId}
                    />
                  ) : (
                    <span>Open roster spot</span>
                  )}
                </div>
                <div className={styles.bid}>
                  <strong>{formatFaabRange(claim)}</strong>
                  {claim.faabPercentTarget !== null && (
                    <small>Target {claim.faabPercentTarget}%</small>
                  )}
                </div>
                <div className={styles.claimWhy}>
                  <p>{claim.rationale}</p>
                  <span>
                    <Badge
                      tone={
                        claim.confidence === "high"
                          ? "success"
                          : claim.confidence === "medium"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {claim.confidence}
                    </Badge>
                    {(groupSizes.get(claim.contingencyGroup) ?? 0) > 1 && (
                      <Badge tone="info">
                        Contingency {claim.contingencyGroup}
                      </Badge>
                    )}
                  </span>
                </div>
              </article>
            ))}
          </div>
          <p className={styles.contingencyNote}>
            <Icon name="swap" /> Claims with the same contingency label share a
            drop slot. Enter them in this order so only one can resolve.
          </p>
        </>
      )}
    </Panel>
  );
}

function Alternatives({
  plan,
  players,
}: {
  plan: WeeklyPlan;
  players: Map<string, WeeklyPlanPlayer>;
}) {
  if (plan.output.alternatives.length === 0) return null;
  return (
    <section className={styles.section}>
      <SectionTitle
        eyebrow="Manager's choice"
        title="Other good ways to play it"
      />
      <div className={styles.alternativeGrid}>
        {plan.output.alternatives.map((alternative) => (
          <Panel className={styles.alternativeCard} key={alternative.headline}>
            <h3>{alternative.headline}</h3>
            <p>{alternative.recommendation}</p>
            {alternative.playerIds.length > 0 && (
              <div className={styles.playerChips}>
                {alternative.playerIds.map((id) => (
                  <PlanPlayer key={id} player={players.get(id)} playerId={id} />
                ))}
              </div>
            )}
            <dl>
              <div>
                <dt>Prefer this when</dt>
                <dd>{alternative.preferableWhen}</dd>
              </div>
              <div>
                <dt>Tradeoff</dt>
                <dd>{alternative.tradeoff}</dd>
              </div>
            </dl>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function CandidateLists({
  plan,
  players,
}: {
  plan: WeeklyPlan;
  players: Map<string, WeeklyPlanPlayer>;
}) {
  return (
    <section className={styles.section}>
      <SectionTitle eyebrow="Roster churn" title="Add now, watch, exit" />
      <div className={styles.candidateGrid}>
        <CandidateColumn
          title="Add now"
          tone="add"
          description="The strongest available upgrades right now"
          items={plan.output.addNow.map((item) => ({ ...item, kicker: null }))}
          players={players}
          plan={plan}
        />
        <CandidateColumn
          title="Watch"
          tone="watch"
          description="Hypotheses with a concrete next signal"
          items={plan.output.watch.map((item) => ({
            ...item,
            kicker: `Trigger: ${item.trigger}`,
          }))}
          players={players}
          plan={plan}
        />
        <CandidateColumn
          title="Exit"
          tone="exit"
          description="Least purposeful roster spots, in order"
          items={[...plan.output.exit]
            .sort((a, b) => a.dropRank - b.dropRank)
            .map((item) => ({
              ...item,
              kicker: item.rosterPurposes.length
                ? `Current role: ${item.rosterPurposes.join(" · ")}`
                : "No Start / Insure / Appreciate / Pop case",
            }))}
          players={players}
          plan={plan}
        />
      </div>
    </section>
  );
}

type CandidateItem = {
  playerId: string;
  headline: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  sourceIds: string[];
  kicker: string | null;
};

function CandidateColumn({
  title,
  tone,
  description,
  items,
  players,
  plan,
}: {
  title: string;
  tone: "add" | "watch" | "exit";
  description: string;
  items: CandidateItem[];
  players: Map<string, WeeklyPlanPlayer>;
  plan: WeeklyPlan;
}) {
  return (
    <Panel className={`${styles.candidateColumn} ${styles[tone]}`}>
      <header>
        <span />
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Badge tone="neutral">{items.length}</Badge>
      </header>
      {items.length === 0 ? (
        <small className={styles.emptyColumn}>Nothing cleared the bar.</small>
      ) : (
        items.map((item) => {
          const sources = sourcesFor(plan, item.sourceIds);
          return (
            <article key={item.playerId} className={styles.candidateItem}>
              <PlanPlayer
                player={players.get(item.playerId)}
                playerId={item.playerId}
              />
              <strong>{item.headline}</strong>
              <p>{item.rationale}</p>
              {item.kicker && <small>{item.kicker}</small>}
              {sources.length > 0 && (
                <EvidenceDisclosure
                  className={styles.candidateEvidence}
                  sources={sources}
                  eyebrow="Evidence"
                  title="Supporting sources"
                  summary={`${String(sources.length)} sources`}
                  showFreshness
                />
              )}
            </article>
          );
        })
      )}
    </Panel>
  );
}

function RosterAudit({
  plan,
  players,
}: {
  plan: WeeklyPlan;
  players: Map<string, WeeklyPlanPlayer>;
}) {
  const unassigned = plan.output.rosterAudit.filter(
    (assessment) => assessment.purposes.length === 0,
  ).length;
  return (
    <Panel className={`${styles.section} ${styles.auditPanel}`}>
      <details>
        <summary>
          <div>
            <Eyebrow>Roster-purpose audit</Eyebrow>
            <h2>Every roster spot needs a job</h2>
            <p>Start, insure, appreciate, or pop on one plausible event.</p>
          </div>
          <span>
            <Badge tone={unassigned > 0 ? "warning" : "success"}>
              {unassigned > 0
                ? `${String(unassigned)} without a role`
                : "Every spot has a case"}
            </Badge>
            <Icon name="chevron" />
          </span>
        </summary>
        <div className={styles.auditGrid}>
          {plan.output.rosterAudit.map((assessment) => (
            <article key={assessment.playerId}>
              <PlanPlayer
                player={players.get(assessment.playerId)}
                playerId={assessment.playerId}
              />
              <div className={styles.purposeBadges}>
                {assessment.purposes.length > 0 ? (
                  assessment.purposes.map((purpose) => (
                    <PurposeBadge key={purpose} purpose={purpose} />
                  ))
                ) : (
                  <Badge tone="warning">No clear role</Badge>
                )}
              </div>
              <p>{assessment.rationale}</p>
            </article>
          ))}
        </div>
      </details>
    </Panel>
  );
}

function PurposeBadge({
  purpose,
}: {
  purpose: RosterPurposeAssessment["purposes"][number];
}) {
  const tones = {
    start: "success",
    insure: "info",
    appreciate: "accent",
    pop: "warning",
  } as const;
  return <Badge tone={tones[purpose]}>{purpose}</Badge>;
}

function MarketObservation({
  plan,
  onOpenTradeLab,
}: {
  plan: WeeklyPlan;
  onOpenTradeLab?: (() => void) | undefined;
}) {
  const observation = plan.output.marketObservation;
  const partnerNames = observation.partnerRosterIds.map(
    (rosterId) =>
      plan.rosters.find((roster) => roster.rosterId === rosterId)?.teamName ??
      `Roster ${String(rosterId)}`,
  );
  return (
    <Panel className={`${styles.section} ${styles.marketPanel}`}>
      <div className={styles.marketIcon}>
        <Icon name="swap" />
      </div>
      <div>
        <Eyebrow>One market observation</Eyebrow>
        <h2>{observation.headline}</h2>
        <p className={styles.marketLead}>{observation.recommendation}</p>
        <p>{observation.rationale}</p>
        {partnerNames.length > 0 && (
          <div className={styles.partnerList}>
            <small>Likely conversations</small>
            {partnerNames.map((name) => (
              <Badge key={name} tone="info">
                {name}
              </Badge>
            ))}
          </div>
        )}
        {observation.alternatives.length > 0 && (
          <ul>
            {observation.alternatives.map((alternative) => (
              <li key={alternative}>{alternative}</li>
            ))}
          </ul>
        )}
      </div>
      {onOpenTradeLab && (
        <Button variant="secondary" onClick={onOpenTradeLab}>
          Open Trade Lab
        </Button>
      )}
    </Panel>
  );
}

function WeeklyOutlook(
  props: WeeklyPlanPageProps & { plan: WeeklyPlan; leagueWeek: LeagueWeek },
) {
  const wednesday =
    props.briefs.wednesday?.phase === "wednesday"
      ? props.briefs.wednesday
      : null;
  const thursday =
    props.briefs.thursday?.phase === "thursday" ? props.briefs.thursday : null;
  const weekend =
    props.briefs.weekend?.phase === "weekend" ? props.briefs.weekend : null;
  return (
    <section className={styles.section}>
      <SectionTitle
        eyebrow="The rest of the week"
        title="Keep the plan, update the facts"
      />
      <WednesdayAftermath {...props} brief={wednesday} />
      <ThursdayLineup {...props} brief={thursday} />
      <WeekendCheck {...props} brief={weekend} />
    </section>
  );
}

type WednesdayBrief = Extract<WeeklyPhaseBrief, { phase: "wednesday" }>;
type ThursdayBrief = Extract<WeeklyPhaseBrief, { phase: "thursday" }>;
type WeekendBrief = Extract<WeeklyPhaseBrief, { phase: "weekend" }>;

function WednesdayAftermath(
  props: WeeklyPlanPageProps & {
    brief: WednesdayBrief | null;
  },
) {
  const running = props.phaseGeneration?.phase === "wednesday";
  const resolved = completedActions(props.actions);
  const open = unresolvedActions(props.actions);
  const observed = props.actions.filter(
    (action) => action.status === "observed_in_sleeper",
  );
  const opportunities = props.brief
    ? uniqueAftermathOpportunities(props.brief)
    : [];
  return (
    <Panel id="phase-wednesday" className={styles.phaseBrief}>
      <PhaseBriefHeader
        day="Wednesday"
        eyebrow="Waiver aftermath"
        title={
          props.brief?.output.headline ?? "See what the league just gave you"
        }
        description={
          props.brief?.output.summary ??
          `${String(resolved.length)} resolved · ${String(open.length)} still open. Refresh Sleeper after waivers process, then review the actual results and newly free players.`
        }
        generatedAt={props.brief?.generatedAt ?? null}
        action={
          <div className={styles.phaseActions}>
            <Button
              size="small"
              variant="ghost"
              leading={<Icon name="refresh" />}
              onClick={props.onRefresh}
            >
              Refresh data
            </Button>
            {!props.phaseErrors?.wednesday && (
              <PhaseRunButton
                phase="wednesday"
                brief={props.brief}
                running={running}
                codex={props.codex}
                onLogin={props.onLogin}
                onGeneratePhase={props.onGeneratePhase}
                buildLabel="Review aftermath"
                rerunLabel="Refresh aftermath"
              />
            )}
          </div>
        }
      />
      {running && !props.brief ? (
        <PhaseProgress phase="wednesday" stage={props.phaseGeneration?.stage} />
      ) : props.brief ? (
        <>
          <PhaseFailure {...props} phase="wednesday" brief={props.brief} />
          {running && (
            <RetainedBriefProgress
              phase="wednesday"
              stage={props.phaseGeneration?.stage}
            />
          )}
          <div className={styles.aftermathMetrics}>
            <MetricBlock
              label="Observed results"
              value={props.brief.output.observedActions.length}
            />
            <MetricBlock
              label="Important drops"
              value={props.brief.output.importantDrops.length}
            />
            <MetricBlock
              label="Newly free"
              value={props.brief.output.newlyFreePlayers.length}
            />
            <MetricBlock
              label="Congestion flags"
              value={props.brief.output.congestion.length}
            />
          </div>
          <div className={styles.aftermathGrid}>
            <PhaseList
              title="Observed results"
              empty="No Sleeper result touched a tracked action."
            >
              {props.brief.output.observedActions.map((action, index) => (
                <article
                  className={styles.observedResult}
                  key={`${action.title}-${String(index)}`}
                >
                  <Badge tone={outcomeTone(action.outcome)}>
                    {action.outcome}
                  </Badge>
                  <div>
                    <strong>{action.title}</strong>
                    <p>{action.description}</p>
                    {action.faabAmount !== null && (
                      <small>{action.faabAmount} FAAB recorded</small>
                    )}
                  </div>
                </article>
              ))}
            </PhaseList>
            <PhaseList
              title="New opportunities"
              empty="No post-waiver player cleared the review threshold."
            >
              {opportunities.map(({ player, recommendedAction }) => (
                <article
                  className={styles.phasePlayerRow}
                  key={player.playerId}
                >
                  <PlanPlayer
                    player={phasePlayer(props.brief!, player.playerId)}
                    playerId={player.playerId}
                  />
                  <div>
                    <strong>{player.headline}</strong>
                    <p>{player.rationale}</p>
                    {recommendedAction && (
                      <Badge
                        tone={
                          recommendedAction === "add_now" ? "accent" : "neutral"
                        }
                      >
                        {recommendedAction.replaceAll("_", " ")}
                      </Badge>
                    )}
                  </div>
                </article>
              ))}
            </PhaseList>
          </div>
          {props.brief.output.congestion.length > 0 && (
            <div className={styles.congestionGrid}>
              {props.brief.output.congestion.map((item) => (
                <article key={`${item.position}-${item.headline}`}>
                  <Badge tone="warning">{item.position}</Badge>
                  <strong>{item.headline}</strong>
                  <p>{item.rationale}</p>
                  <small>{item.recommendation}</small>
                </article>
              ))}
            </div>
          )}
          <PhaseEvidence brief={props.brief} />
        </>
      ) : (
        <>
          <PhaseFailure {...props} phase="wednesday" brief={null} />
          <div className={styles.phaseEmptyBody}>
            <div className={styles.outlookStats}>
              <span>
                <strong>{resolved.length}</strong> resolved
              </span>
              <span>
                <strong>{open.length}</strong> open
              </span>
              <span>
                <strong>{observed.length}</strong> observed
              </span>
            </div>
            <p>
              Nothing runs automatically. Refresh Sleeper first, then ask
              Caffeine to classify the aftermath when you are ready.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}

function ThursdayLineup(
  props: WeeklyPlanPageProps & { brief: ThursdayBrief | null },
) {
  const running = props.phaseGeneration?.phase === "thursday";
  const players = props.brief
    ? new Map(props.brief.players.map((player) => [player.playerId, player]))
    : new Map<string, WeeklyPlanPlayer>();
  return (
    <Panel id="phase-thursday" className={styles.phaseBrief}>
      <PhaseBriefHeader
        day="Thursday"
        eyebrow="Focused lineup pass"
        title={
          props.brief?.output.headline ??
          "Set the lineup around the real close calls"
        }
        description={
          props.brief?.output.summary ??
          "The Tuesday plan does not pretend to include start/sit work. Build this pass when injuries, roles, and matchup information are worth researching."
        }
        generatedAt={props.brief?.generatedAt ?? null}
        action={
          props.phaseErrors?.thursday ? null : (
            <PhaseRunButton
              phase="thursday"
              brief={props.brief}
              running={running}
              codex={props.codex}
              onLogin={props.onLogin}
              onGeneratePhase={props.onGeneratePhase}
              buildLabel="Build lineup pass"
              rerunLabel="Regenerate lineup"
            />
          )
        }
      />
      {running && !props.brief ? (
        <PhaseProgress phase="thursday" stage={props.phaseGeneration?.stage} />
      ) : props.brief ? (
        <>
          <PhaseFailure {...props} phase="thursday" brief={props.brief} />
          {running && (
            <RetainedBriefProgress
              phase="thursday"
              stage={props.phaseGeneration?.stage}
            />
          )}
          <div className={styles.lineupLayout}>
            <div className={styles.lineupBoard}>
              <small>Proposed legal lineup</small>
              <div className={styles.lineupSlots}>
                {props.brief.output.slotAssignments.map((assignment) => (
                  <article key={assignment.slotIndex}>
                    <Badge tone="neutral">{assignment.slot}</Badge>
                    <PlanPlayer
                      player={players.get(assignment.playerId)}
                      playerId={assignment.playerId}
                    />
                  </article>
                ))}
              </div>
            </div>
            <div className={styles.lineupMoves}>
              <small>Recommended moves</small>
              {props.brief.output.recommendedMoves.length === 0 ? (
                <EmptyWithin
                  title="No lineup change"
                  copy="The current legal starters remain the best supported configuration."
                />
              ) : (
                props.brief.output.recommendedMoves.map((move) => {
                  const action = props.actions.find(
                    (candidate) =>
                      candidate.actionKey === `thursday:${move.actionKey}`,
                  );
                  return (
                    <article key={move.actionKey}>
                      <div className={styles.movePlayers}>
                        <span className={styles.moveSide}>
                          <small>Start</small>
                          <PlanPlayer
                            player={players.get(move.playerId)}
                            playerId={move.playerId}
                          />
                        </span>
                        {move.replacePlayerId && (
                          <>
                            <Icon name="swap" />
                            <span className={styles.moveSide}>
                              <small>Sit</small>
                              <PlanPlayer
                                player={players.get(move.replacePlayerId)}
                                playerId={move.replacePlayerId}
                              />
                            </span>
                          </>
                        )}
                      </div>
                      <p>{move.rationale}</p>
                      {action && (
                        <PhaseActionControls
                          action={action}
                          pendingActionId={props.pendingActionId ?? null}
                          onUpdateAction={props.onUpdateAction}
                        />
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </div>
          {props.brief.output.closeCalls.length > 0 && (
            <div className={styles.closeCallGrid}>
              {props.brief.output.closeCalls.map((call) => (
                <article
                  key={`${String(call.slotIndex)}-${call.chosenPlayerId}`}
                >
                  <div className={styles.closeCallPlayers}>
                    <PlanPlayer
                      player={players.get(call.chosenPlayerId)}
                      playerId={call.chosenPlayerId}
                    />
                    <span>over</span>
                    <PlanPlayer
                      player={players.get(call.alternativePlayerId)}
                      playerId={call.alternativePlayerId}
                    />
                  </div>
                  <p>{call.rationale}</p>
                  {call.projectedPointDelta !== null && (
                    <Badge tone="info">
                      {call.projectedPointDelta >= 0 ? "+" : ""}
                      {call.projectedPointDelta.toFixed(1)} projected
                    </Badge>
                  )}
                  {call.flipConditions.length > 0 && (
                    <ul>
                      {call.flipConditions.map((condition) => (
                        <li key={condition}>{condition}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
          {props.brief.output.flexNotes.length > 0 && (
            <div className={styles.flexNotes}>
              {props.brief.output.flexNotes.map((note) => (
                <article key={note.headline}>
                  <Icon name="lock" />
                  <div>
                    <strong>{note.headline}</strong>
                    <p>{note.rationale}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
          <PhaseEvidence brief={props.brief} />
        </>
      ) : (
        <>
          <PhaseFailure {...props} phase="thursday" brief={null} />
          <div className={styles.phaseEmptyBody}>
            <Icon name="pulse" />
            <p>
              No lineup recommendation has been generated. Your current Sleeper
              lineup remains the source of truth.
            </p>
            {props.onOpenLineup && (
              <Button size="small" variant="ghost" onClick={props.onOpenLineup}>
                Open roster lineup
              </Button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function WeekendCheck(
  props: WeeklyPlanPageProps & { brief: WeekendBrief | null },
) {
  const running = props.phaseGeneration?.phase === "weekend";
  const players = props.brief
    ? new Map(props.brief.players.map((player) => [player.playerId, player]))
    : new Map<string, WeeklyPlanPlayer>();
  return (
    <Panel id="phase-weekend" className={styles.phaseBrief}>
      <PhaseBriefHeader
        day="Weekend"
        eyebrow="Execution check"
        title={
          props.brief?.output.headline ??
          "Protect flexibility and preserve one last edge"
        }
        description={
          props.brief?.output.summary ??
          "Run this only when final statuses and game windows make the inactive, flex, and stash questions concrete."
        }
        generatedAt={props.brief?.generatedAt ?? null}
        action={
          props.phaseErrors?.weekend ? null : (
            <PhaseRunButton
              phase="weekend"
              brief={props.brief}
              running={running}
              codex={props.codex}
              onLogin={props.onLogin}
              onGeneratePhase={props.onGeneratePhase}
              buildLabel="Build weekend check"
              rerunLabel="Regenerate check"
            />
          )
        }
      />
      {running && !props.brief ? (
        <PhaseProgress phase="weekend" stage={props.phaseGeneration?.stage} />
      ) : props.brief ? (
        <>
          <PhaseFailure {...props} phase="weekend" brief={props.brief} />
          {running && (
            <RetainedBriefProgress
              phase="weekend"
              stage={props.phaseGeneration?.stage}
            />
          )}
          {props.brief.output.criticalStatusAlerts.length > 0 && (
            <div className={styles.alertGrid}>
              {props.brief.output.criticalStatusAlerts.map((alert) => (
                <article
                  key={`${alert.playerId}-${alert.headline}`}
                  className={styles[alert.severity]}
                >
                  <PlanPlayer
                    player={players.get(alert.playerId)}
                    playerId={alert.playerId}
                  />
                  <Badge
                    tone={
                      alert.severity === "critical"
                        ? "danger"
                        : alert.severity === "warning"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {alert.status}
                  </Badge>
                  <strong>{alert.headline}</strong>
                  <p>{alert.rationale}</p>
                  <small>{alert.recommendedAction}</small>
                </article>
              ))}
            </div>
          )}
          <div className={styles.weekendGrid}>
            <PhaseList
              title="Flexibility notes"
              empty="No late-window flexibility issue surfaced."
            >
              {props.brief.output.flexibilityNotes.map((note) => (
                <article className={styles.simpleBriefItem} key={note.headline}>
                  <Icon name="clock" />
                  <div>
                    <strong>{note.headline}</strong>
                    <p>{note.rationale}</p>
                  </div>
                </article>
              ))}
            </PhaseList>
            <PhaseList
              title="Asymmetric stashes"
              empty="No available stash is worth forcing."
            >
              {props.brief.output.stashCandidates.map((candidate) => (
                <article className={styles.stashItem} key={candidate.playerId}>
                  <PlanPlayer
                    player={players.get(candidate.playerId)}
                    playerId={candidate.playerId}
                  />
                  <div>
                    <strong>{candidate.headline}</strong>
                    <p>{candidate.rationale}</p>
                    <small>
                      {candidate.window.replaceAll("_", " ")} · Trigger:{" "}
                      {candidate.trigger}
                    </small>
                    {candidate.dropPlayerId && (
                      <span>
                        Drop{" "}
                        <PlanPlayer
                          player={players.get(candidate.dropPlayerId)}
                          playerId={candidate.dropPlayerId}
                        />
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </PhaseList>
          </div>
          {props.brief.output.actions.length > 0 && (
            <div className={styles.weekendActions}>
              <small>Execution checklist</small>
              {props.brief.output.actions.map((item) => {
                const action = props.actions.find(
                  (candidate) =>
                    candidate.actionKey === `weekend:${item.actionKey}`,
                );
                return (
                  <article key={item.actionKey}>
                    <div>
                      <Badge
                        tone={item.priority === "now" ? "accent" : "neutral"}
                      >
                        {item.priority}
                      </Badge>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    {action && (
                      <PhaseActionControls
                        action={action}
                        pendingActionId={props.pendingActionId ?? null}
                        onUpdateAction={props.onUpdateAction}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <PhaseEvidence brief={props.brief} />
        </>
      ) : (
        <>
          <PhaseFailure {...props} phase="weekend" brief={null} />
          <div className={styles.phaseEmptyBody}>
            <Icon name="bolt" />
            <p>
              No fake inactive sweep is shown here. Refresh when the final news
              lands, then deliberately build this check.
            </p>
            {props.onOpenAnalyst && (
              <Button
                size="small"
                variant="ghost"
                onClick={props.onOpenAnalyst}
              >
                Ask the analyst
              </Button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function PhaseBriefHeader({
  day,
  eyebrow,
  title,
  description,
  generatedAt,
  action,
}: {
  day: string;
  eyebrow: string;
  title: string;
  description: string;
  generatedAt: string | null;
  action: ReactNode;
}) {
  return (
    <header className={styles.phaseBriefHeader}>
      <div>
        <span className={styles.phaseDay}>{day}</span>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3>{title}</h3>
        <p>{description}</p>
        {generatedAt && <small>Built {formatRelativeTime(generatedAt)}</small>}
      </div>
      {action}
    </header>
  );
}

function PhaseRunButton({
  phase,
  brief,
  running,
  codex,
  onLogin,
  onGeneratePhase,
  buildLabel,
  rerunLabel,
}: {
  phase: WeeklyBriefPhase;
  brief: WeeklyPhaseBrief | null;
  running: boolean;
  codex: CodexStatus;
  onLogin(): void;
  onGeneratePhase(
    phase: WeeklyBriefPhase,
    mode: WeeklyPhaseBriefRequest["mode"],
  ): void;
  buildLabel: string;
  rerunLabel: string;
}) {
  if (phase === "wednesday")
    return (
      <Button
        size="small"
        variant="primary"
        loading={running}
        leading={<Icon name="refresh" />}
        onClick={() => onGeneratePhase(phase, brief ? "regenerate" : "build")}
      >
        {running ? "Working…" : brief ? rerunLabel : buildLabel}
      </Button>
    );
  return (
    <AiRunButton
      size="small"
      status={codex}
      running={running}
      hasResult={Boolean(brief)}
      labels={{ run: buildLabel, rerun: rerunLabel, running: "Working…" }}
      onLogin={onLogin}
      onRun={() => onGeneratePhase(phase, brief ? "regenerate" : "build")}
    />
  );
}

function PhaseFailure(
  props: WeeklyPlanPageProps & {
    phase: WeeklyBriefPhase;
    brief: WeeklyPhaseBrief | null;
  },
) {
  const error = props.phaseErrors?.[props.phase];
  if (!error || props.phaseGeneration?.phase === props.phase) return null;
  const label =
    props.phase === "wednesday"
      ? "aftermath"
      : props.phase === "thursday"
        ? "lineup pass"
        : "weekend check";
  return (
    <div
      className={`${styles.callout} ${styles.calloutDanger} ${styles.phaseFailure}`}
      role="alert"
    >
      <Icon name="alert" />
      <div>
        <strong>The {label} was not updated</strong>
        <span>
          {error} {props.brief ? "The last valid version remains below." : ""}
        </span>
      </div>
      <PhaseRunButton
        phase={props.phase}
        brief={props.brief}
        running={false}
        codex={props.codex}
        onLogin={props.onLogin}
        onGeneratePhase={props.onGeneratePhase}
        buildLabel="Try again"
        rerunLabel="Try again"
      />
    </div>
  );
}

function PhaseProgress({
  phase,
  stage,
}: {
  phase: WeeklyBriefPhase;
  stage: WeeklyPhaseGenerationState["stage"] | undefined;
}) {
  return (
    <AiGenerationProgress
      className={styles.phaseProgress}
      eyebrow={`${phase} brief`}
      title={phaseProgressTitle(stage)}
      description="The previous weekly plan remains intact while this focused pass uses the latest frozen league context."
      stages={phaseProgressStages(phase)}
      activeStage={phaseProgressIndex(phase, stage)}
    />
  );
}

function RetainedBriefProgress({
  phase,
  stage,
}: {
  phase: WeeklyBriefPhase;
  stage: WeeklyPhaseGenerationState["stage"] | undefined;
}) {
  return (
    <div
      className={`${styles.callout} ${styles.calloutLive}`}
      aria-live="polite"
    >
      <Icon name="spark" />
      <div>
        <strong>Updating the {phase} brief</strong>
        <span>
          {phaseProgressTitle(stage)}. The saved version remains visible below.
        </span>
      </div>
      <Badge tone="live">Working</Badge>
    </div>
  );
}

function PhaseList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className={styles.phaseList}>
      <small>{title}</small>
      {hasChildren ? (
        children
      ) : (
        <p className={styles.phaseListEmpty}>{empty}</p>
      )}
    </div>
  );
}

function PhaseActionControls({
  action,
  pendingActionId,
  onUpdateAction,
}: {
  action: WeeklyAction;
  pendingActionId: string | null;
  onUpdateAction(actionId: string, status: WeeklyActionStatus): void;
}) {
  const status = actionStatusPresentation(action.status);
  const open = ["pending", "observed_in_sleeper"].includes(action.status);
  return (
    <div className={styles.phaseActionControls}>
      {open ? (
        <Button
          size="small"
          variant="secondary"
          loading={pendingActionId === action.id}
          onClick={() => onUpdateAction(action.id, "completed")}
        >
          Mark done
        </Button>
      ) : (
        <Badge tone={status.tone}>{status.label}</Badge>
      )}
      <ActionMenu
        action={action}
        disabled={pendingActionId === action.id}
        onUpdateAction={onUpdateAction}
      />
    </div>
  );
}

function PhaseEvidence({ brief }: { brief: WeeklyPhaseBrief }) {
  return (
    <EvidenceDisclosure
      className={styles.phaseEvidence}
      sources={brief.output.sources}
      caveats={brief.output.uncertainties}
      eyebrow="Brief evidence"
      title="Sources and remaining uncertainty"
      showFreshness
    />
  );
}

function MetricBlock({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

function phasePlayer(
  brief: WeeklyPhaseBrief,
  playerId: string,
): WeeklyPlanPlayer | undefined {
  return brief.players.find((player) => player.playerId === playerId);
}

function outcomeTone(
  outcome: WednesdayBrief["output"]["observedActions"][number]["outcome"],
): "success" | "warning" | "danger" | "neutral" {
  if (outcome === "completed") return "success";
  if (outcome === "failed" || outcome === "outbid") return "danger";
  if (outcome === "withdrawn") return "warning";
  return "neutral";
}

function uniqueAftermathOpportunities(brief: WednesdayBrief) {
  const byPlayerId = new Map<
    string,
    {
      player: WednesdayBrief["output"]["importantDrops"][number];
      recommendedAction: "add_now" | "watch" | "pass" | null;
    }
  >();
  for (const player of brief.output.newlyFreePlayers)
    byPlayerId.set(player.playerId, {
      player,
      recommendedAction: player.recommendedAction,
    });
  for (const player of brief.output.importantDrops)
    byPlayerId.set(player.playerId, {
      player,
      recommendedAction:
        brief.output.newlyFreePlayers.find(
          (candidate) => candidate.playerId === player.playerId,
        )?.recommendedAction ?? null,
    });
  return [...byPlayerId.values()];
}

function resolvedStatusIcon(
  status: WeeklyActionStatus,
): "check" | "ban" | "alert" | "close" {
  if (status === "completed") return "check";
  if (status === "dismissed" || status === "superseded") return "ban";
  if (status === "failed" || status === "declined") return "alert";
  return "close";
}

function phaseProgressTitle(
  stage: WeeklyPhaseGenerationState["stage"] | undefined,
): string {
  if (stage === "reconciling_week") return "Reconciling Sleeper outcomes";
  if (stage === "researching_players")
    return "Researching the decisive players";
  if (stage === "optimizing_lineup") return "Validating the legal lineup";
  if (stage === "building_brief") return "Building the focused brief";
  return "Reading the latest league state";
}

function phaseProgressStages(phase: WeeklyBriefPhase): readonly string[] {
  if (phase === "wednesday")
    return ["Reading league", "Reconciling the week", "Building the aftermath"];
  if (phase === "thursday")
    return [
      "Reading league",
      "Researching close calls",
      "Optimizing the lineup",
      "Building the brief",
    ];
  return [
    "Reading league",
    "Researching statuses",
    "Building the execution check",
  ];
}

function phaseProgressIndex(
  phase: WeeklyBriefPhase,
  stage: WeeklyPhaseGenerationState["stage"] | undefined,
): number {
  if (stage === "building_brief") return phase === "thursday" ? 3 : 2;
  if (stage === "optimizing_lineup") return 2;
  if (stage === "researching_players" || stage === "reconciling_week") return 1;
  return 0;
}

function PlanPlayer({
  player,
  playerId,
}: {
  player: WeeklyPlanPlayer | undefined;
  playerId: string;
}) {
  const view = planPlayerView(player, playerId);
  return (
    <span className={styles.planPlayer}>
      <PlayerPhoto player={view} small />
      <span>
        <strong>{view.name}</strong>
        <small>
          {[view.position, view.nflTeam, view.injuryStatus]
            .filter(Boolean)
            .join(" · ") || "Player"}
        </small>
      </span>
    </span>
  );
}

function EmptyWithin({ title, copy }: { title: string; copy: string }) {
  return (
    <div className={styles.emptyWithin}>
      <Icon name="check" />
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
    </div>
  );
}

function sourcesFor(
  plan: WeeklyPlan,
  sourceIds: readonly string[],
): EvidenceSource[] {
  if (sourceIds.length === 0) return [];
  const wanted = new Set(sourceIds);
  return plan.output.sources.filter(
    (source) => source.evidenceId && wanted.has(source.evidenceId),
  );
}

function planPlayerView(
  player: WeeklyPlanPlayer | undefined,
  playerId: string,
): PlayerView {
  return {
    playerId,
    name: player?.name ?? `Player ${playerId}`,
    position: player?.position ?? null,
    nflTeam: player?.nflTeam ?? null,
    injuryStatus: player?.injuryStatus ?? null,
    status: player?.status ?? null,
    isStarter: false,
    isReserve: false,
    isTaxi: false,
    rosterSlot: null,
  };
}

function generationMode(
  mode: ReturnType<typeof weeklyPageMode>,
  hasPlan: boolean,
): WeeklyPlanRequest["mode"] {
  if (!hasPlan) return "build";
  if (mode === "changed") return "refine";
  return "regenerate";
}

function generationLabels(
  mode: ReturnType<typeof weeklyPageMode>,
  hasPlan: boolean,
) {
  return {
    run: "Build my plan",
    rerun: mode === "changed" ? "Refine plan" : "Regenerate",
    running: mode === "building" && hasPlan ? "Updating…" : "Building…",
  };
}

function generationStageIndex(
  stage: WeeklyPlanGenerationState["stage"] | undefined,
): number {
  if (stage === "researching_candidates") return 1;
  if (stage === "building_plan") return 2;
  return 0;
}

function recordLabel(dashboard: Dashboard): string {
  const record = dashboard.record;
  return `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;
}

function actionKindLabel(kind: WeeklyAction["kind"]): string {
  return kind.replaceAll("_", " ");
}
