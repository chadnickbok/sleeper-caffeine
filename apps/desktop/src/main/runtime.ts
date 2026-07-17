import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  PlayerCache,
  PlayerDirectory,
  SleeperApi,
  SleeperClient,
  rosterView,
  type Draft,
  type DraftPick,
  type Matchup,
  type PlayerSummary,
  type Roster,
  type RosterView,
  type SleeperUser,
  type ToolWarning,
  type TradedPick,
} from "@sleeper-caffeine/core";
import { LocalMcpBridge } from "@sleeper-caffeine/mcp";
import { CodexSupervisor } from "@sleeper-caffeine/codex-runtime";
import {
  DRAFT_PLAN_OUTPUT_JSON_SCHEMA,
  DesktopPlatformSchema,
  DraftPlanOutputSchema,
  MICRO_SUMMARY_OUTPUT_JSON_SCHEMA,
  MicroSummaryOutputSchema,
  ReportPayloadSchema,
  REPORT_OUTPUT_JSON_SCHEMA,
  type AiReport,
  type AiSettings,
  type Bootstrap,
  type ChatHistoryCursor,
  type ChatHistoryPage,
  type ChatMessage,
  type Dashboard,
  type DraftView,
  type LeaguePreview,
  type PlayerView,
  type ReportKind,
  type ReportPayload,
  type RuntimeEvent,
  type SavedLeague,
} from "@sleeper-caffeine/ipc-contract";
import { LocalStore } from "./store.js";
import { buildDraftModel, selectDraft } from "./draft-model.js";
import {
  buildDraftPlan,
  draftPlanInputHash,
  reconcileDraftPlan,
} from "./draft-plan.js";

const MICRO_SUMMARY_PROMPT_VERSION = "1";

export class AppRuntime extends EventEmitter {
  readonly store: LocalStore;
  readonly api: SleeperApi;
  readonly players: PlayerDirectory;
  readonly mcp: LocalMcpBridge;
  codex: CodexSupervisor | null = null;
  private readonly cacheDir: string;

  constructor(private readonly userDataDir: string) {
    super();
    this.cacheDir = join(userDataDir, "cache", "sleeper");
    this.api = new SleeperApi(new SleeperClient());
    this.players = new PlayerDirectory(
      new PlayerCache(this.api, { cacheDir: this.cacheDir }),
    );
    this.store = new LocalStore(join(userDataDir, "sleeper-caffeine.sqlite"));
    this.mcp = new LocalMcpBridge({
      dependencies: { api: this.api, players: this.players },
      port: 9312,
    });
  }

  async start(): Promise<void> {
    await mkdir(join(this.userDataDir, "analyst-workspace"), {
      recursive: true,
    });
    this.mcp.subscribe((status) => this.send({ type: "mcp_status", status }));
    await this.mcp.start();
    this.codex = new CodexSupervisor({
      codexHome: join(this.userDataDir, "codex-home"),
      cwd: join(this.userDataDir, "analyst-workspace"),
      mcpUrl: this.mcp.getStatus().endpoint,
    });
    this.codex.subscribe((status) =>
      this.send({ type: "codex_status", status }),
    );
    await this.codex.start();

    if (this.store.getActiveLeague()) {
      try {
        await this.refreshActiveLeague();
      } catch (error) {
        console.warn(
          "Unable to refresh the active Sleeper league on launch",
          error,
        );
      }
    }
  }

