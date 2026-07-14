import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  AiReport,
  AiSettings,
  Bootstrap,
  ChatMessage,
  CodexStatus,
  CodexModel,
  Dashboard,
  LeaguePreview,
  PlayerView,
  ReportKind,
  RuntimeEvent,
} from "@sleeper-caffeine/ipc-contract";
import sleeperCaffeineBadge from "./assets/sleeper-caffeine-badge.svg";
import sleeperCaffeineMascot from "./assets/sleeper-caffeine-mascot.svg";

type Page =
  | "home"
  | "roster"
  | "analysis"
  | "trades"
  | "draft"
  | "waivers"
  | "lineup"
  | "settings";

const NAV: Array<{ page: Page; label: string; icon: string; badge?: string }> =
  [
    { page: "home", label: "Front office", icon: "grid" },
    { page: "roster", label: "Roster", icon: "users" },
    { page: "analysis", label: "Team analysis", icon: "pulse" },
    { page: "trades", label: "Trade lab", icon: "swap" },
    { page: "draft", label: "Draft room", icon: "target" },
    { page: "waivers", label: "Waiver wire", icon: "spark", badge: "W1" },
    { page: "lineup", label: "Start / sit", icon: "bolt", badge: "W1" },
  ];

const FALLBACK_CODEX_MODELS: CodexModel[] = [
  {
    model: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    description: "Balanced everyday analysis with strong tool use.",
    isDefault: false,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      {
        effort: "medium",
        description: "Balances speed and reasoning depth for everyday tasks",
      },
      {
        effort: "high",
        description: "Greater reasoning depth for complex decisions",
      },
    ],
  },
  {
    model: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    description: "Deeper analysis and polish for difficult questions.",
    isDefault: true,
    defaultReasoningEffort: "low",
    supportedReasoningEfforts: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      {
        effort: "medium",
        description: "Balances speed and reasoning depth for everyday tasks",
      },
      {
        effort: "high",
        description: "Greater reasoning depth for complex decisions",
      },
    ],
  },
  {
    model: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    description: "Fast, efficient responses for clear and repeatable tasks.",
    isDefault: false,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      {
        effort: "medium",
        description: "Balances speed and reasoning depth for everyday tasks",
      },
      {
        effort: "high",
        description: "Greater reasoning depth for complex decisions",
      },
    ],
  },
];

