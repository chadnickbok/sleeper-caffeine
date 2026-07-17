import { useState } from "react";
import type {
  AiReport,
  CodexStatus,
  Dashboard,
  PlayerView,
  ReportKind,
} from "@sleeper-caffeine/ipc-contract";
import { REPORT_STALE_AFTER_MS } from "@sleeper-caffeine/ipc-contract";
import {
  Avatar,
  Icon,
  IconButton,
  Panel,
  type IconName,
} from "../../components/ui/index.js";
import type { AppPage } from "../../app/AppShell.js";
import styles from "./FrontOffice.module.css";

export function FrontOffice({
  dashboard,
  teamReport,
  tradeReport,
  draftReport,
  codex,
  generating,
  onNavigate,
  onGenerate,
  onLogin,
}: {
  dashboard: Dashboard;
  teamReport: AiReport | null;
  tradeReport: AiReport | null;
  draftReport: AiReport | null;
  codex: CodexStatus;
  generating: ReportKind | null;
  onNavigate(page: AppPage): void;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
}) {
  const liveDraftReport =
    draftReport?.draftPlan &&
    ["current", "advanced_valid", "fallback_active", "research_stale"].includes(
      draftReport.draftPlan.status,
    )
      ? draftReport
      : null;
  const record = dashboard.record;
  const roster = [
    ...dashboard.starters,
    ...dashboard.bench,
    ...dashboard.reserve,
    ...dashboard.taxi,
  ];
  const injuries = roster.filter((player) => player.injuryStatus).length;
  const recordLabel = `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroNoise} />
        <div className={styles.heroCopy}>
          <Eyebrow>
            {dashboard.league.season} campaign · {dashboard.scoringLabel}
          </Eyebrow>
          <h1>{dashboard.league.teamName}</h1>
          <p>
            {dashboard.leagueStatus === "pre_draft"
              ? "Set the foundation now. Your Sleeper roster, draft capital, and health flags are synced."
              : "Your campaign at a glance, synced directly from Sleeper."}
          </p>
          <div className={styles.metrics}>
            <Metric label="Record" value={recordLabel} />
            <Metric label="Points for" value={record.pointsFor.toFixed(1)} />
            <Metric label="Rostered" value={String(roster.length)} />
            <Metric
              label="Injury flags"
              value={String(injuries)}
              warn={injuries > 0}
            />
          </div>
        </div>
        <MatchupPreview dashboard={dashboard} record={recordLabel} />
      </section>

      <section className={styles.intelligence}>
        <SectionTitle
          eyebrow="Intelligence desk"
          title="Dive deeper into your league, roster, and draft position."
        />
        <div className={styles.reportGrid}>
          <ReportTeaser
            kind="team_analysis"
            title="Team pulse"
            icon="pulse"
            report={teamReport}
            fallback="Run the first audit to surface strengths, weak links, and roster dead weight."
            status={codex}
            running={generating === "team_analysis"}
            onOpen={() => onNavigate("analysis")}
            onGenerate={() => onGenerate("team_analysis")}
            onLogin={onLogin}
          />
          <ReportTeaser
            kind="trade_suggestions"
            title="Trade radar"
            icon="swap"
            report={tradeReport}
            fallback="Map the league and find partners whose needs line up with your excess."
            status={codex}
            running={generating === "trade_suggestions"}
            onOpen={() => onNavigate("trades")}
            onGenerate={() => onGenerate("trade_suggestions")}
            onLogin={onLogin}
          />
          <ReportTeaser
            kind="draft_candidates"
            title="Draft board"
            icon="target"
            report={liveDraftReport}
            fallback="Build a shortlist around roster shape, settings, picks, and current news."
            status={codex}
            running={generating === "draft_candidates"}
            onOpen={() => onNavigate("draft")}
            onGenerate={() => onGenerate("draft_candidates")}
            onLogin={onLogin}
          />
        </div>
      </section>

      <section className={styles.lowerGrid}>
        <Panel className={styles.depthPanel}>
          <SectionTitle
            eyebrow="Depth chart"
            title="Your starters"
            trailing={
              <span className={styles.count}>{dashboard.starters.length}</span>
            }
          />
          <div className={styles.rosterGrid}>
            {dashboard.starters.slice(0, 8).map((player) => (
              <PlayerRow
                key={`${player.playerId}-${player.rosterSlot ?? ""}`}
                player={player}
              />
            ))}
          </div>
        </Panel>
        <Panel className={styles.draftPanel}>
          <SectionTitle
            eyebrow="Draft control"
            title={
              dashboard.draft
                ? draftTitle(dashboard.draft.status)
                : "No active draft"
            }
          />
          {dashboard.draft ? (
            <>
              <div className={styles.draftOrbit}>
                <strong>{dashboard.draft.picks.length}</strong>
                <span>picks made</span>
              </div>
              <p>
                {dashboard.draft.myUpcomingPickNumbers.length
                  ? `Your next scheduled pick: #${String(dashboard.draft.myUpcomingPickNumbers[0])}`
                  : "Your upcoming slot will appear as the board develops."}
              </p>
            </>
          ) : (
            <p>Sleeper has not attached a draft to this league yet.</p>
          )}
        </Panel>
      </section>
    </div>
  );
}