  bootstrap(): Bootstrap {
    const active = this.store.getActiveLeague();
    const activeDashboard = active
      ? this.store.getDashboard(active.leagueId)
      : null;
    const reports = active ? this.store.getReports(active.leagueId) : [];
    const chatHistory = active
      ? this.store.listChatMessages(active.leagueId)
      : { messages: [], hasMore: false };
    return {
      platform: DesktopPlatformSchema.parse(process.platform),
      leagues: this.store.listLeagues(),
      activeDashboard,
      reports: reports.map((report) => {
        if (!report.draftPlan || !activeDashboard) return report;
        const draftPlan = reconcileDraftPlan(report.draftPlan, activeDashboard);
        return {
          ...report,
          invalidated: ![
            "current",
            "advanced_valid",
            "fallback_active",
          ].includes(draftPlan.status),
          draftPlan,
        };
      }),
      chatMessages: chatHistory.messages,
      chatHasMore: chatHistory.hasMore,
      codex: this.codex?.getStatus() ?? {
        state: "starting",
        binaryPath: null,
        version: null,
        email: null,
        planType: null,
        errorMessage: null,
        availableModels: [],
      },
      mcp: this.mcp.getStatus(),
      aiSettings: this.store.getAiSettings(),
    };
  }

  loadChatHistory(input: {
    leagueId: string;
    before: ChatHistoryCursor | null;
    limit?: number;
  }): ChatHistoryPage {
    if (
      !this.store
        .listLeagues()
        .some((league) => league.leagueId === input.leagueId)
    )
      throw new Error("League not found");
    return this.store.listChatMessages(input.leagueId, {
      before: input.before,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });
  }

  async previewLeague(input: string): Promise<LeaguePreview> {
    const leagueId = parseLeagueId(input);
    const [league, users, rosters] = await Promise.all([
      this.api.getLeague(leagueId),
      this.api.getLeagueUsers(leagueId),
      this.api.getRosters(leagueId),
    ]);
    const teams = rosters.flatMap((roster) => {
      const owner = users.find((user) => user.user_id === roster.owner_id);
      if (!roster.owner_id || !owner) return [];
      const metadata = owner.metadata ?? {};
      const teamName =
        typeof metadata["team_name"] === "string"
          ? metadata["team_name"]
          : null;
      return [
        {
          rosterId: roster.roster_id,
          userId: roster.owner_id,
          username: owner.username ?? null,
          displayName:
            owner.display_name ??
            owner.username ??
            `Roster ${String(roster.roster_id)}`,
          teamName:
            teamName ??
            owner.display_name ??
            owner.username ??
            `Roster ${String(roster.roster_id)}`,
          avatar: owner.avatar ?? null,
          record: formatRecord(roster.settings),
        },
      ];
    });
    return {
      leagueId: league.league_id,
      name: league.name,
      season: league.season,
      status: league.status,
      totalRosters: league.total_rosters,
      teams,
    };
  }

  async saveLeague(input: {
    leagueId: string;
    rosterId: number;
    userId: string;
  }): Promise<Bootstrap> {
    const preview = await this.previewLeague(input.leagueId);
    const team = preview.teams.find(
      (candidate) =>
        candidate.rosterId === input.rosterId &&
        candidate.userId === input.userId,
    );
    if (!team) throw new Error("That team is no longer present in the league");
    this.store.saveLeague({
      leagueId: preview.leagueId,
      name: preview.name,
      season: preview.season,
      team,
    });
    await this.refreshActiveLeague();
    return this.bootstrap();
  }

  setActiveLeague(leagueId: string): Bootstrap {
    this.store.setActiveLeague(leagueId);
    this.send({ type: "bootstrap_changed" });
    return this.bootstrap();
  }

  async refreshActiveLeague(): Promise<Bootstrap> {
    const saved = this.store.getActiveLeague();
    if (!saved) throw new Error("Add a Sleeper league before refreshing");
    const { dashboard, raw } = await this.buildDashboard(saved);
    this.store.saveDashboard(dashboard, raw);
    this.send({ type: "bootstrap_changed" });
    return this.bootstrap();
  }