export function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [onboarding, setOnboarding] = useState(false);
  const [analystOpen, setAnalystOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportDelta, setReportDelta] = useState("");
  const [chatDelta, setChatDelta] = useState("");

  const reload = useCallback(async () => {
    try {
      const next = await window.sleeperCaffeine.bootstrap();
      setData(next);
      if (!next.activeDashboard) setOnboarding(true);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void reload();
    return window.sleeperCaffeine.onRuntimeEvent((event: RuntimeEvent) => {
      if (event.type === "bootstrap_changed") void reload();
      if (event.type === "codex_status")
        setData((current) =>
          current ? { ...current, codex: event.status } : current,
        );
      if (event.type === "mcp_status")
        setData((current) =>
          current ? { ...current, mcp: event.status } : current,
        );
      if (event.type === "report_delta")
        setReportDelta((current) => current + event.text);
      if (event.type === "chat_delta")
        setChatDelta((current) => current + event.text);
    });
  }, [reload]);

  const active = data?.activeDashboard ?? null;
  const report = (kind: ReportKind) =>
    data?.reports.find((candidate) => candidate.kind === kind) ?? null;

  async function act(key: string, operation: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await operation();
      await reload();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function generate(kind: ReportKind) {
    setReportDelta("");
    await act(`report:${kind}`, () =>
      window.sleeperCaffeine.generateReport(kind),
    );
  }

  if (!data) return <LaunchScreen error={error} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="traffic-space" />
        <div className="brand">
          <img
            className="brand-mascot"
            src={sleeperCaffeineMascot}
            alt=""
            aria-hidden="true"
          />
          <div>
            <strong>Sleeper</strong>
            <small>Caffeine</small>
          </div>
        </div>
        <LeagueSwitcher
          data={data}
          onSelect={(leagueId) =>
            void act("switch", () =>
              window.sleeperCaffeine.setActiveLeague(leagueId),
            )
          }
          onAdd={() => setOnboarding(true)}
        />
        <nav className="nav-list">
          {NAV.map((item) => (
            <button
              key={item.page}
              className={page === item.page ? "nav-item active" : "nav-item"}
              onClick={() => setPage(item.page)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge && <em>{item.badge}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" onClick={() => setPage("settings")}>
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          <RuntimePill
            codex={data.codex}
            mcpState={data.mcp.state}
            onClick={() =>
              data.codex.state === "signed_out" &&
              void act("login", () => window.sleeperCaffeine.loginCodex())
            }
          />
        </div>
      </aside>

      <main className="main-stage">
        <TopBar
          dashboard={active}
          busy={busy === "refresh"}
          onRefresh={() =>
            void act("refresh", () =>
              window.sleeperCaffeine.refreshActiveLeague(),
            )
          }
          onAnalyst={() => setAnalystOpen(true)}
        />
        {error && (
          <div className="error-banner">
            <Icon name="alert" />
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        <div className="page-scroll">
          {!active ? (
            <EmptyLeague onAdd={() => setOnboarding(true)} />
          ) : (
            <PageContent
              page={page}
              data={data}
              dashboard={active}
              teamReport={report("team_analysis")}
              tradeReport={report("trade_suggestions")}
              draftReport={report("draft_candidates")}
              busy={busy}
              reportDelta={reportDelta}
              onGenerate={(kind) => void generate(kind)}
              onNavigate={setPage}
              onRefresh={() =>
                void act("refresh", () =>
                  window.sleeperCaffeine.refreshActiveLeague(),
                )
              }
              onLogin={() =>
                void act("login", () => window.sleeperCaffeine.loginCodex())
              }
              onClear={() =>
                void act("clear", () => window.sleeperCaffeine.clearLocalData())
              }
              onLogout={() =>
                void act("logout", () => window.sleeperCaffeine.logoutCodex())
              }
              onAiSettings={(settings) =>
                void act("ai-settings", () =>
                  window.sleeperCaffeine.updateAiSettings(settings),
                )
              }
            />
          )}
        </div>
      </main>

      {onboarding && (
        <Onboarding
          {...(active ? { onClose: () => setOnboarding(false) } : {})}
          onSaved={(next) => {
            setData(next);
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
          delta={chatDelta}
          busy={busy === "chat"}
          onClose={() => setAnalystOpen(false)}
          onLogin={() =>
            void act("login", () => window.sleeperCaffeine.loginCodex())
          }
          onSend={async (message) => {
            setChatDelta("");
            await act("chat", () => window.sleeperCaffeine.sendChat(message));
          }}
        />
      )}
    </div>
  );
}

function PageContent(props: {
  page: Page;
  data: Bootstrap;
  dashboard: Dashboard;
  teamReport: AiReport | null;
  tradeReport: AiReport | null;
  draftReport: AiReport | null;
  busy: string | null;
  reportDelta: string;
  onGenerate(kind: ReportKind): void;
  onNavigate(page: Page): void;
  onRefresh(): void;
  onLogin(): void;
  onClear(): void;
  onLogout(): void;
  onAiSettings(settings: AiSettings): void;
}) {
  if (props.page === "home")
    return (
      <Home
        dashboard={props.dashboard}
        teamReport={props.teamReport}
        tradeReport={props.tradeReport}
        draftReport={props.draftReport}
        codex={props.data.codex}
        busy={props.busy}
        onNavigate={props.onNavigate}
        onGenerate={props.onGenerate}
        onLogin={props.onLogin}
      />
    );
  if (props.page === "roster")
    return <RosterPage dashboard={props.dashboard} />;
  if (props.page === "analysis")
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
  if (props.page === "trades")
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
  if (props.page === "draft")
    return (
      <DraftPage
        dashboard={props.dashboard}
        report={props.draftReport}
        {...reportActions(props)}
        onRefresh={props.onRefresh}
      />
    );
  if (props.page === "waivers")
    return <ComingSoon type="waivers" dashboard={props.dashboard} />;
  if (props.page === "lineup")
    return <ComingSoon type="lineup" dashboard={props.dashboard} />;
  return (
    <SettingsPage
      data={props.data}
      onClear={props.onClear}
      onLogin={props.onLogin}
      onLogout={props.onLogout}
      onAiSettings={props.onAiSettings}
      busy={props.busy}
    />
  );
}

function reportActions(props: {
  busy: string | null;
  reportDelta: string;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  data: Bootstrap;
}) {
  return {
    busy: props.busy,
    delta: props.reportDelta,
    onGenerate: props.onGenerate,
    onLogin: props.onLogin,
    codex: props.data.codex,
  };
}

function Home({
  dashboard,
  teamReport,
  tradeReport,
  draftReport,
  codex,
  busy,
  onNavigate,
  onGenerate,
  onLogin,
}: {
  dashboard: Dashboard;
  teamReport: AiReport | null;
  tradeReport: AiReport | null;
  draftReport: AiReport | null;
  codex: CodexStatus;
  busy: string | null;
  onNavigate(page: Page): void;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
}) {
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
    <div className="page home-page">
      <section className="hero-card">
        <div className="hero-noise" />
        <div className="hero-copy">
          <span className="eyebrow">
            {dashboard.league.season} campaign · {dashboard.scoringLabel}
          </span>
          <h1>{dashboard.league.teamName}</h1>
          <p>
            {dashboard.leagueStatus === "pre_draft"
              ? "Set the foundation now. Your Sleeper roster, draft capital, and health flags are synced."
              : "Your campaign at a glance, synced directly from Sleeper."}
          </p>
          <div className="hero-stats">
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

      <section className="section-block">
        <SectionTitle
          eyebrow="Intelligence desk"
          title="Dive deeper into your league, roster, and draft position."
        />
        <div className="intelligence-grid">
          <ReportTeaser
            kind="team_analysis"
            title="Team pulse"
            icon="pulse"
            report={teamReport}
            fallback="Run the first audit to surface strengths, weak links, and roster dead weight."
            status={codex}
            running={busy === "report:team_analysis"}
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
            running={busy === "report:trade_suggestions"}
            onOpen={() => onNavigate("trades")}
            onGenerate={() => onGenerate("trade_suggestions")}
            onLogin={onLogin}
          />
          <ReportTeaser
            kind="draft_candidates"
            title="Draft board"
            icon="target"
            report={draftReport}
            fallback="Build a shortlist around roster shape, settings, picks, and current news."
            status={codex}
            running={busy === "report:draft_candidates"}
            onOpen={() => onNavigate("draft")}
            onGenerate={() => onGenerate("draft_candidates")}
            onLogin={onLogin}
          />
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <SectionTitle
            eyebrow="Depth chart"
            title="Your starters"
            trailing={
              <span className="count-pill">{dashboard.starters.length}</span>
            }
          />
          <div className="mini-roster">
            {dashboard.starters.slice(0, 8).map((player) => (
              <PlayerRow
                key={`${player.playerId}-${player.rosterSlot ?? ""}`}
                player={player}
                compact
              />
            ))}
          </div>
        </div>
        <div className="panel draft-peek">
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
              <div className="draft-orbit">
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
        </div>
      </section>
    </div>
  );
}

function RosterPage({ dashboard }: { dashboard: Dashboard }) {
  const sections = [
    ["Starting lineup", dashboard.starters],
    ["Bench", dashboard.bench],
    ["Injured reserve", dashboard.reserve],
    ["Taxi squad", dashboard.taxi],
  ] as const;
  return (
    <div className="page">
      <PageHeading
        eyebrow="Personnel"
        title="Roster room"
        description={`${dashboard.rosterPositions.join(" · ")} · ${dashboard.scoringLabel}`}
      />
      {sections.map(
        ([title, players]) =>
          players.length > 0 && (
            <section className="roster-section" key={title}>
              <SectionTitle
                title={title}
                trailing={<span className="count-pill">{players.length}</span>}
              />
              <div className="player-grid">
                {players.map((player, index) => (
                  <PlayerCard
                    player={player}
                    key={`${player.playerId}-${String(index)}`}
                  />
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}

function ReportPage({
  kind,
  eyebrow,
  title,
  description,
  report,
  busy,
  delta,
  onGenerate,
  onLogin,
  codex,
}: {
  kind: ReportKind;
  eyebrow: string;
  title: string;
  description: string;
  report: AiReport | null;
  busy: string | null;
  delta: string;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  codex: CodexStatus;
}) {
  const running = busy === `report:${kind}`;
  return (
    <div className="page">
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <AiAction
            status={codex}
            running={running}
            hasReport={Boolean(report)}
            onGenerate={() => onGenerate(kind)}
            onLogin={onLogin}
          />
        }
      />
      {running ? (
        <GeneratingState title="Researching your league" delta={delta} />
      ) : report ? (
        <ReportView report={report} />
      ) : (
        <ReportEmpty kind={kind} />
      )}
    </div>
  );
}

function DraftPage({
  dashboard,
  report,
  busy,
  delta,
  onGenerate,
  onLogin,
  codex,
  onRefresh,
}: {
  dashboard: Dashboard;
  report: AiReport | null;
  busy: string | null;
  delta: string;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  codex: CodexStatus;
  onRefresh(): void;
}) {
  const running = busy === "report:draft_candidates";
  return (
    <div className="page">
      <PageHeading
        eyebrow="Live room"
        title="Draft command"
        description="The Sleeper board is deterministic. Candidate intelligence is generated separately, on demand."
        action={
          <div className="action-row">
            <button className="button ghost" onClick={onRefresh}>
              <Icon name="refresh" />
              Refresh board
            </button>
            <AiAction
              status={codex}
              running={running}
              hasReport={Boolean(report)}
              onGenerate={() => onGenerate("draft_candidates")}
              onLogin={onLogin}
            />
          </div>
        }
      />
      <DraftBoard dashboard={dashboard} />
      <section className="section-block draft-report">
        <SectionTitle eyebrow="Scouting desk" title="Candidate board" />
        {running ? (
          <GeneratingState title="Building the candidate board" delta={delta} />
        ) : report ? (
          <ReportView report={report} />
        ) : (
          <ReportEmpty kind="draft_candidates" />
        )}
      </section>
    </div>
  );
}

function DraftBoard({ dashboard }: { dashboard: Dashboard }) {
  const draft = dashboard.draft;
  if (!draft)
    return (
      <div className="panel empty-panel">
        <Icon name="target" />
        <h3>No draft attached yet</h3>
        <p>
          Once Sleeper creates the draft, its live picks and your upcoming slots
          will land here.
        </p>
      </div>
    );
  return (
    <section className="draft-board panel">
      <div className="draft-board-head">
        <div>
          <span className="live-dot" />
          {capitalize(draft.status)} · {capitalize(draft.type)}
        </div>
        <span>
          {draft.rounds ?? "—"} rounds · {draft.teams ?? "—"} teams
        </span>
      </div>
      <div className="upcoming-strip">
        <span>Your upcoming picks</span>
        {draft.myUpcomingPickNumbers.length ? (
          draft.myUpcomingPickNumbers
            .slice(0, 6)
            .map((pick) => <strong key={pick}>#{pick}</strong>)
        ) : (
          <em>Waiting for draft order</em>
        )}
      </div>
      <div className="pick-grid">
        {draft.picks.length ? (
          draft.picks.slice(-18).map((pick) => (
            <div
              className={
                pick.rosterId === dashboard.league.rosterId
                  ? "pick-card mine"
                  : "pick-card"
              }
              key={pick.pickNo}
            >
              <span>#{pick.pickNo}</span>
              <strong>{pick.player?.name ?? "Unknown player"}</strong>
              <small>
                {pick.player?.position ?? "—"} · R{pick.round}
              </small>
            </div>
          ))
        ) : (
          <div className="board-empty">
            The clock has not started. Refresh after the first pick lands.
          </div>
        )}
      </div>
    </section>
  );
}

function ReportView({ report }: { report: AiReport }) {
  return (
    <div className="report-view">
      {report.invalidated && (
        <div className="stale-banner">
          <Icon name="refresh" />
          <div>
            <strong>Sleeper data changed</strong>
            <span>
              This report is preserved for history, but regenerate it before
              acting.
            </span>
          </div>
        </div>
      )}
      <section className="report-lead panel">
        <div className={`confidence ${report.payload.confidence}`}>
          {report.payload.confidence} confidence
        </div>
        <h2>{report.payload.headline}</h2>
        <p>{report.payload.summary}</p>
        <small>
          Generated {formatDate(report.generatedAt)} · snapshot{" "}
          {formatDate(report.snapshotAt)}
        </small>
      </section>
      <div className="report-card-grid">
        {report.payload.cards.map((card, index) => (
          <article
            className={`report-card ${card.tone}`}
            key={`${card.title}-${String(index)}`}
          >
            <span className="report-index">0{index + 1}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {card.bullets.length > 0 && (
              <ul>
                {card.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      <section className="panel action-plan">
        <SectionTitle eyebrow="Decision queue" title="Recommended actions" />
        {report.payload.actions.map((action) => (
          <div className="action-item" key={action.title}>
            <span className={`priority ${action.priority}`}>
              {action.priority}
            </span>
            <div>
              <strong>{action.title}</strong>
              <p>{action.description}</p>
            </div>
          </div>
        ))}
      </section>
      <section className="source-panel panel">
        <SectionTitle eyebrow="Evidence" title="Sources used" />
        {report.payload.sources.map((source, index) => (
          <button
            className="source-row"
            key={`${source.title}-${String(index)}`}
            onClick={() =>
              source.url && void window.sleeperCaffeine.openExternal(source.url)
            }
            disabled={!source.url}
          >
            <span className={`source-type ${source.sourceType}`}>
              {source.sourceType}
            </span>
            <div>
              <strong>{source.title}</strong>
              <p>{source.claim}</p>
            </div>
            {source.url && <Icon name="external" />}
          </button>
        ))}
        {report.payload.caveats.length > 0 && (
          <div className="caveats">
            <strong>Watch list</strong>
            {report.payload.caveats.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AiAction({
  status,
  running,
  hasReport,
  onGenerate,
  onLogin,
}: {
  status: CodexStatus;
  running: boolean;
  hasReport: boolean;
  onGenerate(): void;
  onLogin(): void;
}) {
  if (status.state === "signed_out")
    return (
      <button className="button primary" onClick={onLogin}>
        <Icon name="spark" />
        Connect ChatGPT
      </button>
    );
  if (status.state === "unavailable")
    return (
      <button className="button disabled" disabled>
        Codex not installed
      </button>
    );
  return (
    <button
      className="button primary"
      onClick={onGenerate}
      disabled={running || status.state !== "ready"}
    >
      {running ? <Spinner /> : <Icon name="spark" />}
      {running ? "Researching…" : hasReport ? "Regenerate" : "Generate report"}
    </button>
  );
}

function GeneratingState({ title, delta }: { title: string; delta: string }) {
  return (
    <div className="generating panel">
      <div className="radar">
        <span />
        <span />
        <i />
      </div>
      <div>
        <span className="eyebrow">Codex is working</span>
        <h2>{title}</h2>
        <p>
          Reading Sleeper data, searching the live web, and separating discovery
          from sourced evidence.
        </p>
        {delta && <code>{delta.slice(-220)}</code>}
      </div>
    </div>
  );
}

function ReportEmpty({ kind }: { kind: ReportKind }) {
  const copy = {
    team_analysis: [
      "Know exactly what you have",
      "Strengths, weak links, dead weight, pick context, and uncomfortable truths.",
    ],
    trade_suggestions: [
      "Find the actual market",
      "Every roster matters. Your league's needs matter. Generic calculators do not know either.",
    ],
    draft_candidates: [
      "Build your short list",
      "Targets shaped by this roster, this scoring system, and the board as it stands.",
    ],
  }[kind];
  return (
    <div className="report-empty panel">
      <div className="empty-glyph">
        <Icon
          name={
            kind === "trade_suggestions"
              ? "swap"
              : kind === "draft_candidates"
                ? "target"
                : "pulse"
          }
        />
      </div>
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      <small>No AI turn has been spent yet.</small>
    </div>
  );
}

function ComingSoon({
  type,
  dashboard,
}: {
  type: "waivers" | "lineup";
  dashboard: Dashboard;
}) {
  const waiver = type === "waivers";
  return (
    <div className="page coming-page">
      <span className="eyebrow">Arriving after Week 1</span>
      <h1>
        {waiver
          ? "Waiver signal, without the noise."
          : "Start the right players for this league."}
      </h1>
      <p>
        {waiver
          ? "Sleeper availability, role changes, roster fit, and evidence-backed FAAB thinking need real weekly data. We’ll switch this on when the signal is honest."
          : "Scoring, flex rules, current injuries, weather, usage and matchup context—joined only when games give us something real to reason about."}
      </p>
      <div className="coming-visual">
        <div className="scan-line" />
        <Icon name={waiver ? "spark" : "bolt"} />
        <strong>{dashboard.league.teamName}</strong>
        <span>Week {dashboard.week} · standing by</span>
      </div>
    </div>
  );
}

function SettingsPage({
  data,
  onClear,
  onLogin,
  onLogout,
  onAiSettings,
  busy,
}: {
  data: Bootstrap;
  onClear(): void;
  onLogin(): void;
  onLogout(): void;
  onAiSettings(settings: AiSettings): void;
  busy: string | null;
}) {
  const [danger, setDanger] = useState(false);
  const availableModels = data.codex.availableModels.length
    ? data.codex.availableModels
    : FALLBACK_CODEX_MODELS;
  const selectedModel =
    availableModels.find((model) => model.model === data.aiSettings.model) ??
    availableModels[0];
  const reasoningOptions = (
    selectedModel?.supportedReasoningEfforts ?? [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      {
        effort: "medium",
        description: "Balances speed and reasoning depth",
      },
      { effort: "high", description: "Greater depth for complex analysis" },
    ]
  ).filter((option) => ["low", "medium", "high"].includes(option.effort));
  const selectedEffort =
    reasoningOptions.find(
      (effort) => effort.effort === data.aiSettings.effort,
    ) ?? reasoningOptions[0];
  return (
    <div className="page settings-page">
      <PageHeading
        eyebrow="Control room"
        title="Settings"
        description="Local data, model access, and the services running behind Sleeper Caffeine."
      />
      <section className="settings-group panel">
        <SectionTitle title="Codex runtime" />
        <SettingRow
          title="Installed Codex"
          detail={data.codex.version ?? "Not detected"}
          status={data.codex.state}
        />
        <SettingRow
          title="Analyst model"
          detail={
            selectedModel?.description ??
            "Choose which Codex model handles fantasy analysis."
          }
          status="active"
          action={
            <select
              className="settings-select"
              value={data.aiSettings.model}
              disabled={busy === "ai-settings"}
              onChange={(event) => {
                const model = availableModels.find(
                  (candidate) => candidate.model === event.target.value,
                );
                if (!model) return;
                const effort = model.supportedReasoningEfforts.some(
                  (candidate) => candidate.effort === data.aiSettings.effort,
                )
                  ? data.aiSettings.effort
                  : model.defaultReasoningEffort;
                onAiSettings({ model: model.model, effort });
              }}
            >
              {availableModels.map((model) => (
                <option key={model.model} value={model.model}>
                  {model.displayName}
                </option>
              ))}
            </select>
          }
        />
        <SettingRow
          title="Reasoning effort"
          detail={
            selectedEffort?.description ??
            "Higher effort improves depth but takes longer."
          }
          status="active"
          action={
            <select
              className="settings-select effort"
              value={data.aiSettings.effort}
              disabled={busy === "ai-settings"}
              onChange={(event) =>
                onAiSettings({
                  model: data.aiSettings.model,
                  effort: event.target.value,
                })
              }
            >
              {reasoningOptions.map((effort) => (
                <option key={effort.effort} value={effort.effort}>
                  {reasoningLabel(effort.effort)}
                </option>
              ))}
            </select>
          }
        />
        <SettingRow
          title="ChatGPT account"
          detail={data.codex.email ?? "Not signed in"}
          status={data.codex.email ? "connected" : "disconnected"}
          action={
            data.codex.email ? (
              <button className="text-button" onClick={onLogout}>
                Sign out
              </button>
            ) : (
              <button className="text-button" onClick={onLogin}>
                Sign in
              </button>
            )
          }
        />
        <SettingRow
          title="Safety profile"
          detail="Read-only sandbox · shell disabled · live web enabled"
          status="locked"
        />
      </section>
      <section className="settings-group panel">
        <SectionTitle title="Local Sleeper MCP" />
        <SettingRow
          title="Service"
          detail={data.mcp.endpoint}
          status={data.mcp.state}
        />
        <SettingRow
          title="Connected sessions"
          detail={String(data.mcp.connectedSessions)}
          status={data.mcp.connectedSessions ? "active" : "idle"}
        />
      </section>
      <section className="settings-group panel">
        <SectionTitle title="Storage" />
        <SettingRow
          title="Retention"
          detail="League snapshots, reports, and recommendation history are kept indefinitely."
          status="local"
        />
        {!danger ? (
          <button className="danger-link" onClick={() => setDanger(true)}>
            Clear local league data…
          </button>
        ) : (
          <div className="danger-zone">
            <div>
              <strong>Clear every local league and report?</strong>
              <p>Your isolated ChatGPT login is not removed.</p>
            </div>
            <button
              className="button danger"
              onClick={onClear}
              disabled={busy === "clear"}
            >
              {busy === "clear" ? "Clearing…" : "Clear everything"}
            </button>
            <button className="button ghost" onClick={() => setDanger(false)}>
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Onboarding({
  onClose,
  onSaved,
}: {
  onClose?: () => void;
  onSaved(data: Bootstrap): void;
}) {
  const [step, setStep] = useState<"url" | "team">("url");
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const found = await window.sleeperCaffeine.previewLeague(input);
      setPreview(found);
      setStep("team");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const team = preview?.teams.find(
      (candidate) => candidate.rosterId === selected,
    );
    if (!preview || !team) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await window.sleeperCaffeine.saveLeague({
          leagueId: preview.leagueId,
          rosterId: team.rosterId,
          userId: team.userId,
        }),
      );
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <div className="onboarding-modal">
        {onClose && (
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        )}
        <div className="onboarding-art">
          <img
            className="brand-mark giant"
            src={sleeperCaffeineBadge}
            alt="Sleeper Caffeine"
          />
          <div className="onboarding-copy">
            <span className="eyebrow">League onboarding</span>
            <h2>
              Wake up your team.
              <br />
              With Caffeine.
            </h2>
            <p>
              Use your Codex subscription and Sleeper’s public API to unlock
              league-specific insights and make sharper roster decisions.
            </p>
          </div>
        </div>
        <div className="onboarding-form">
          <div className="step-count">
            <span className={step === "url" ? "active" : "done"}>1</span>
            <i />
            <span className={step === "team" ? "active" : ""}>2</span>
          </div>
          {step === "url" ? (
            <form onSubmit={(event) => void lookup(event)}>
              <span className="eyebrow">Step one</span>
              <h3>Connect a league</h3>
              <p>Paste the league URL from Sleeper. Numeric IDs work too.</p>
              <label>
                League URL
                <input
                  autoFocus
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://sleeper.com/leagues/…"
                />
              </label>
              {error && <span className="form-error">{error}</span>}
              <button
                className="button primary wide"
                disabled={busy || !input.trim()}
              >
                {busy ? <Spinner /> : <Icon name="arrow" />}
                {busy ? "Finding league…" : "Find league"}
              </button>
            </form>
          ) : (
            preview && (
              <div>
                <span className="eyebrow">Step two</span>
                <h3>Which team is yours?</h3>
                <p>
                  <strong>{preview.name}</strong> · {preview.season} ·{" "}
                  {preview.teams.length} teams
                </p>
                <div className="team-picker">
                  {preview.teams.map((team) => (
                    <button
                      key={team.rosterId}
                      className={
                        selected === team.rosterId
                          ? "team-choice selected"
                          : "team-choice"
                      }
                      onClick={() => setSelected(team.rosterId)}
                    >
                      <Avatar name={team.teamName} avatar={team.avatar} />
                      <div>
                        <strong>{team.teamName}</strong>
                        <span>
                          {team.displayName} · {team.record}
                        </span>
                      </div>
                      <i />
                    </button>
                  ))}
                </div>
                {error && <span className="form-error">{error}</span>}
                <div className="form-actions">
                  <button
                    className="button ghost"
                    onClick={() => setStep("url")}
                  >
                    Back
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || selected === null}
                    onClick={() => void save()}
                  >
                    {busy ? <Spinner /> : <Icon name="arrow" />}
                    {busy ? "Syncing roster…" : "Open front office"}
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function AnalystDrawer({
  dashboard,
  status,
  messages,
  delta,
  busy,
  onClose,
  onLogin,
  onSend,
}: {
  dashboard: Dashboard;
  status: CodexStatus;
  messages: ChatMessage[];
  delta: string;
  busy: boolean;
  onClose(): void;
  onLogin(): void;
  onSend(message: string): Promise<void>;
}) {
  const [input, setInput] = useState("");
  const recent = messages.slice(-12);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || busy) return;
    setInput("");
    await onSend(value);
  }
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="analyst-drawer">
        <header>
          <div className="analyst-avatar">
            <Icon name="spark" />
            <span />
          </div>
          <div>
            <strong>Caffeine Analyst</strong>
            <span>
              <i />
              Live league context
            </span>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        <div className="analyst-context">
          <span>{dashboard.league.teamName}</span>
          <span>{dashboard.scoringLabel}</span>
          <span>Roster #{dashboard.league.rosterId}</span>
        </div>
        <div className="messages">
          {recent.length === 0 && (
            <div className="conversation-empty">
              <Icon name="coffee" />
              <h3>Ask the hard question.</h3>
              <p>
                I can inspect every roster, your picks and settings, then
                research the current football context.
              </p>
              <button
                onClick={() =>
                  setInput("Where is my roster most fragile right now?")
                }
              >
                Try “Where am I most fragile?”
              </button>
            </div>
          )}
          {recent.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              {message.content}
            </div>
          ))}
          {busy && (
            <div className="message assistant streaming">
              {delta || (
                <>
                  <Spinner /> Reading the league and researching…
                </>
              )}
            </div>
          )}
        </div>
        {status.state === "signed_out" ? (
          <div className="drawer-login">
            <p>Connect ChatGPT to use the conversational analyst.</p>
            <button className="button primary" onClick={onLogin}>
              Connect ChatGPT
            </button>
          </div>
        ) : (
          <form className="chat-form" onSubmit={(event) => void submit(event)}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about your roster, a player, or a trade…"
              rows={2}
            />
            <button disabled={busy || !input.trim()}>
              <Icon name="arrow" />
            </button>
            <small>Sleeper data + optional live web research · read-only</small>
          </form>
        )}
      </aside>
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
    <div className="league-switch">
      <button className="league-current" onClick={() => setOpen(!open)}>
        {active ? (
          <>
            <Avatar name={active.teamName} avatar={active.avatar} small />
            <div>
              <strong>{active.teamName}</strong>
              <span>{active.name}</span>
            </div>
          </>
        ) : (
          <>
            <div className="avatar small">+</div>
            <div>
              <strong>Add league</strong>
              <span>Sleeper</span>
            </div>
          </>
        )}
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="league-menu">
          {data.leagues.map((league) => (
            <button
              key={league.leagueId}
              onClick={() => {
                onSelect(league.leagueId);
                setOpen(false);
              }}
            >
              <Avatar name={league.teamName} avatar={league.avatar} small />
              <div>
                <strong>{league.teamName}</strong>
                <span>{league.name}</span>
              </div>
              {league.isActive && <i />}
            </button>
          ))}
          <button
            className="add-league"
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

function TopBar({
  dashboard,
  busy,
  onRefresh,
  onAnalyst,
}: {
  dashboard: Dashboard | null;
  busy: boolean;
  onRefresh(): void;
  onAnalyst(): void;
}) {
  return (
    <header className="topbar">
      <div>
        {dashboard && (
          <>
            <span className="season-chip">{dashboard.league.season}</span>
            <span className="crumb">{dashboard.league.name}</span>
          </>
        )}
      </div>
      <div className="top-actions">
        {dashboard?.league.lastRefreshedAt && (
          <span className="last-sync">
            Synced {relativeTime(dashboard.league.lastRefreshedAt)}
          </span>
        )}
        <button
          className="icon-button"
          onClick={onRefresh}
          disabled={!dashboard || busy}
          title="Refresh Sleeper"
        >
          <Icon name="refresh" spin={busy} />
        </button>
        <button
          className="analyst-button"
          onClick={onAnalyst}
          disabled={!dashboard}
        >
          <Icon name="spark" />
          <span>Ask analyst</span>
          <kbd>⌘K</kbd>
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
    <button className="runtime-pill" onClick={onClick}>
      <span
        className={ready ? "online" : codex.state === "error" ? "error" : ""}
      />
      <div>
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
      </div>
    </button>
  );
}

function PlayerCard({ player }: { player: PlayerView }) {
  return (
    <article className="player-card">
      <PlayerPhoto player={player} />
      <div className="player-card-copy">
        <span>{player.rosterSlot ?? player.position ?? "NFL"}</span>
        <h3>{player.name}</h3>
        <p>
          {player.nflTeam ?? "FA"} · {player.position ?? "—"}
        </p>
      </div>
      {player.injuryStatus && <em className="injury">{player.injuryStatus}</em>}
    </article>
  );
}

function PlayerRow({
  player,
  compact,
}: {
  player: PlayerView;
  compact?: boolean;
}) {
  return (
    <div className="player-row">
      <PlayerPhoto player={player} small />
      <span className="slot">{player.rosterSlot ?? player.position}</span>
      <div>
        <strong>{player.name}</strong>
        <small>
          {player.nflTeam ?? "FA"}
          {player.injuryStatus ? ` · ${player.injuryStatus}` : ""}
        </small>
      </div>
      {!compact && <Icon name="chevron" />}
    </div>
  );
}

function PlayerPhoto({
  player,
  small,
}: {
  player: PlayerView;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const className = small ? "player-photo small" : "player-photo";
  if (failed || player.playerId === "0")
    return (
      <div className={`${className} fallback`}>{initials(player.name)}</div>
    );
  return (
    <div className={className}>
      <img
        src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
        alt=""
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function Avatar({
  name,
  avatar,
  small,
}: {
  name: string;
  avatar: string | null;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const className = small ? "avatar small" : "avatar";
  return (
    <div className={className}>
      {avatar && !failed ? (
        <img
          src={`https://sleepercdn.com/avatars/thumbs/${avatar}`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
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
  icon: string;
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
  const freshness = report
    ? `${report.invalidated ? "Stale · " : ""}Updated ${relativeTime(report.generatedAt)}`
    : "Not generated";
  const runGeneration = () => {
    if (status.state === "signed_out") onLogin();
    else onGenerate();
  };
  return (
    <article
      className="report-teaser"
      data-report-kind={kind}
      role="button"
      tabIndex={0}
      aria-label={`Open ${title}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="teaser-icon">
        <Icon name={icon} />
      </div>
      <div className="teaser-content">
        <div className="teaser-copy">
          <div className="teaser-meta">
            <span>{title}</span>
            <i />
            <small className={report?.invalidated ? "stale" : undefined}>
              {freshness}
            </small>
          </div>
          <h3>{headline}</h3>
          <p>{summary}</p>
        </div>
        {report ? (
          <span className="teaser-read">
            Read analysis <Icon name="arrow" />
          </span>
        ) : (
          <button
            className="teaser-generate"
            disabled={running || !canAct}
            onClick={(event) => {
              event.stopPropagation();
              runGeneration();
            }}
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
      <div className="teaser-actions">
        {report && (
          <button
            className="teaser-refresh"
            aria-label={`Refresh ${title}`}
            title={
              status.state === "signed_out"
                ? "Connect ChatGPT to refresh analysis"
                : "Refresh analysis"
            }
            disabled={running || !canAct}
            onClick={(event) => {
              event.stopPropagation();
              runGeneration();
            }}
          >
            <Icon name="refresh" spin={running} />
          </button>
        )}
      </div>
    </article>
  );
}

function SettingRow({
  title,
  detail,
  status,
  action,
}: {
  title: string;
  detail: string;
  status: string;
  action?: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="setting-state">
        <i className={status} />
        {action ?? status}
      </div>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function SectionTitle({
  eyebrow,
  title,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

function Metric({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? "metric warn" : "metric"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
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
  const myDetail = hasScore ? matchup?.myPoints?.toFixed(1) : `${record} · You`;
  const opponentDetail = hasScore
    ? matchup?.opponent.points?.toFixed(1)
    : matchup?.opponent.record;

  return (
    <aside className="matchup-preview">
      <div className="matchup-heading">
        <span className="eyebrow">Next matchup</span>
        <span className="week-pill">Week {week}</span>
      </div>
      <div className="matchup-teams">
        <div className="matchup-team">
          <Avatar
            name={dashboard.league.teamName}
            avatar={dashboard.league.avatar}
          />
          <div>
            <strong>{dashboard.league.teamName}</strong>
            <span>{myDetail}</span>
          </div>
        </div>
        <span className="versus">VS</span>
        {matchup ? (
          <div className="matchup-team opponent">
            <div>
              <strong>{matchup.opponent.teamName}</strong>
              <span>{opponentDetail}</span>
            </div>
            <Avatar
              name={matchup.opponent.teamName}
              avatar={matchup.opponent.avatar}
            />
          </div>
        ) : (
          <div className="matchup-team opponent pending">
            <div>
              <strong>Schedule pending</strong>
              <span>Opponent TBD</span>
            </div>
            <div className="avatar">?</div>
          </div>
        )}
      </div>
      <div className="matchup-footer">
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

function EmptyLeague({ onAdd }: { onAdd(): void }) {
  return (
    <div className="empty-league">
      <CoffeeBall />
      <h1>Wake up your front office.</h1>
      <p>
        Connect a public Sleeper league, choose your team, and let Caffeine
        build the room around it.
      </p>
      <button className="button primary" onClick={onAdd}>
        Add a Sleeper league
      </button>
    </div>
  );
}
function LaunchScreen({ error }: { error: string | null }) {
  return (
    <div className="launch-screen">
      <img
        className="brand-mark giant"
        src={sleeperCaffeineBadge}
        alt="Sleeper Caffeine"
      />
      <strong>Sleeper Caffeine</strong>
      <span>{error ?? "Warming up the front office…"}</span>
    </div>
  );
}
function Spinner() {
  return <span className="spinner" />;
}

function CoffeeBall() {
  return (
    <div className="coffee-ball">
      <div className="football">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="steam one" />
      <span className="steam two" />
      <div className="orbit">
        <b>WR</b>
        <b>RB</b>
        <b>QB</b>
      </div>
    </div>
  );
}

function Icon({ name, spin }: { name: string; spin?: boolean }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    pulse: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    swap: (
      <>
        <path d="m17 3 4 4-4 4" />
        <path d="M3 7h18M7 21l-4-4 4-4M21 17H3" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v3M21 12h-3M12 21v-3M3 12h3" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3-1.4 4.2a5 5 0 0 1-3.2 3.2L3 12l4.4 1.6a5 5 0 0 1 3.2 3.2L12 21l1.4-4.2a5 5 0 0 1 3.2-3.2L21 12l-4.4-1.6a5 5 0 0 1-3.2-3.2L12 3Z" />
      </>
    ),
    bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4V9.6h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.4h4v.1A1.7 1.7 0 0 0 15 4.2a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.6c.14.38.36.72.65 1 .3.27.68.4 1.08.4h.08v4h-.08a1.7 1.7 0 0 0-1.73 1Z" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5" />
        <path d="M4 18v-5h5" />
        <path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 11M4 13l2.3 4.6A7 7 0 0 0 18 15" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    external: (
      <>
        <path d="M15 3h6v6M10 14 21 3" />
        <path d="M18 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h7" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    coffee: (
      <>
        <path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
        <path d="M17 11h1a3 3 0 0 1 0 6h-2M8 2v3M12 2v3" />
      </>
    ),
  };
  return (
    <svg
      className={spin ? "icon spinning" : "icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
function capitalize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function reasoningLabel(value: string) {
  return value === "low"
    ? "Low · Faster"
    : value === "medium"
      ? "Medium · Balanced"
      : value === "high"
        ? "High · Deeper"
        : capitalize(value);
}
function draftTitle(status: string) {
  return status === "pre_draft"
    ? "Upcoming draft"
    : `${capitalize(status)} draft`;
}
function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': /, "")
    : "Something went wrong";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
function relativeTime(value: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 1000),
  );
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
