import type {
  AiReport,
  AiSettings,
  Bootstrap,
  Dashboard,
  ReportKind,
} from "@sleeper-caffeine/ipc-contract";
import type { CaffeinePendingState } from "../api/use-caffeine-runtime.js";
import { DraftPage } from "../features/draft/DraftPage.js";
import { FrontOffice } from "../features/front-office/FrontOffice.js";
import { ReportPage } from "../features/reports/ReportPage.js";
import { RosterPage } from "../features/roster/RosterPage.js";
import { SettingsPage } from "../features/settings/SettingsPage.js";
import { ComingSoon } from "../features/weekly/ComingSoon.js";
import type { AppPage } from "./AppShell.js";

export interface PageRouterProps {
  page: AppPage;
  data: Bootstrap;
  dashboard: Dashboard;
  teamReport: AiReport | null;
  tradeReport: AiReport | null;
  draftReport: AiReport | null;
  pending: CaffeinePendingState;
  onGenerate(kind: ReportKind): void;
  onNavigate(page: AppPage): void;
  onRefresh(): void;
  onLogin(): void;
  onClear(): void;
  onLogout(): void;
  onAiSettings(settings: AiSettings): void;
  onToggleDraftPin(playerId: string): void;
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
    case "waivers":
      return <ComingSoon type="waivers" dashboard={props.dashboard} />;
    case "lineup":
      return <ComingSoon type="lineup" dashboard={props.dashboard} />;
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