  async generateReport(kind: ReportKind): Promise<AiReport> {
    if (kind === "draft_candidates") return this.generateDraftPlanReport();
    const dashboard = this.requireDashboard();
    const aiSettings = this.store.getAiSettings();
    const purpose = `report:${kind}`;
    const codex = this.requireCodex();
    const result = await codex.runTurn({
      threadId: this.store.getThread(dashboard.league.leagueId, purpose),
      model: aiSettings.model,
      effort: aiSettings.effort,
      prompt: reportPrompt(kind, dashboard),
      outputSchema: REPORT_OUTPUT_JSON_SCHEMA,
    });
    this.store.saveThread(dashboard.league.leagueId, purpose, result.threadId);

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      throw new Error(
        "Codex returned an analysis that did not match the report format. Try regenerating it.",
      );
    }
    const payload = ReportPayloadSchema.parse(parsed);
    let report = this.store.saveReport({
      leagueId: dashboard.league.leagueId,
      kind,
      snapshotAt: dashboard.capturedAt,
      payload,
    });
    this.send({ type: "bootstrap_changed" });

    try {
      const selectedModel = codex
        .getStatus()
        .availableModels.find((model) => model.model === aiSettings.model);
      const microEffort = selectedModel?.supportedReasoningEfforts.some(
        (candidate) => candidate.effort === "low",
      )
        ? "low"
        : aiSettings.effort;
      const microResult = await codex.runTurn({
        threadId: result.threadId,
        model: aiSettings.model,
        effort: microEffort,
        prompt: microSummaryPrompt(kind, payload),
        outputSchema: MICRO_SUMMARY_OUTPUT_JSON_SCHEMA,
      });
      this.store.saveThread(
        dashboard.league.leagueId,
        purpose,
        microResult.threadId,
      );
      const microOutput = MicroSummaryOutputSchema.parse(
        JSON.parse(microResult.text),
      );
      report = this.store.saveMicroSummary(report, {
        ...microOutput,
        model: aiSettings.model,
        promptVersion: MICRO_SUMMARY_PROMPT_VERSION,
      });
      this.send({ type: "bootstrap_changed" });
    } catch (error) {
      console.warn(
        `Unable to distill the ${kind} report into a micro summary`,
        error,
      );
    }
    return report;
  }

  private async generateDraftPlanReport(): Promise<AiReport> {
    await this.refreshActiveLeague();
    const aiSettings = this.store.getAiSettings();
    const codex = this.requireCodex();
    let dashboard = this.requireDashboard();
    const saved = this.store.getActiveLeague();
    if (!saved) throw new Error("Add a Sleeper league before draft analysis");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!dashboard.draft?.myUpcomingPickNumbers[0])
        throw new Error("There is no remaining owned pick to analyze");
      const inputHash = draftPlanInputHash(dashboard);
      const result = await codex.runTurn({
        threadId: null,
        model: aiSettings.model,
        effort: aiSettings.effort,
        prompt: draftPlanPrompt(dashboard),
        outputSchema: DRAFT_PLAN_OUTPUT_JSON_SCHEMA,
      });
      this.store.saveThread(
        dashboard.league.leagueId,
        `draft-plan:${inputHash}`,
        result.threadId,
      );

      let output;
      try {
        output = DraftPlanOutputSchema.parse(JSON.parse(result.text));
      } catch {
        throw new Error(
          "Codex returned a draft plan that did not match the structured plan format. Try regenerating it.",
        );
      }
      const generatedAt = new Date().toISOString();
      const draftPlan = buildDraftPlan({ dashboard, output, generatedAt });

      const latest = await this.buildDashboard(saved);
      this.store.saveDashboard(latest.dashboard, latest.raw);
      const boardMoved =
        latest.dashboard.draft?.boardHash !== dashboard.draft.boardHash;
      if (boardMoved) {
        dashboard = latest.dashboard;
        if (attempt === 0) continue;
        throw new Error(
          "The draft moved twice while Caffeine was researching. Refresh and regenerate from the latest board.",
        );
      }

      const payload = ReportPayloadSchema.parse(output);
      let report = this.store.saveReport({
        leagueId: dashboard.league.leagueId,
        kind: "draft_candidates",
        snapshotAt: dashboard.capturedAt,
        payload,
        draftPlan,
      });
      report = this.store.saveMicroSummary(report, {
        headline: output.headline.slice(0, 100),
        summary: output.summary.slice(0, 220),
        model: aiSettings.model,
        promptVersion: "draft-plan-2",
      });
      this.send({ type: "bootstrap_changed" });
      return {
        ...report,
        draftPlan: reconcileDraftPlan(draftPlan, latest.dashboard),
      };
    }
    throw new Error("Unable to build a plan from the moving draft board");
  }

  async sendChat(message: string): Promise<ChatMessage> {
    const dashboard = this.requireDashboard();
    const aiSettings = this.store.getAiSettings();
    const clean = message.trim();
    if (!clean) throw new Error("Ask the analyst a question first");
    const leagueId = dashboard.league.leagueId;
    const runId = randomUUID();
    const userMessage = this.store.saveChatMessage(leagueId, "user", clean);
    this.send({ type: "chat_started", leagueId, runId, userMessage });
    try {
      const result = await this.requireCodex().runTurn({
        threadId: this.store.getThread(leagueId, "conversation"),
        model: aiSettings.model,
        effort: aiSettings.effort,
        prompt: `Active Sleeper league: ${leagueId}. My Sleeper user ID: ${dashboard.league.userId}. My roster ID: ${String(dashboard.league.rosterId)}.\n\n${clean}`,
        onDelta: (text) =>
          this.send({ type: "chat_delta", leagueId, runId, text }),
      });
      this.store.saveThread(leagueId, "conversation", result.threadId);
      const response = this.store.saveChatMessage(
        leagueId,
        "assistant",
        result.text.trim(),
      );
      this.send({
        type: "chat_completed",
        leagueId,
        runId,
        assistantMessage: response,
      });
      this.send({ type: "bootstrap_changed" });
      return response;
    } catch (error) {
      this.send({
        type: "chat_failed",
        leagueId,
        runId,
        error: error instanceof Error ? error.message : "Codex turn failed",
      });
      throw error;
    }
  }

  updateAiSettings(settings: AiSettings): Bootstrap {
    const selectedModel = this.codex
      ?.getStatus()
      .availableModels.find((model) => model.model === settings.model);
    if (selectedModel) {
      const supported = selectedModel.supportedReasoningEfforts.some(
        (effort) => effort.effort === settings.effort,
      );
      if (!supported)
        throw new Error(
          `${selectedModel.displayName} does not support ${settings.effort} reasoning`,
        );
    }
    this.store.saveAiSettings(settings);
    this.send({ type: "bootstrap_changed" });
    return this.bootstrap();
  }

  toggleDraftCandidatePin(playerId: string): Bootstrap {
    const saved = this.store.getActiveLeague();
    if (!saved) throw new Error("Add a Sleeper league before pinning players");
    const dashboard = this.store.getDashboard(saved.leagueId);
    if (!dashboard?.draft)
      throw new Error("Refresh the draft board before pinning players");
    if (
      !dashboard.draft.candidates.some(
        (candidate) => candidate.player.playerId === playerId,
      )
    )
      throw new Error("That player is not in the candidate pool");
    const pinned = this.store.toggleDraftCandidatePin(saved.leagueId, playerId);
    const updated: Dashboard = {
      ...dashboard,
      draft: {
        ...dashboard.draft,
        candidates: dashboard.draft.candidates.map((candidate) =>
          candidate.player.playerId === playerId
            ? { ...candidate, pinned }
            : candidate,
        ),
      },
    };
    this.store.updateDashboardCache(updated);
    this.send({ type: "bootstrap_changed" });
    return this.bootstrap();
  }

  async clearLocalData(): Promise<Bootstrap> {
    this.store.clearAll();
    await this.players.clear();
    await rm(this.cacheDir, { recursive: true, force: true });
    await mkdir(this.cacheDir, { recursive: true });
    this.send({ type: "bootstrap_changed" });
    return this.bootstrap();
  }

  async stop(): Promise<void> {
    this.codex?.stop();
    await this.mcp.stop();
    this.store.close();
  }

  private async buildDashboard(
    saved: SavedLeague,
  ): Promise<{ dashboard: Dashboard; raw: unknown }> {
    const [league, users, rosters, tradedPicks, drafts, directory, state] =
      await Promise.all([
        this.api.getLeague(saved.leagueId),
        this.api.getLeagueUsers(saved.leagueId),
        this.api.getRosters(saved.leagueId),
        this.api.getTradedPicks(saved.leagueId),
        this.api.getDrafts(saved.leagueId),
        this.players.get(),
        this.api.getNflState().catch(() => null),
      ]);
    const roster = rosters.find(
      (candidate) => candidate.roster_id === saved.rosterId,
    );
    if (!roster)
      throw new Error(
        "Your selected roster is no longer present in this league",
      );
    const owner = users.find((user) => user.user_id === saved.userId);
    const warnings: ToolWarning[] = [];
    const view = rosterView(league, roster, users, directory.players, warnings);
    const capturedAt = new Date().toISOString();
    const refreshedLeague: SavedLeague = {
      ...saved,
      name: league.name,
      season: league.season,
      teamName: view.team_name ?? saved.teamName,
      avatar: owner?.avatar ?? saved.avatar,
      lastRefreshedAt: capturedAt,
    };
    const draft = await buildDraftView({
      drafts,
      preferredDraftId: league.draft_id,
      saved,
      players: directory.players,
      api: this.api,
      rosters,
      users,
      leagueTradedPicks: tradedPicks,
      rosterPositions: league.roster_positions,
      leagueSettings: league.settings,
      pinnedPlayerIds: this.store.getPinnedDraftCandidateIds(saved.leagueId),
    });
    const matchupWeek =
      league.status === "pre_draft" ? 1 : Math.max(state?.week ?? 1, 1);
    const matchups = await this.api
      .getMatchups(saved.leagueId, matchupWeek)
      .catch((): Matchup[] => []);
    const dashboard: Dashboard = {
      league: refreshedLeague,
      capturedAt,
      week: state?.week ?? 1,
      leagueStatus: league.status,
      scoringLabel: scoringLabel(league.scoring_settings),
      rosterPositions: league.roster_positions,
      starters: view.starters.map((player) =>
        toPlayer(player, { starter: true, slot: player.starter_slot ?? null }),
      ),
      bench: view.bench.map((player) => toPlayer(player)),
      reserve: view.reserve.map((player) =>
        toPlayer(player, { reserve: true }),
      ),
      taxi: view.taxi.map((player) => toPlayer(player, { taxi: true })),
      record: recordView(view),
      pickInventory: {
        acquired: tradedPicks.filter(
          (pick) =>
            pick.owner_id === saved.rosterId &&
            pick.roster_id !== saved.rosterId,
        ),
        sent: tradedPicks.filter(
          (pick) =>
            pick.roster_id === saved.rosterId &&
            pick.owner_id !== saved.rosterId,
        ),
      },
      warnings,
      draft,
      nextMatchup: nextMatchupView({
        week: matchupWeek,
        rosterId: saved.rosterId,
        matchups,
        rosters,
        users,
      }),
    };
    return {
      dashboard,
      raw: {
        league,
        users,
        rosters,
        tradedPicks,
        drafts,
        playerCacheFetchedAt: directory.fetchedAt,
      },
    };
  }

  private requireDashboard(): Dashboard {
    const active = this.store.getActiveLeague();
    const dashboard = active ? this.store.getDashboard(active.leagueId) : null;
    if (!dashboard)
      throw new Error("Refresh a Sleeper league before asking for analysis");
    return dashboard;
  }

  private requireCodex(): CodexSupervisor {
    if (!this.codex) throw new Error("The Codex runtime is still starting");
    return this.codex;
  }

  private send(event: RuntimeEvent): void {
    this.emit("runtime-event", event);
  }
}

