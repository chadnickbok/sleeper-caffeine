import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReportKind,
  RuntimeEvent,
  WeeklyBriefPhase,
  WeeklyPhaseBriefRequest,
  WeeklyPlanRequest,
} from "@sleeper-caffeine/ipc-contract";
import {
  useBootstrapQuery,
  useCaffeineCommands,
} from "./api/use-caffeine-runtime.js";
import { useRuntimeEvents } from "./app/use-runtime-events.js";
import { AppShell, type AppPage as Page } from "./app/AppShell.js";
import { PageRouter } from "./app/PageRouter.js";
import { EmptyLeague, LaunchScreen } from "./app/StartupStates.js";
import {
  AnalystDrawer,
  type CaffeineChatRun,
} from "./features/assistant/AnalystDrawer.js";
import { Onboarding } from "./features/onboarding/Onboarding.js";
import type {
  WeeklyPhaseGenerationState,
  WeeklyPhaseErrors,
  WeeklyPlanGenerationState,
} from "./features/weekly/WeeklyPlanPage.js";

export function App() {
  const bootstrap = useBootstrapQuery();
  const commands = useCaffeineCommands();
  const [page, setPage] = useState<Page>("home");
  const [onboarding, setOnboarding] = useState(false);
  const [analystOpen, setAnalystOpen] = useState(false);
  const [chatRun, setChatRun] = useState<CaffeineChatRun | null>(null);
  const [weeklyGeneration, setWeeklyGeneration] =
    useState<WeeklyPlanGenerationState | null>(null);
  const [weeklyPhaseGeneration, setWeeklyPhaseGeneration] =
    useState<WeeklyPhaseGenerationState | null>(null);
  const [weeklyPlanError, setWeeklyPlanError] = useState<string | null>(null);
  const [weeklyPhaseErrors, setWeeklyPhaseErrors] = useState<WeeklyPhaseErrors>(
    {},
  );
  const data = bootstrap.data ?? null;
  const active = data?.activeDashboard ?? null;
  const activeWeeklyKey = active
    ? `${active.league.leagueId}:${active.league.season}:${String(active.week)}`
    : null;
  const previousWeeklyKey = useRef(activeWeeklyKey);
  const activeWeeklyKeyRef = useRef(activeWeeklyKey);

  const resetWeeklyTransientState = useCallback(() => {
    setWeeklyGeneration(null);
    setWeeklyPhaseGeneration(null);
    setWeeklyPlanError(null);
    setWeeklyPhaseErrors({});
  }, []);

  useEffect(() => {
    activeWeeklyKeyRef.current = activeWeeklyKey;
    if (previousWeeklyKey.current !== activeWeeklyKey)
      resetWeeklyTransientState();
    previousWeeklyKey.current = activeWeeklyKey;
  }, [activeWeeklyKey, resetWeeklyTransientState]);

  const handleRuntimeEvent = useCallback(
    (event: RuntimeEvent) => {
      const eventKey = weeklyEventKey(event);
      if (eventKey && eventKey !== activeWeeklyKey) return;
      if (event.type === "chat_started")
        setChatRun({
          leagueId: event.leagueId,
          runId: event.runId,
          userMessage: event.userMessage,
          delta: "",
          status: "running",
          assistantMessage: null,
          error: null,
        });
      if (event.type === "chat_delta")
        setChatRun((current) =>
          current?.leagueId === event.leagueId && current.runId === event.runId
            ? { ...current, delta: current.delta + event.text }
            : current,
        );
      if (event.type === "chat_completed")
        setChatRun((current) =>
          current?.leagueId === event.leagueId && current.runId === event.runId
            ? {
                ...current,
                status: "complete",
                assistantMessage: event.assistantMessage,
                error: null,
              }
            : current,
        );
      if (event.type === "chat_failed")
        setChatRun((current) =>
          current?.leagueId === event.leagueId && current.runId === event.runId
            ? { ...current, status: "failed", error: event.error }
            : current,
        );
      if (event.type === "weekly_plan_started") {
        setWeeklyPlanError(null);
        setWeeklyGeneration({
          mode: event.mode,
          stage: "reading_league",
        });
      }
      if (event.type === "weekly_plan_progress")
        setWeeklyGeneration((current) =>
          current ? { ...current, stage: event.stage } : current,
        );
      if (event.type === "weekly_plan_completed") {
        setWeeklyGeneration(null);
        setWeeklyPlanError(null);
      }
      if (event.type === "weekly_plan_failed") {
        setWeeklyGeneration(null);
        setWeeklyPlanError(event.error);
      }
      if (event.type === "weekly_phase_brief_started") {
        setWeeklyPhaseErrors((current) => ({
          ...current,
          [event.key.phase]: null,
        }));
        setWeeklyPhaseGeneration({
          phase: event.key.phase,
          mode: event.mode,
          stage: "reading_league",
        });
      }
      if (event.type === "weekly_phase_brief_progress")
        setWeeklyPhaseGeneration((current) =>
          current?.phase === event.key.phase
            ? { ...current, stage: event.stage }
            : current,
        );
      if (event.type === "weekly_phase_brief_completed") {
        setWeeklyPhaseGeneration((current) =>
          current?.phase === event.brief.phase ? null : current,
        );
        setWeeklyPhaseErrors((current) => ({
          ...current,
          [event.brief.phase]: null,
        }));
      }
      if (event.type === "weekly_phase_brief_failed") {
        setWeeklyPhaseGeneration((current) =>
          current?.phase === event.key.phase ? null : current,
        );
        setWeeklyPhaseErrors((current) => ({
          ...current,
          [event.key.phase]: event.error,
        }));
      }
    },
    [activeWeeklyKey],
  );
  useRuntimeEvents(handleRuntimeEvent);

  useEffect(() => {
    const openAnalyst = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey))
        return;
      event.preventDefault();
      if (bootstrap.data?.activeDashboard) setAnalystOpen(true);
    };
    window.addEventListener("keydown", openAnalyst);
    return () => window.removeEventListener("keydown", openAnalyst);
  }, [bootstrap.data?.activeDashboard]);

  const error =
    commands.error ?? (bootstrap.error ? messageOf(bootstrap.error) : null);

  const report = (kind: ReportKind) =>
    data?.reports.find((candidate) => candidate.kind === kind) ?? null;

  async function sendChat(message: string) {
    await commands.sendChat(message);
  }

  const safely = (operation: Promise<unknown>) => {
    void operation.catch(() => undefined);
  };

  const generateWeeklyPlan = (mode: WeeklyPlanRequest["mode"]) => {
    if (!active || !activeWeeklyKey) return;
    const requestKey = activeWeeklyKey;
    setWeeklyPlanError(null);
    void commands
      .generateWeeklyPlan({
        leagueId: active.league.leagueId,
        season: active.league.season,
        week: active.week,
        mode,
      })
      .catch((cause) => {
        if (activeWeeklyKeyRef.current !== requestKey) return;
        setWeeklyGeneration(null);
        setWeeklyPlanError(messageOf(cause));
      });
  };

  const generateWeeklyPhase = (
    phase: WeeklyBriefPhase,
    mode: WeeklyPhaseBriefRequest["mode"],
  ) => {
    if (!active || !activeWeeklyKey) return;
    const requestKey = activeWeeklyKey;
    setWeeklyPhaseErrors((current) => ({ ...current, [phase]: null }));
    void commands
      .generateWeeklyPhaseBrief({
        leagueId: active.league.leagueId,
        season: active.league.season,
        week: active.week,
        phase,
        mode,
      })
      .catch((cause) => {
        if (activeWeeklyKeyRef.current !== requestKey) return;
        setWeeklyPhaseGeneration((current) =>
          current?.phase === phase ? null : current,
        );
        setWeeklyPhaseErrors((current) => ({
          ...current,
          [phase]: messageOf(cause),
        }));
      });
  };

  if (!data) return <LaunchScreen error={error} />;

  return (
    <AppShell
      data={data}
      page={page}
      dashboard={active}
      error={error}
      refreshPending={commands.pending.refresh}
      onPage={setPage}
      onAddLeague={() => setOnboarding(true)}
      onSwitchLeague={(leagueId) => {
        resetWeeklyTransientState();
        safely(commands.switchLeague(leagueId));
      }}
      onRefresh={() => safely(commands.refresh())}
      onAnalyst={() => setAnalystOpen(true)}
      onLogin={() => safely(commands.login())}
      onDismissError={commands.dismissError}
    >
      {!active ? (
        <EmptyLeague onAdd={() => setOnboarding(true)} />
      ) : (
        <PageRouter
          page={page}
          data={data}
          dashboard={active}
          teamReport={report("team_analysis")}
          tradeReport={report("trade_suggestions")}
          draftReport={report("draft_candidates")}
          pending={commands.pending}
          weeklyGeneration={weeklyGeneration}
          weeklyPhaseGeneration={weeklyPhaseGeneration}
          weeklyPlanError={weeklyPlanError}
          weeklyPhaseErrors={weeklyPhaseErrors}
          onGenerate={(kind) => safely(commands.generateReport(kind))}
          onNavigate={setPage}
          onRefresh={() => safely(commands.refresh())}
          onLogin={() => safely(commands.login())}
          onClear={() => safely(commands.clear())}
          onLogout={() => safely(commands.logout())}
          onAiSettings={(settings) =>
            safely(commands.updateAiSettings(settings))
          }
          onToggleDraftPin={(playerId) =>
            safely(commands.toggleDraftPin(playerId))
          }
          onGenerateWeekly={generateWeeklyPlan}
          onGenerateWeeklyPhase={generateWeeklyPhase}
          onUpdateWeeklyAction={(actionId, status) =>
            safely(commands.updateWeeklyAction(actionId, status))
          }
          onOpenAnalyst={() => setAnalystOpen(true)}
        />
      )}

      {(onboarding || !active) && (
        <Onboarding
          {...(active ? { onClose: () => setOnboarding(false) } : {})}
          onSaved={(next) => {
            resetWeeklyTransientState();
            commands.setBootstrap(next);
            setOnboarding(false);
            setPage("home");
          }}
        />
      )}
      {analystOpen && active && (
        <AnalystDrawer
          dashboard={active}
          status={data.codex}
          messages={data.chatMessages}
          hasMore={data.chatHasMore}
          activeRun={chatRun}
          sendPending={commands.pending.chat}
          onClose={() => setAnalystOpen(false)}
          onLogin={() => safely(commands.login())}
          onSend={sendChat}
        />
      )}
    </AppShell>
  );
}

function weeklyEventKey(event: RuntimeEvent): string | null {
  if (
    event.type === "weekly_plan_started" ||
    event.type === "weekly_plan_progress" ||
    event.type === "weekly_plan_failed" ||
    event.type === "weekly_phase_brief_started" ||
    event.type === "weekly_phase_brief_progress" ||
    event.type === "weekly_phase_brief_failed"
  )
    return `${event.key.leagueId}:${event.key.season}:${String(event.key.week)}`;
  if (event.type === "weekly_plan_completed")
    return `${event.bundle.leagueWeek.leagueId}:${event.bundle.leagueWeek.season}:${String(event.bundle.leagueWeek.week)}`;
  if (event.type === "weekly_phase_brief_completed")
    return `${event.brief.leagueId}:${event.brief.season}:${String(event.brief.week)}`;
  return null;
}

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': /, "")
    : "Something went wrong";
}
