import type {
  AiReport,
  AiSettings,
  Bootstrap,
  Dashboard,
  ReportKind,
  WeeklyActionStatus,
  WeeklyBriefPhase,
  WeeklyPhaseBriefRequest,
  WeeklyPlanRequest,
} from "@sleeper-caffeine/ipc-contract";
import type { CaffeinePendingState } from "../api/use-caffeine-runtime.js";
import { DraftPage } from "../features/draft/DraftPage.js";
import { FrontOffice } from "../features/front-office/FrontOffice.js";
import { ReportPage } from "../features/reports/ReportPage.js";
import { RosterPage } from "../features/roster/RosterPage.js";
import { SettingsPage } from "../features/settings/SettingsPage.js";
import {
  WeeklyPlanPage,
  type WeeklyPhaseGenerationState,
  type WeeklyPhaseErrors,
  type WeeklyPlanGenerationState,
} from "../features/weekly/WeeklyPlanPage.js";
import type { AppPage } from "./AppShell.js";

export interface PageRouterProps {
  page: AppPage;
  data: Bootstrap;
  dashboard: Dashboard;
  teamReport: AiReport | null;
  tradeReport: AiReport | null;
  draftReport: AiReport | null;
  pending: CaffeinePendingState;
  weeklyGeneration: WeeklyPlanGenerationState | null;
  weeklyPhaseGeneration: WeeklyPhaseGenerationState | null;
  weeklyPlanError: string | null;
  weeklyPhaseErrors: WeeklyPhaseErrors;
  onGenerate(kind: ReportKind): void;
  onNavigate(page: AppPage): void;
  onRefresh(): void;
  onLogin(): void;
  onClear(): void;
  onLogout(): void;
  onAiSettings(settings: AiSettings): void;
  onToggleDraftPin(playerId: string): void;
  onGenerateWeekly(mode: WeeklyPlanRequest["mode"]): void;
  onGenerateWeeklyPhase(
    phase: WeeklyBriefPhase,
    mode: WeeklyPhaseBriefRequest["mode"],
  ): void;
  onUpdateWeeklyAction(actionId: string, status: WeeklyActionStatus): void;
  onOpenAnalyst(): void;
}

export function PageRouter(props: PageRouterProps) {
  switch (props.page) {
    case "home":
      return (
        <FrontOffice
          dashboard={props.dashboard}
          teamReport={props.teamReport}
          tradeReport={props.tradeReport}
          draftReport={props.draftReport}
          leagueWeek={props.data.activeLeagueWeek}
          weeklyPlan={props.data.currentWeeklyPlan}
          weeklyActions={props.data.weeklyActions}
          weeklyGenerating={Boolean(props.pending.weeklyPlan)}
          codex={props.data.codex}
          generating={props.pending.report}
          onNavigate={props.onNavigate}
          onGenerate={props.onGenerate}
          onLogin={props.onLogin}
        />
      );
    case "roster":
      return <RosterPage dashboard={props.dashboard} />;
    case "analysis":
      return (
        <ReportPage
          kind="team_analysis"
          eyebrow="Full roster audit"
          title="Team analysis"
          description="A candid, league-aware audit backed by current Sleeper data and live player research."
          report={props.teamReport}
          {...reportActions(props)}
        />
      );
    case "trades":
      return (
        <ReportPage
          kind="trade_suggestions"
          eyebrow="Market intelligence"
          title="Trade lab"
          description="Realistic partners and offer frameworks based on every roster—not a generic trade chart."
          report={props.tradeReport}
          {...reportActions(props)}
        />
      );
    case "draft":
      return (
        <DraftPage
          dashboard={props.dashboard}
          report={props.draftReport}
          {...reportActions(props)}
          onRefresh={props.onRefresh}
          onTogglePin={props.onToggleDraftPin}
        />
      );
    case "weekly":
      return (
        <WeeklyPlanPage
          dashboard={props.dashboard}
          leagueWeek={props.data.activeLeagueWeek}
          plan={props.data.currentWeeklyPlan}
          actions={props.data.weeklyActions}
          briefs={props.data.currentWeeklyBriefs}
          codex={props.data.codex}
          generation={props.weeklyGeneration}
          phaseGeneration={props.weeklyPhaseGeneration}
          error={props.weeklyPlanError}
          phaseErrors={props.weeklyPhaseErrors}
          refreshing={props.pending.refresh}
          pendingActionId={props.pending.weeklyAction}
          onRefresh={props.onRefresh}
          onGenerate={props.onGenerateWeekly}
          onLogin={props.onLogin}
          onUpdateAction={props.onUpdateWeeklyAction}
          onGeneratePhase={props.onGenerateWeeklyPhase}
          onOpenDraft={() => props.onNavigate("draft")}
          onOpenTeamAnalysis={() => props.onNavigate("analysis")}
          onOpenTradeLab={() => props.onNavigate("trades")}
          onOpenLineup={() => props.onNavigate("roster")}
          onOpenAnalyst={props.onOpenAnalyst}
        />
      );
    case "settings":
      return (
        <SettingsPage
          data={props.data}
          onClear={props.onClear}
          onLogin={props.onLogin}
          onLogout={props.onLogout}
          onAiSettings={props.onAiSettings}
          pending={props.pending}
        />
      );
  }
}

function reportActions(props: PageRouterProps) {
  return {
    generating: props.pending.report,
    onGenerate: props.onGenerate,
    onLogin: props.onLogin,
    codex: props.data.codex,
  };
}