function nextMatchupView({
  week,
  rosterId,
  matchups,
  rosters,
  users,
}: {
  week: number;
  rosterId: number;
  matchups: Matchup[];
  rosters: Roster[];
  users: SleeperUser[];
}): Dashboard["nextMatchup"] {
  const mine = matchups.find((matchup) => matchup.roster_id === rosterId);
  if (mine?.matchup_id == null) return null;
  const theirs = matchups.find(
    (matchup) =>
      matchup.matchup_id === mine.matchup_id && matchup.roster_id !== rosterId,
  );
  if (!theirs) return null;
  const opponentRoster = rosters.find(
    (roster) => roster.roster_id === theirs.roster_id,
  );
  if (!opponentRoster) return null;
  const opponentOwner = users.find(
    (user) => user.user_id === opponentRoster.owner_id,
  );
  const metadata = opponentOwner?.metadata ?? {};
  const metadataTeamName = metadata["team_name"];
  const teamName =
    typeof metadataTeamName === "string" && metadataTeamName.trim()
      ? metadataTeamName.trim()
      : (opponentOwner?.display_name ??
        opponentOwner?.username ??
        `Roster ${String(opponentRoster.roster_id)}`);
  return {
    week,
    matchupId: mine.matchup_id,
    myPoints: matchupPoints(mine),
    opponent: {
      rosterId: opponentRoster.roster_id,
      teamName,
      avatar: opponentOwner?.avatar ?? null,
      record: formatRecord(opponentRoster.settings),
      points: matchupPoints(theirs),
    },
  };
}

