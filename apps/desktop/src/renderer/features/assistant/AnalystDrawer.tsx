import type {
  Bootstrap,
  CodexStatus,
  Dashboard,
} from "@sleeper-caffeine/ipc-contract";
import {
  CaffeineAssistant,
  type CaffeineChatRun,
} from "../../assistant/CaffeineAssistant.js";
import {
  Drawer,
  Icon,
  IconButton,
  StatusDot,
} from "../../components/ui/index.js";
import styles from "./AnalystDrawer.module.css";

export type { CaffeineChatRun } from "../../assistant/CaffeineAssistant.js";

export function AnalystDrawer({
  dashboard,
  status,
  messages,
  hasMore,
  activeRun,
  sendPending,
  onClose,
  onLogin,
  onSend,
}: {
  dashboard: Dashboard;
  status: CodexStatus;
  messages: Bootstrap["chatMessages"];
  hasMore: boolean;
  activeRun: CaffeineChatRun | null;
  sendPending: boolean;
  onClose(): void;
  onLogin(): void;
  onSend(message: string): Promise<void>;
}) {
  return (
    <Drawer
      open
      label="Caffeine Analyst"
      onClose={onClose}
      className={styles.drawer}
    >
      <header className={styles.header}>
        <div className={styles.avatar}>
          <Icon name="spark" />
          <StatusDot tone="live" />
        </div>
        <div className={styles.identity}>
          <strong>Caffeine Analyst</strong>
          <span>
            <StatusDot tone={sendPending ? "warning" : "live"} />
            {sendPending ? "Researching league context" : "Live league context"}
          </span>
        </div>
        <IconButton label="Close analyst" onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </header>
      <div className={styles.context}>
        <span>{dashboard.league.teamName}</span>
        <span>{dashboard.scoringLabel}</span>
        <span>Roster #{dashboard.league.rosterId}</span>
      </div>
      <CaffeineAssistant
        key={dashboard.league.leagueId}
        leagueId={dashboard.league.leagueId}
        persistedMessages={messages}
        initialHasMore={hasMore}
        activeRun={activeRun}
        codexStatus={status}
        sendPending={sendPending}
        onSend={onSend}
        onLogin={onLogin}
      />
    </Drawer>
  );
}
