import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  Bootstrap,
  CodexStatus,
  Dashboard,
} from "@sleeper-caffeine/ipc-contract";
import sleeperCaffeineMascot from "../assets/sleeper-caffeine-mascot.svg";
import {
  Avatar,
  Icon,
  IconButton,
  type IconName,
} from "../components/ui/index.js";
import styles from "./AppShell.module.css";

export type AppPage =
  | "home"
  | "roster"
  | "analysis"
  | "trades"
  | "draft"
  | "waivers"
  | "lineup"
  | "settings";

const NAV: Array<{
  page: AppPage;
  label: string;
  icon: IconName;
  badge?: string;
}> = [
  { page: "home", label: "Front office", icon: "grid" },
  { page: "roster", label: "Roster", icon: "users" },
  { page: "analysis", label: "Team analysis", icon: "pulse" },
  { page: "trades", label: "Trade lab", icon: "swap" },
  { page: "draft", label: "Draft room", icon: "target" },
  { page: "waivers", label: "Waiver wire", icon: "spark", badge: "W1" },
  { page: "lineup", label: "Start / sit", icon: "bolt", badge: "W1" },
];

export function AppShell({
  data,
  page,
  dashboard,
  error,
  refreshPending,
  children,
  onPage,
  onAddLeague,
  onSwitchLeague,
  onRefresh,
  onAnalyst,
  onLogin,
  onDismissError,
}: {
  data: Bootstrap;
  page: AppPage;
  dashboard: Dashboard | null;
  error: string | null;
  refreshPending: boolean;
  children: ReactNode;
  onPage(page: AppPage): void;
  onAddLeague(): void;
  onSwitchLeague(leagueId: string): void;
  onRefresh(): void;
  onAnalyst(): void;
  onLogin(): void;
  onDismissError(): void;
}) {
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const activeLeagueId = data.leagues.find((league) => league.isActive)?.leagueId;

  useEffect(() => {
    if (pageScrollRef.current) {
      pageScrollRef.current.scrollTop = 0;
    }
  }, [activeLeagueId, page]);

  return (
    <div
      className={styles.shell}
      data-platform={data.platform}
      data-testid="app-shell"
    >
      <aside className={styles.sidebar}>
        <div
          className={styles.trafficSpace}
          data-testid="traffic-space"
          aria-hidden="true"
        />
        <div className={styles.brand}>
          <img src={sleeperCaffeineMascot} alt="" aria-hidden="true" />
          <div>
            <strong>Sleeper</strong>
            <small>Caffeine</small>
          </div>
        </div>
        <LeagueSwitcher
          data={data}
          onSelect={onSwitchLeague}
          onAdd={onAddLeague}
        />
        <nav className={styles.navigation} aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? styles.navActive : styles.navItem}
              onClick={() => onPage(item.page)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge && <em>{item.badge}</em>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button
            className={page === "settings" ? styles.navActive : styles.navItem}
            onClick={() => onPage("settings")}
          >
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          <RuntimePill
            codex={data.codex}
            mcpState={data.mcp.state}
            onClick={() => data.codex.state === "signed_out" && onLogin()}
          />
        </div>
      </aside>

      <main className={styles.stage}>
        <TopBar
          dashboard={dashboard}
          platform={data.platform}
          busy={refreshPending}
          onRefresh={onRefresh}
          onAnalyst={onAnalyst}
        />
        {error && (
          <div className={styles.errorBanner} role="alert">
            <Icon name="alert" />
            <span>{error}</span>
            <IconButton label="Dismiss error" onClick={onDismissError}>
              <Icon name="close" />
            </IconButton>
          </div>
        )}
        <div
          ref={pageScrollRef}
          className={styles.pageScroll}
          data-testid="page-scroll"
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function LeagueSwitcher({
  data,
  onSelect,
  onAdd,
}: {
  data: Bootstrap;
  onSelect(id: string): void;
  onAdd(): void;
}) {
  const active = data.leagues.find((league) => league.isActive);
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.leagueSwitcher}>
      <button
        className={styles.leagueCurrent}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {active ? (
          <>
            <Avatar
              name={active.teamName}
              src={avatarUrl(active.avatar)}
              size="small"
            />
            <span className={styles.leagueCopy}>
              <strong>{active.teamName}</strong>
              <small>{active.name}</small>
            </span>
          </>
        ) : (
          <>
            <span className={styles.addAvatar}>+</span>
            <span className={styles.leagueCopy}>
              <strong>Add league</strong>
              <small>Sleeper</small>
            </span>
          </>
        )}
        <Icon name="chevron" />
      </button>
      {open && (
        <div className={styles.leagueMenu}>
          {data.leagues.map((league) => (
            <button
              key={league.leagueId}
              onClick={() => {
                onSelect(league.leagueId);
                setOpen(false);
              }}
            >
              <Avatar
                name={league.teamName}
                src={avatarUrl(league.avatar)}
                size="small"
              />
              <span className={styles.leagueCopy}>
                <strong>{league.teamName}</strong>
                <small>{league.name}</small>
              </span>
              {league.isActive && <i />}
            </button>
          ))}
          <button
            className={styles.addLeague}
            onClick={() => {
              onAdd();
              setOpen(false);
            }}
          >
            <span>+</span>Add another league
          </button>
        </div>
      )}
    </div>
  );
}

function avatarUrl(avatar: string | null): string | null {
  return avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : null;
}

function TopBar({
  dashboard,
  platform,
  busy,
  onRefresh,
  onAnalyst,
}: {
  dashboard: Dashboard | null;
  platform: Bootstrap["platform"];
  busy: boolean;
  onRefresh(): void;
  onAnalyst(): void;
}) {
  return (
    <header className={styles.topBar} aria-label="Application title bar">
      <div>
        {dashboard && (
          <>
            <span className={styles.season}>{dashboard.league.season}</span>
            <span className={styles.crumb}>{dashboard.league.name}</span>
          </>
        )}
      </div>
      <div className={styles.topActions}>
        {dashboard?.league.lastRefreshedAt && (
          <span className={styles.lastSync}>
            Synced {relativeTime(dashboard.league.lastRefreshedAt)}
          </span>
        )}
        <IconButton
          label="Refresh Sleeper"
          onClick={onRefresh}
          disabled={!dashboard || busy}
        >
          <Icon name="refresh" spin={busy} />
        </IconButton>
        <button
          className={styles.analystButton}
          onClick={onAnalyst}
          disabled={!dashboard}
        >
          <Icon name="spark" />
          <span>Ask analyst</span>
          <kbd>{platform === "darwin" ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      </div>
    </header>
  );
}

function RuntimePill({
  codex,
  mcpState,
  onClick,
}: {
  codex: CodexStatus;
  mcpState: string;
  onClick(): void;
}) {
  const ready = codex.state === "ready" || codex.state === "running";
  return (
    <button className={styles.runtime} onClick={onClick}>
      <i
        className={
          ready
            ? styles.runtimeOnline
            : codex.state === "error"
              ? styles.runtimeError
              : undefined
        }
      />
      <span>
        <strong>
          {ready
            ? "Analyst online"
            : codex.state === "signed_out"
              ? "Connect ChatGPT"
              : codex.state === "unavailable"
                ? "Codex missing"
                : "Analyst starting"}
        </strong>
        <small>MCP {mcpState}</small>
      </span>
    </button>
  );
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${String(Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3600))}h ago`;
  return `${String(Math.floor(seconds / 86_400))}d ago`;
}