function matchupPoints(matchup: Matchup): number | null {
  return numeric(matchup.custom_points) ?? numeric(matchup.points);
}

async function buildDraftView(input: {
  drafts: Draft[];
  preferredDraftId: string | null | undefined;
  saved: SavedLeague;
  players: ReadonlyMap<string, PlayerSummary>;
  api: SleeperApi;
  rosters: Roster[];
  users: SleeperUser[];
  leagueTradedPicks: TradedPick[];
  rosterPositions: string[];
  leagueSettings: Record<string, unknown>;
  pinnedPlayerIds: ReadonlySet<string>;
}): Promise<DraftView> {
  const draft = selectDraft(input.drafts, input.preferredDraftId);
  if (!draft) return null;
  const [picks, draftTradedPicks] = await Promise.all([
    input.api.getDraftPicks(draft.draft_id).catch((): DraftPick[] => []),
    input.api
      .getDraftTradedPicks(draft.draft_id)
      .catch(() => input.leagueTradedPicks),
  ]);
  return buildDraftModel({
    draft,
    picks,
    tradedPicks: draftTradedPicks,
    saved: input.saved,
    rosters: input.rosters,
    users: input.users,
    players: input.players,
    rosterPositions: input.rosterPositions,
    leagueSettings: input.leagueSettings,
    pinnedPlayerIds: input.pinnedPlayerIds,
  });
}