function ReportTeaser({
  kind,
  title,
  icon,
  report,
  fallback,
  status,
  running,
  onOpen,
  onGenerate,
  onLogin,
}: {
  kind: ReportKind;
  title: string;
  icon: IconName;
  report: AiReport | null;
  fallback: string;
  status: CodexStatus;
  running: boolean;
  onOpen(): void;
  onGenerate(): void;
  onLogin(): void;
}) {
  const canAct = status.state === "ready" || status.state === "signed_out";
  const headline =
    report?.microSummary?.headline ??
    report?.payload.headline ??
    "Not generated yet";
  const summary =
    report?.microSummary?.summary ?? report?.payload.summary ?? fallback;
  const stale = report ? isStaleReport(report) : false;
  const freshness = report
    ? `${stale ? "Stale · " : ""}Updated ${relativeTime(report.generatedAt)}`
    : "Not generated";
  const generate = () =>
    status.state === "signed_out" ? onLogin() : onGenerate();

  return (
    <article className={styles.reportCard} data-report-kind={kind}>
      <div className={styles.reportIcon}>
        <Icon name={icon} />
      </div>
      <div className={styles.reportContent}>
        <div>
          <div className={styles.reportMeta}>
            <span>{title}</span>
            <i />
            <small className={stale ? styles.stale : undefined}>
              {freshness}
            </small>
          </div>
          <h3>{headline}</h3>
          <p>{summary}</p>
        </div>
        {report ? (
          <button className={styles.textAction} onClick={onOpen}>
            Read analysis <Icon name="arrow" />
          </button>
        ) : (
          <button
            className={styles.textAction}
            disabled={running || !canAct}
            onClick={generate}
          >
            {running
              ? "Building analysis…"
              : status.state === "signed_out"
                ? "Connect to generate"
                : "Generate analysis"}
            <Icon name="arrow" />
          </button>
        )}
      </div>
      {report && (
        <IconButton
          className={styles.refresh}
          label={`Refresh ${title}`}
          disabled={running || !canAct}
          onClick={generate}
        >
          <Icon name="refresh" spin={running} />
        </IconButton>
      )}
    </article>
  );
}

function SectionTitle({
  eyebrow,
  title,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className={styles.sectionTitle}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2>{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className={styles.eyebrow}>{children}</span>;
}

function Metric({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? styles.metricWarning : styles.metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PlayerRow({ player }: { player: PlayerView }) {
  return (
    <div className={styles.playerRow}>
      <PlayerPhoto player={player} />
      <span className={styles.slot}>
        {player.rosterSlot ?? player.position}
      </span>
      <span className={styles.playerCopy}>
        <strong>{player.name}</strong>
        <small>
          {player.nflTeam ?? "FA"}
          {player.injuryStatus ? ` · ${player.injuryStatus}` : ""}
        </small>
      </span>
    </div>
  );
}

function PlayerPhoto({ player }: { player: PlayerView }) {
  const [failed, setFailed] = useState(false);
  if (failed || player.playerId === "0")
    return (
      <span className={styles.playerFallback}>{initials(player.name)}</span>
    );
  return (
    <span className={styles.playerPhoto}>
      <img
        src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
        alt=""
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function MatchupPreview({
  dashboard,
  record,
}: {
  dashboard: Dashboard;
  record: string;
}) {
  const matchup = dashboard.nextMatchup ?? null;
  const week = matchup?.week ?? Math.max(dashboard.week, 1);
  const hasScore = Boolean(
    matchup &&
    ((matchup.myPoints ?? 0) > 0 || (matchup.opponent.points ?? 0) > 0),
  );
  return (
    <aside className={styles.matchup}>
      <div className={styles.matchupHeading}>
        <Eyebrow>Next matchup</Eyebrow>
        <span>Week {week}</span>
      </div>
      <div className={styles.matchupTeams}>
        <div className={styles.matchupTeam}>
          <Avatar
            name={dashboard.league.teamName}
            src={avatarUrl(dashboard.league.avatar)}
          />
          <span>
            <strong>{dashboard.league.teamName}</strong>
            <small>
              {hasScore ? matchup?.myPoints?.toFixed(1) : `${record} · You`}
            </small>
          </span>
        </div>
        <b>VS</b>
        {matchup ? (
          <div className={`${styles.matchupTeam} ${styles.opponent}`}>
            <span>
              <strong>{matchup.opponent.teamName}</strong>
              <small>
                {hasScore
                  ? matchup.opponent.points?.toFixed(1)
                  : matchup.opponent.record}
              </small>
            </span>
            <Avatar
              name={matchup.opponent.teamName}
              src={avatarUrl(matchup.opponent.avatar)}
            />
          </div>
        ) : (
          <div className={`${styles.matchupTeam} ${styles.opponent}`}>
            <span>
              <strong>Schedule pending</strong>
              <small>Opponent TBD</small>
            </span>
            <Avatar name="?" />
          </div>
        )}
      </div>
      <div className={styles.matchupFooter}>
        <span>
          {matchup
            ? hasScore
              ? "Live score synced from Sleeper"
              : "Matchup analysis arrives when weekly data is live"
            : "Refresh after Sleeper publishes the schedule"}
        </span>
        <em>{matchup ? (hasScore ? "Live" : "Preview") : "Waiting"}</em>
      </div>
    </aside>
  );
}

function avatarUrl(value: string | null): string | null {
  return value ? `https://sleepercdn.com/avatars/thumbs/${value}` : null;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${String(Math.floor(seconds / 60))}m ago`;
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3600))}h ago`;
  return `${String(Math.floor(seconds / 86_400))}d ago`;
}

function isStaleReport(report: AiReport): boolean {
  return (
    report.invalidated ||
    Date.now() - Date.parse(report.generatedAt) > REPORT_STALE_AFTER_MS
  );
}

function draftTitle(status: string): string {
  if (status === "live") return "Draft in progress";
  if (status === "complete") return "Complete draft";
  return "Upcoming draft";
}
