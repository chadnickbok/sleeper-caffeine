import { useCallback, useEffect, useState } from "react";
import type { ReportKind, RuntimeEvent } from "@sleeper-caffeine/ipc-contract";
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

export function App() {
  const bootstrap = useBootstrapQuery();
  const commands = useCaffeineCommands();
  const [page, setPage] = useState<Page>("home");
  const [onboarding, setOnboarding] = useState(false);
  const [analystOpen, setAnalystOpen] = useState(false);
  const [chatRun, setChatRun] = useState<CaffeineChatRun | null>(null);
  const handleChatEvent = useCallback((event: RuntimeEvent) => {
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
  }, []);
  useRuntimeEvents(handleChatEvent);

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

  const data = bootstrap.data ?? null;
  const error =
    commands.error ?? (bootstrap.error ? messageOf(bootstrap.error) : null);

  const active = data?.activeDashboard ?? null;
  const report = (kind: ReportKind) =>
    data?.reports.find((candidate) => candidate.kind === kind) ?? null;

  async function sendChat(message: string) {
    await commands.sendChat(message);
  }

  const safely = (operation: Promise<unknown>) => {
    void operation.catch(() => undefined);
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
      onSwitchLeague={(leagueId) => safely(commands.switchLeague(leagueId))}
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
        />
      )}

      {(onboarding || !active) && (
        <Onboarding
          {...(active ? { onClose: () => setOnboarding(false) } : {})}
          onSaved={(next) => {
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

function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': /, "")
    : "Something went wrong";
}