function toPlayer(
  player: PlayerSummary,
  flags: {
    starter?: boolean;
    reserve?: boolean;
    taxi?: boolean;
    slot?: string | null;
  } = {},
): PlayerView {
  return {
    playerId: player.player_id,
    name: player.name,
    position: player.position,
    nflTeam: player.team,
    injuryStatus: player.injury_status,
    status: player.status,
    isStarter: flags.starter ?? false,
    isReserve: flags.reserve ?? false,
    isTaxi: flags.taxi ?? false,
    rosterSlot: flags.slot ?? null,
  };
}

function recordView(view: RosterView): Dashboard["record"] {
  return {
    wins: numeric(view.settings["wins"]) ?? 0,
    losses: numeric(view.settings["losses"]) ?? 0,
    ties: numeric(view.settings["ties"]) ?? 0,
    pointsFor:
      (numeric(view.settings["fpts"]) ?? 0) +
      (numeric(view.settings["fpts_decimal"]) ?? 0) / 100,
  };
}

function scoringLabel(settings: Record<string, number>): string {
  const reception = settings["rec"] ?? 0;
  if (reception >= 1) return "PPR";
  if (reception > 0) return "Half PPR";
  return "Standard";
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatRecord(settings: Record<string, unknown>): string {
  const wins = numeric(settings["wins"]) ?? 0;
  const losses = numeric(settings["losses"]) ?? 0;
  const ties = numeric(settings["ties"]) ?? 0;
  return ties
    ? `${String(wins)}-${String(losses)}-${String(ties)}`
    : `${String(wins)}-${String(losses)}`;
}

export function parseLeagueId(input: string): string {
  const clean = input.trim();
  if (/^\d+$/.test(clean)) return clean;
  let url: URL;
  try {
    url = new URL(clean);
  } catch {
    throw new Error("Paste a Sleeper league URL or numeric league ID");
  }
  const match = url.pathname.match(/\/leagues?\/(\d+)/);
  if (!match?.[1])
    throw new Error("This does not look like a Sleeper league URL");
  return match[1];
}

function reportPrompt(kind: ReportKind, dashboard: Dashboard): string {
  const task = {
    team_analysis:
      "Produce a candid team audit. Identify competitive strengths, real weaknesses, positional fragility, roster-construction concerns, and dead weight. Be direct but evidence-based.",
    trade_suggestions:
      "Find realistic trade directions. Analyze every roster, likely partner incentives, expendable assets, positional needs, and several concrete offer frameworks. Do not pretend a trade has been sent.",
    draft_candidates:
      "Build a scoring- and roster-aware shortlist of draft targets. Account for my pick inventory, current roster construction, draft state, tier breaks, upside, and current news.",
  }[kind];
  const draftContext =
    kind === "draft_candidates" && dashboard.draft
      ? `\n\nDeterministic candidate context:\n${JSON.stringify({
          status: dashboard.draft.status,
          sourceStatus: dashboard.draft.sourceStatus,
          currentPickNo: dashboard.draft.currentPickNo,
          myUpcomingPickNumbers: dashboard.draft.myUpcomingPickNumbers,
          candidatePoolMode: dashboard.draft.candidatePoolMode,
          candidates: dashboard.draft.candidates
            .filter((candidate, index) => index < 10 || candidate.pinned)
            .slice(0, 15)
            .map((candidate) => ({
              rank: candidate.rank,
              player: candidate.player.name,
              position: candidate.player.position,
              marketRank: candidate.marketRank,
              score: candidate.score,
              rationale: candidate.rationale,
              pinned: candidate.pinned,
              scoreBreakdown: candidate.scoreBreakdown,
            })),
        })}\nTreat this as the candidate set to compare. Research this focused group rather than generating summaries for the entire available-player pool.`
      : "";
  return `League ID: ${dashboard.league.leagueId}\nMy user ID: ${dashboard.league.userId}\nMy roster ID: ${String(dashboard.league.rosterId)}\nSnapshot captured: ${dashboard.capturedAt}\n\n${task}${draftContext}\n\nCall the relevant Sleeper MCP tools first. Then use live web search for current player context. Return only JSON matching the supplied schema. Every material current-news claim should have a source entry; Sleeper-derived claims should be labeled sourceType sleeper. A search result is discovery, not a source: cite the actual page you relied on.`;
}

function draftPlanPrompt(dashboard: Dashboard): string {
  const draft = dashboard.draft;
  if (!draft) throw new Error("Refresh the draft before generating a plan");
  const targetPickNo = draft.myUpcomingPickNumbers[0];
  if (!targetPickNo) throw new Error("There is no remaining owned pick");
  const cohort = draftResearchCohort(dashboard);
  const myDraftedPlayers = draft.picks
    .filter((pick) => pick.rosterId === dashboard.league.rosterId)
    .map((pick) => ({
      playerId: pick.player?.playerId ?? null,
      player: pick.player?.name ?? "Unknown player",
      position: pick.player?.position ?? null,
      pickNo: pick.pickNo,
    }));
  return `Build a high-value, evidence-backed draft plan for one immutable Sleeper board snapshot.

League ID: ${dashboard.league.leagueId}
My user ID: ${dashboard.league.userId}
My roster ID: ${String(dashboard.league.rosterId)}
Board hash: ${draft.boardHash}
Snapshot captured: ${dashboard.capturedAt}
Target owned pick: ${String(targetPickNo)}

Structured draft context:
${JSON.stringify({
  draftId: draft.draftId,
  status: draft.status,
  sourceStatus: draft.sourceStatus,
  basedOnPickCount: draft.picks.length,
  currentPickNo: draft.currentPickNo,
  targetPickNo,
  laterOwnedPicks: draft.myUpcomingPickNumbers.slice(1),
  scoringLabel: dashboard.scoringLabel,
  rosterPositions: dashboard.rosterPositions,
  roster: {
    starters: dashboard.starters,
    bench: dashboard.bench,
    reserve: dashboard.reserve,
    taxi: dashboard.taxi,
    draftedThisDraft: myDraftedPlayers,
  },
  completedPicks: draft.picks.map((pick) => ({
    pickNo: pick.pickNo,
    playerId: pick.player?.playerId ?? null,
    player: pick.player?.name ?? "Unknown player",
    position: pick.player?.position ?? null,
    rosterId: pick.rosterId,
  })),
  candidateCohort: cohort.map((candidate) => ({
    playerId: candidate.player.playerId,
    player: candidate.player.name,
    position: candidate.player.position,
    nflTeam: candidate.player.nflTeam,
    baselineRank: candidate.rank,
    sleeperSearchRank: candidate.marketRank,
    baselineScore: candidate.score,
    baselineRationale: candidate.rationale,
    scoreBreakdown: candidate.scoreBreakdown,
    onResearchList: candidate.pinned,
  })),
})}

Call get_draft_snapshot first to verify the board. Use web search to research the most decision-relevant candidates, including current role, NFL draft capital, depth-chart opportunity, injuries, and credible dynasty/rookie consensus where available. Search results are discovery, not sources: cite the actual pages relied on.

Return only JSON matching the supplied schema. Requirements:
- Use only playerId values from candidateCohort.
- Rank 5-10 candidates with unique consecutive planRank values starting at 1.
- primaryPlayerId must be planRank 1 and role primary.
- fallbackPlayerIds must be ordered and must also appear in recommendations.
- Explain meaningful promotions or demotions versus baselineRank.
- Distinguish the plan for pick ${String(targetPickNo)} from strategies for later owned picks.
- Every material current-news claim needs a source entry.
- Sleeper-derived claims use sourceType sleeper.
- Do not claim to submit a pick; this app is read-only.`;
}

function draftResearchCohort(dashboard: Dashboard) {
  const candidates = dashboard.draft?.candidates ?? [];
  const selected = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates.slice(0, 30))
    selected.set(candidate.player.playerId, candidate);
  for (const position of ["QB", "RB", "WR", "TE"])
    for (const candidate of candidates
      .filter((item) => item.player.position === position)
      .slice(0, 8))
      selected.set(candidate.player.playerId, candidate);
  for (const candidate of candidates)
    if (candidate.pinned) selected.set(candidate.player.playerId, candidate);
  return [...selected.values()].slice(0, 48);
}

function microSummaryPrompt(kind: ReportKind, payload: ReportPayload): string {
  const emphasis = {
    team_analysis:
      "Lead with the roster's strongest competitive advantage and its most important vulnerability.",
    trade_suggestions:
      "Lead with the clearest source of trade leverage and the roster need it should address.",
    draft_candidates:
      "Lead with the highest-priority position and the practical approach to the next pick.",
  }[kind];
  return `Distill the completed fantasy-football briefing below into card copy. This is an editorial condensation step, not a new analysis step.

Use only the supplied briefing. Do not call tools, use web search, introduce new facts, or rely on conversation memory.
${emphasis}

Return only JSON matching the supplied schema:
- headline: a conclusion-led headline; aim for 70-80 characters, with a hard limit of 100 characters
- summary: one paragraph of at most two sentences and 220 characters; put the most important detail first because the card displays only the first three lines

Prefer specific players or decisions when useful. Do not use Markdown, bullets, category labels, throat-clearing, or repeat the headline.

Completed briefing:
${JSON.stringify(payload)}`;
}
