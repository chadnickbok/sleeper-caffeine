import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  AiReport,
  AiSettings,
  Bootstrap,
  CodexStatus,
  CodexModel,
  Dashboard,
  DraftCandidateView,
  DraftPlan,
  PlayerView,
  ReportKind,
  RuntimeEvent,
} from "@sleeper-caffeine/ipc-contract";
import { REPORT_STALE_AFTER_MS } from "@sleeper-caffeine/ipc-contract";
import sleeperCaffeineBadge from "./assets/sleeper-caffeine-badge.svg";
import sleeperCaffeineMascot from "./assets/sleeper-caffeine-mascot.svg";
import { caffeineClient } from "./api/caffeine-client.js";
import {
  useBootstrapQuery,
  useCaffeineCommands,
  type CaffeinePendingState,
} from "./api/use-caffeine-runtime.js";
import { useRuntimeEvents } from "./app/use-runtime-events.js";
import { Icon, type IconName } from "./components/ui/index.js";
import {
  AnalystDrawer,
  type CaffeineChatRun,
} from "./features/assistant/AnalystDrawer.js";
import { Onboarding } from "./features/onboarding/Onboarding.js";
import {
  selectLivePlanRecommendations,
  selectVisibleDraftCandidates,
} from "./features/draft/candidate-selectors.js";

type Page =
  | "home"
  | "roster"
  | "analysis"
  | "trades"
  | "draft"
  | "waivers"
  | "lineup"
  | "settings";

const NAV: Array<{
  page: Page;
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
    <div className="app-shell" data-platform={data.platform}>
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
          onSelect={(leagueId) => safely(commands.switchLeague(leagueId))}
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
              data.codex.state === "signed_out" && safely(commands.login())
            }
          />
        </div>
      </aside>

      <main className="main-stage">
        <TopBar
          dashboard={active}
          busy={commands.pending.refresh}
          onRefresh={() => safely(commands.refresh())}
          onAnalyst={() => setAnalystOpen(true)}
        />
        {error && (
          <div className="error-banner">
            <Icon name="alert" />
            {error}
            <button onClick={commands.dismissError}>×</button>
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
        </div>
      </main>

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
  pending: CaffeinePendingState;
  onGenerate(kind: ReportKind): void;
  onNavigate(page: Page): void;
  onRefresh(): void;
  onLogin(): void;
  onClear(): void;
  onLogout(): void;
  onAiSettings(settings: AiSettings): void;
  onToggleDraftPin(playerId: string): void;
}) {
  if (props.page === "home")
    return (
      <Home
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
        onTogglePin={props.onToggleDraftPin}
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
      pending={props.pending}
    />
  );
}

function reportActions(props: {
  pending: CaffeinePendingState;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  data: Bootstrap;
}) {
  return {
    generating: props.pending.report,
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
  onNavigate(page: Page): void;
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
  generating,
  onGenerate,
  onLogin,
  codex,
}: {
  kind: ReportKind;
  eyebrow: string;
  title: string;
  description: string;
  report: AiReport | null;
  generating: ReportKind | null;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  codex: CodexStatus;
}) {
  const running = generating === kind;
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
        <GeneratingState title="Researching your league" />
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
  generating,
  onGenerate,
  onLogin,
  codex,
  onRefresh,
  onTogglePin,
}: {
  dashboard: Dashboard;
  report: AiReport | null;
  generating: ReportKind | null;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  codex: CodexStatus;
  onRefresh(): void;
  onTogglePin(playerId: string): void;
}) {
  const running = generating === "draft_candidates";
  const draft = dashboard.draft;
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(
    null,
  );
  const plan = report?.draftPlan ?? null;
  const activePlan =
    plan &&
    ["current", "advanced_valid", "fallback_active", "research_stale"].includes(
      plan.status,
    )
      ? plan
      : null;
  const livePlanRecommendations = selectLivePlanRecommendations(
    draft?.candidates ?? [],
    activePlan,
  );
  const recommendationById = new Map(
    livePlanRecommendations.map((recommendation) => [
      recommendation.player.playerId,
      recommendation,
    ]),
  );
  const visibleCandidates = selectVisibleDraftCandidates({
    candidates: draft?.candidates ?? [],
    recommendations: livePlanRecommendations,
    position,
    query,
  });
  const nextPick = draft?.myUpcomingPickNumbers[0] ?? null;
  const completedSelection = plan?.selectedPlayerId
    ? plan.recommendations.find(
        (item) => item.player.playerId === plan.selectedPlayerId,
      )?.player
    : null;
  const activeRecommendation = activePlan?.activeRecommendationPlayerId
    ? (activePlan.recommendations.find(
        (item) =>
          item.player.playerId === activePlan.activeRecommendationPlayerId,
      ) ?? null)
    : null;
  const intelligenceHeadline = running
    ? "Caffeine is rebuilding the decision board."
    : activePlan?.status === "fallback_active" && activeRecommendation
      ? `Pivot to ${activeRecommendation.player.name} at #${String(activePlan.targetPickNo)}`
      : activePlan
        ? (report?.microSummary?.headline ?? report?.payload.headline)
        : plan?.status === "completed"
          ? `${completedSelection?.name ?? "Your target"} was selected at #${String(plan.targetPickNo)}`
          : plan?.status === "superseded"
            ? "The previous plan no longer matches the live board."
            : "Build one researched plan for the next decision.";
  const intelligenceSummary = running
    ? "Comparing the focused candidate band with the latest board, roster construction, and current reporting."
    : activePlan?.status === "fallback_active" && activeRecommendation
      ? `${activeRecommendation.rationale} The original primary target is no longer available, so this approved fallback now leads the plan.`
      : activePlan
        ? (report?.microSummary?.summary ?? report?.payload.summary)
        : plan?.status === "completed"
          ? "That decision is preserved in history. The live baseline below has already moved on to your next owned pick."
          : (plan?.statusReason ??
            "The Live Baseline is ready now. Build a Caffeine Plan when you want researched rankings, fallbacks, and a coherent pick strategy.");
  const planStatusLabel = running
    ? "Building Caffeine Plan"
    : activePlan?.status === "fallback_active"
      ? "Fallback activated"
      : activePlan?.status === "advanced_valid"
        ? "Plan still valid · board advanced"
        : activePlan?.status === "research_stale"
          ? "Plan research needs refresh"
          : activePlan
            ? "Caffeine Plan current"
            : plan?.status === "completed"
              ? "Last decision completed"
              : plan
                ? "Previous plan superseded"
                : "Live Baseline only";
  return (
    <div className="page draft-page">
      <PageHeading
        eyebrow="Live room"
        title="Draft command"
        description="Live Sleeper picks drive the board. Candidate ranking is local; deeper intelligence is regenerated on demand."
        action={
          <button className="button ghost" onClick={onRefresh}>
            <Icon name="refresh" />
            Refresh board
          </button>
        }
      />
      <DraftBoard dashboard={dashboard} />
      {draft && draft.status !== "unsupported" && (
        <>
          <section className="draft-intelligence-section">
            <SectionTitle
              eyebrow="Live intelligence"
              title={
                nextPick
                  ? `Your plan at #${String(nextPick)}`
                  : "Your live draft plan"
              }
            />
            <div className="draft-intelligence panel">
              <div className="draft-intelligence-status">
                <span>
                  <i
                    className={
                      !activePlan || activePlan.status === "research_stale"
                        ? "stale"
                        : ""
                    }
                  />
                  {planStatusLabel}
                </span>
                <small>
                  {activePlan
                    ? `Plan based on ${String(activePlan.basedOnPickCount)} picks`
                    : `Live board has ${String(draft.picks.length)} of ${String(draft.totalPicks ?? "—")} picks`}
                </small>
              </div>
              <div className="draft-intelligence-body">
                <article className="draft-change-card">
                  <div className="draft-card-kicker">
                    {running
                      ? "Researching"
                      : activePlan
                        ? "Caffeine recommendation"
                        : plan?.status === "completed"
                          ? "Last decision"
                          : "Next decision"}
                    <span>{draft.picks.length} picks made</span>
                  </div>
                  <h2>{intelligenceHeadline}</h2>
                  <p>{intelligenceSummary}</p>
                </article>
                <div className="draft-decision-board">
                  <div className="draft-decision-head">
                    <div>
                      <span>
                        {activePlan ? "Caffeine Plan" : "Live Baseline"}
                      </span>
                      <strong>
                        {activePlan
                          ? "Researched options for your build"
                          : "Available now · not yet researched"}
                      </strong>
                    </div>
                    <small>
                      {nextPick ? `AT #${String(nextPick)}` : "LIVE"}
                    </small>
                  </div>
                  {activePlan
                    ? livePlanRecommendations.slice(0, 3).map((item) => (
                        <button
                          className="draft-decision-row"
                          key={item.player.playerId}
                          onClick={() =>
                            setExpandedCandidate(item.player.playerId)
                          }
                        >
                          <span>{String(item.planRank).padStart(2, "0")}</span>
                          <div>
                            <strong>{item.player.name}</strong>
                            <small>
                              {item.player.position ?? "—"} ·{" "}
                              {item.player.nflTeam ?? "FA"}
                            </small>
                          </div>
                          <div>
                            <em>{planRoleLabel(item.role)}</em>
                            <small>{item.rationale}</small>
                          </div>
                          <i />
                        </button>
                      ))
                    : draft.candidates.slice(0, 3).map((candidate) => (
                        <button
                          className="draft-decision-row"
                          key={candidate.player.playerId}
                          onClick={() =>
                            setExpandedCandidate(candidate.player.playerId)
                          }
                        >
                          <span>{String(candidate.rank).padStart(2, "0")}</span>
                          <div>
                            <strong>{candidate.player.name}</strong>
                            <small>
                              {candidate.player.position ?? "—"} ·{" "}
                              {candidate.player.nflTeam ?? "FA"}
                            </small>
                          </div>
                          <div>
                            <em>Baseline</em>
                            <small>{candidate.rationale}</small>
                          </div>
                          <i />
                        </button>
                      ))}
                </div>
                <aside className="draft-pick-action">
                  <div>
                    <span>Your next pick</span>
                    <strong>{nextPick ? `#${String(nextPick)}` : "—"}</strong>
                    {draft.currentPickNo && nextPick && (
                      <small>
                        {Math.max(0, nextPick - draft.currentPickNo)} selections
                        away
                      </small>
                    )}
                  </div>
                  <p>
                    {draft.myUpcomingPickNumbers.length > 1
                      ? `Also own ${draft.myUpcomingPickNumbers
                          .slice(1)
                          .map((pick) => `#${String(pick)}`)
                          .join(" · ")}`
                      : "No later selections currently owned"}
                  </p>
                  <AiAction
                    status={codex}
                    running={running}
                    hasReport={Boolean(activePlan)}
                    onGenerate={() => onGenerate("draft_candidates")}
                    onLogin={onLogin}
                  />
                  <small>
                    Refreshes Sleeper first · researched and board-validated
                  </small>
                </aside>
              </div>
            </div>
          </section>

          <section className="candidate-board panel">
            <div className="candidate-board-head">
              <div>
                <span>
                  Live Baseline ·{" "}
                  {nextPick
                    ? `planning for pick #${String(nextPick)}`
                    : "no owned pick remaining"}
                </span>
                <h2>Candidate board</h2>
                <p>
                  Research-list players are guaranteed a look in the next
                  Caffeine Plan without changing baseline rank.
                </p>
              </div>
              <div className="candidate-controls">
                <div className="candidate-filters">
                  {["ALL", "QB", "RB", "WR", "TE"].map((filter) => (
                    <button
                      className={position === filter ? "active" : ""}
                      key={filter}
                      onClick={() => setPosition(filter)}
                    >
                      {filter === "ALL" ? "For you" : filter}
                    </button>
                  ))}
                </div>
                <label className="candidate-search">
                  <Icon name="search" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search all available"
                  />
                </label>
              </div>
            </div>
            <div className="candidate-table-head" aria-hidden="true">
              <span>{activePlan ? "Plan" : "Base"}</span>
              <span>Player</span>
              <span>Sleeper search</span>
              <span>Plan role</span>
              <span>Why here</span>
              <span>Research</span>
            </div>
            <div className="candidate-list">
              {visibleCandidates.map((candidate) => (
                <CandidateRow
                  candidate={candidate}
                  recommendation={recommendationById.get(
                    candidate.player.playerId,
                  )}
                  expanded={expandedCandidate === candidate.player.playerId}
                  onExpand={() =>
                    setExpandedCandidate((current) =>
                      current === candidate.player.playerId
                        ? null
                        : candidate.player.playerId,
                    )
                  }
                  onTogglePin={() => onTogglePin(candidate.player.playerId)}
                  key={candidate.player.playerId}
                />
              ))}
              {visibleCandidates.length === 0 && (
                <div className="candidate-empty">
                  No matching available players.
                </div>
              )}
            </div>
          </section>

          {running && <GeneratingState title="Updating the decision board" />}
          {!running && report?.draftPlan && (
            <section className="draft-deep-briefing">
              <SectionTitle
                eyebrow={activePlan ? "Deep briefing" : "Previous plan"}
                title={activePlan ? "Why this plan works" : "Decision history"}
                trailing={
                  <span className="briefing-note">
                    Scoring, roster construction, pick capital and risk
                  </span>
                }
              />
              <ReportView report={report} hideLead />
            </section>
          )}
        </>
      )}
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
  if (draft.status === "unsupported")
    return (
      <div className="panel empty-panel">
        <Icon name="target" />
        <h3>{capitalize(draft.type)} draft detected</h3>
        <p>
          The spatial board supports linear and snake drafts. Completed picks
          remain available to the analyst, but auction planning needs a
          dedicated budget view.
        </p>
      </div>
    );
  const rounds = Array.from(
    { length: draft.rounds ?? 0 },
    (_, index) => index + 1,
  );
  return (
    <section className="draft-board panel">
      <div className="draft-board-head">
        <div>
          <span className="live-dot" />
          {draftStatusLabel(draft.status)} · {draft.picks.length} of{" "}
          {draft.totalPicks ?? "—"} picks
        </div>
        <span>
          Sleeper reports {draft.sourceStatus.replaceAll("_", " ")}
          {draft.currentPickNo
            ? ` · Pick #${String(draft.currentPickNo)} on clock`
            : ""}
        </span>
      </div>
      <div className="draft-matrix-scroll">
        <div
          className="draft-matrix"
          style={{ "--draft-columns": draft.teams ?? 1 } as CSSProperties}
        >
          <div className="draft-owner-row">
            {draft.draftTeams.map((team) => (
              <div
                className={team.isMine ? "draft-owner mine" : "draft-owner"}
                key={team.draftSlot}
              >
                <span>{initials(team.teamName)}</span>
                <strong>{team.teamName}</strong>
              </div>
            ))}
          </div>
          {rounds.map((round) => (
            <div className="draft-round" key={round}>
              {draft.board
                .filter((cell) => cell.round === round)
                .sort((a, b) => a.draftSlot - b.draftSlot)
                .map((cell) => (
                  <div
                    className={draftCellClass(cell)}
                    key={`${String(round)}-${String(cell.draftSlot)}`}
                  >
                    <span>{pickLabel(cell.pickNo, draft.teams ?? 0)}</span>
                    {cell.pick ? (
                      <>
                        <strong>
                          {cell.pick.player?.name ?? "Unknown player"}
                        </strong>
                        <small>
                          {cell.pick.player?.position ?? "—"} ·{" "}
                          {cell.pick.player?.nflTeam ?? "FA"}
                          {cell.pick.isKeeper ? " · Keeper" : ""}
                        </small>
                      </>
                    ) : cell.isOnClock ? (
                      <>
                        <strong>On clock</strong>
                        <small>{cell.ownerTeamName ?? "Owner pending"}</small>
                      </>
                    ) : cell.isMine ? (
                      <>
                        <strong>Your pick</strong>
                        <small>
                          {cell.isTraded ? "Acquired pick" : "Upcoming"}
                        </small>
                      </>
                    ) : cell.isTraded ? (
                      <small className="trade-owner">
                        → {cell.ownerTeamName}
                      </small>
                    ) : (
                      <small>—</small>
                    )}
                  </div>
                ))}
            </div>
          ))}
          <div className="draft-board-footer">
            <span>Your remaining picks</span>
            {draft.myUpcomingPickNumbers.length ? (
              draft.myUpcomingPickNumbers.map((pick) => (
                <strong key={pick}>#{pick}</strong>
              ))
            ) : (
              <em>No remaining picks</em>
            )}
            <small>
              <i /> On clock <i /> Your pick
            </small>
          </div>
        </div>
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  recommendation,
  expanded,
  onExpand,
  onTogglePin,
}: {
  candidate: DraftCandidateView;
  recommendation: DraftPlan["recommendations"][number] | undefined;
  expanded: boolean;
  onExpand(): void;
  onTogglePin(): void;
}) {
  return (
    <div className={expanded ? "candidate-row expanded" : "candidate-row"}>
      <button className="candidate-row-main" onClick={onExpand}>
        <span className="candidate-priority">
          {recommendation
            ? String(recommendation.planRank).padStart(2, "0")
            : String(candidate.rank).padStart(2, "0")}
        </span>
        <div className="candidate-player">
          <PlayerPhoto player={candidate.player} small />
          <div>
            <strong>{candidate.player.name}</strong>
            <small>
              {candidate.player.position ?? "—"} ·{" "}
              {candidate.player.nflTeam ?? "FA"}
            </small>
          </div>
        </div>
        <div className="candidate-market">
          <strong>{candidate.marketRank ?? "—"}</strong>
          <small>Public search order</small>
        </div>
        <span
          className={`candidate-fit ${recommendation ? recommendation.role : candidate.fitLabel}`}
        >
          {recommendation
            ? planRoleLabel(recommendation.role)
            : `Baseline #${String(candidate.rank)}`}
        </span>
        <p>{recommendation?.rationale ?? candidate.rationale}</p>
      </button>
      <button
        className={candidate.pinned ? "candidate-pin pinned" : "candidate-pin"}
        onClick={onTogglePin}
        aria-pressed={candidate.pinned}
      >
        {candidate.pinned ? "Researching" : "+ Research"}
      </button>
      {expanded && (
        <div className="candidate-rationale">
          {recommendation && (
            <div className="candidate-plan-detail">
              <span>Caffeine rationale</span>
              <strong>{recommendation.rationale}</strong>
              {recommendation.risks.length > 0 && (
                <small>Risk: {recommendation.risks.join(" · ")}</small>
              )}
            </div>
          )}
          <div>
            <span>Market</span>
            <ScoreBar value={candidate.scoreBreakdown.market} />
          </div>
          <div>
            <span>Roster fit</span>
            <ScoreBar value={candidate.scoreBreakdown.rosterFit} />
          </div>
          <div>
            <span>Scarcity</span>
            <ScoreBar value={candidate.scoreBreakdown.scarcity} />
          </div>
          <div>
            <span>Pick window</span>
            <ScoreBar value={candidate.scoreBreakdown.pickWindow} />
          </div>
          <div>
            <span>Upside</span>
            <ScoreBar value={candidate.scoreBreakdown.upside} />
          </div>
          <strong>{candidate.score} baseline score</strong>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <span className="score-bar">
      <i style={{ width: `${String(value)}%` }} />
      <em>{value}</em>
    </span>
  );
}

function ReportView({
  report,
  hideLead = false,
}: {
  report: AiReport;
  hideLead?: boolean;
}) {
  const stale = isStaleReport(report);
  return (
    <div className="report-view">
      {stale && (
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
      {!hideLead && (
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
      )}
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
      <details className="source-panel panel">
        <summary>
          <span>
            <small>Evidence</small>
            <strong>Sources, assumptions and watch list</strong>
          </span>
          <em>
            {report.payload.sources.length} sources ·{" "}
            {report.payload.caveats.length} caveats
          </em>
          <Icon name="chevron" />
        </summary>
        <div className="source-panel-content">
          {report.payload.sources.map((source, index) => (
            <button
              className="source-row"
              key={`${source.title}-${String(index)}`}
              onClick={() =>
                source.url && void caffeineClient.openExternal(source.url)
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
        </div>
      </details>
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

function GeneratingState({ title }: { title: string }) {
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
  pending,
}: {
  data: Bootstrap;
  onClear(): void;
  onLogin(): void;
  onLogout(): void;
  onAiSettings(settings: AiSettings): void;
  pending: CaffeinePendingState;
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
              disabled={pending.settings}
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
              disabled={pending.settings}
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
              <button
                className="text-button"
                onClick={onLogout}
                disabled={pending.logout}
              >
                {pending.logout ? "Signing out…" : "Sign out"}
              </button>
            ) : (
              <button
                className="text-button"
                onClick={onLogin}
                disabled={pending.login}
              >
                {pending.login ? "Opening login…" : "Sign in"}
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
              disabled={pending.clear}
            >
              {pending.clear ? "Clearing…" : "Clear everything"}
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
  const runGeneration = () => {
    if (status.state === "signed_out") onLogin();
    else onGenerate();
  };
  return (
    <article className="report-teaser" data-report-kind={kind}>
      <div className="teaser-icon">
        <Icon name={icon} />
      </div>
      <div className="teaser-content">
        <div className="teaser-copy">
          <div className="teaser-meta">
            <span>{title}</span>
            <i />
            <small className={stale ? "stale" : undefined}>{freshness}</small>
          </div>
          <h3>{headline}</h3>
          <p>{summary}</p>
        </div>
        {report ? (
          <button className="teaser-read" onClick={onOpen}>
            Read analysis <Icon name="arrow" />
          </button>
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

function planRoleLabel(value: DraftPlan["recommendations"][number]["role"]) {
  return value === "primary"
    ? "Primary"
    : value === "fallback"
      ? "Fallback"
      : value === "later"
        ? "Later pick"
        : "Avoid";
}

function draftStatusLabel(value: NonNullable<Dashboard["draft"]>["status"]) {
  return value === "live"
    ? "Draft in progress"
    : value === "scheduled"
      ? "Draft scheduled"
      : value === "complete"
        ? "Draft complete"
        : value === "pending"
          ? "Slow draft waiting"
          : "Draft view unavailable";
}

function draftCellClass(
  cell: NonNullable<Dashboard["draft"]>["board"][number],
) {
  return [
    "draft-cell",
    cell.pick ? "filled" : "empty",
    cell.isMine ? "mine" : "",
    cell.isOnClock ? "on-clock" : "",
    cell.isTraded ? "traded" : "",
    cell.pick?.player?.position
      ? `position-${cell.pick.player.position.toLowerCase()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function pickLabel(pickNo: number, teams: number) {
  if (teams <= 0) return `#${String(pickNo)}`;
  const round = Math.floor((pickNo - 1) / teams) + 1;
  const position = ((pickNo - 1) % teams) + 1;
  return `${String(round)}.${String(position)}`;
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
function isStaleReport(report: AiReport) {
  const generatedAt = Date.parse(report.generatedAt);
  return (
    report.invalidated &&
    Number.isFinite(generatedAt) &&
    Date.now() - generatedAt > REPORT_STALE_AFTER_MS
  );
}
