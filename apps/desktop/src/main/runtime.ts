import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import {
  getWeeklyContext,
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
  type WeeklyContextData,
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
  supportsWeeklyManagement,
  ThursdayLineupOutputSchema,
  TUESDAY_PLAN_OUTPUT_JSON_SCHEMA,
  TuesdayPlanOutputSchema,
  WEEKLY_PHASE_OUTPUT_JSON_SCHEMAS,
  WeekendCheckOutputSchema,
  WeeklyPhaseBriefRequestSchema,
  WeeklyPlanRequestSchema,
  WeeklyPlanSummarySchema,
  type AiReport,
  type AiSettings,
  type Bootstrap,
  type ChatHistoryCursor,
  type ChatHistoryPage,
  type ChatMessage,
  type CurrentWeeklyBriefs,
  type Dashboard,
  type DraftView,
  type LeaguePreview,
  type PlayerView,
  type ReportKind,
  type ReportPayload,
  type RuntimeEvent,
  type SavedLeague,
  type ThursdayLineupOutput,
  type TuesdayPlanOutput,
  type WatchlistEntry,
  type WeekendCheckOutput,
  type WeeklyAction,
  type WeeklyActionUpdate,
  type WeeklyPhaseBrief,
  type WeeklyPhaseBriefKey,
  type WeeklyPhaseBriefRequest,
  type WeeklyPlan,
  type WeeklyPlanBundle,
  type WeeklyPlanRequest,
} from "@sleeper-caffeine/ipc-contract";
import { LocalStore } from "./store.js";
import { resolveAppPaths } from "./app-paths.js";
import { buildDraftModel, selectDraft } from "./draft-model.js";
import {
  buildDraftPlan,
  draftPlanInputHash,
  reconcileDraftPlan,
} from "./draft-plan.js";
import { buildDraftSeasonHandoff } from "./draft-season-handoff.js";
import {
  buildTuesdayWatchlistEntries,
  buildWeeklyPlan,
  deriveWeeklyPlanSummary,
  deriveWeeklyChanges,
  reconcileWeeklyPlan,
  selectTuesdayResearchCohort,
  sleeperEventsFromContext,
  weeklyContextHash,
  weeklyPhaseForDate,
} from "./weekly-plan.js";
import {
  buildWednesdayAftermath,
  buildWeeklyPhaseBrief,
  currentLegalLineup,
  weeklyPhaseInputHash,
} from "./weekly-phase.js";

const MICRO_SUMMARY_PROMPT_VERSION = "1";
const WeeklyPlanEditorialSummarySchema = WeeklyPlanSummarySchema.pick({
  headline: true,
  summary: true,
});
const WEEKLY_SUMMARY_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary"],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
  },
} as const;

export class AppRuntime extends EventEmitter {
  readonly store: LocalStore;
  readonly api: SleeperApi;
  readonly players: PlayerDirectory;
  readonly mcp: LocalMcpBridge;
  codex: CodexSupervisor | null = null;
  private readonly cacheDir: string;

  constructor(private readonly userDataDir: string) {
    super();
    const paths = resolveAppPaths(userDataDir);
    this.cacheDir = paths.cacheDir;
    this.api = new SleeperApi(new SleeperClient());
    this.players = new PlayerDirectory(
      new PlayerCache(this.api, { cacheDir: this.cacheDir }),
    );
    this.store = new LocalStore(paths.databasePath);
    this.mcp = new LocalMcpBridge({
      dependencies: { api: this.api, players: this.players },
      port: 9312,
    });
  }

  async start(): Promise<void> {
    const paths = resolveAppPaths(this.userDataDir);
    await mkdir(paths.analystWorkspace, {
      recursive: true,
    });
    this.mcp.subscribe((status) => this.send({ type: "mcp_status", status }));
    await this.mcp.start();
    this.codex = new CodexSupervisor({
      codexHome: paths.codexHome,
      cwd: paths.analystWorkspace,
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
    const weeklyBundle = activeDashboard
      ? this.store.getWeeklyPlanBundle({
          leagueId: activeDashboard.league.leagueId,
          season: activeDashboard.league.season,
          week: activeDashboard.week,
        })
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
      activeLeagueWeek: weeklyBundle?.leagueWeek ?? null,
      currentWeeklyPlan: weeklyBundle?.plan ?? null,
      weeklyActions: weeklyBundle?.actions ?? [],
      currentWeeklyBriefs: activeDashboard
        ? this.store.getCurrentWeeklyBriefs({
            leagueId: activeDashboard.league.leagueId,
            season: activeDashboard.league.season,
            week: activeDashboard.week,
          })
        : { wednesday: null, thursday: null, weekend: null },
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
    this.seedDraftSeasonHandoff(dashboard);
    await this.refreshWeeklyContext(saved, dashboard);
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

  loadWeeklyPlan(input: {
    leagueId: string;
    season: string;
    week: number;
  }): WeeklyPlanBundle {
    const bundle = this.store.getWeeklyPlanBundle(input);
    if (!bundle)
      throw new Error("Refresh this league before opening its weekly plan");
    return bundle;
  }

  async generateWeeklyPlan(
    input: WeeklyPlanRequest,
  ): Promise<WeeklyPlanBundle> {
    const request = WeeklyPlanRequestSchema.parse(input);
    const dashboard = this.requireDashboard();
    if (
      dashboard.league.leagueId !== request.leagueId ||
      dashboard.league.season !== request.season ||
      dashboard.week !== request.week
    )
      throw new Error(
        "The active league or week changed. Refresh before building this plan.",
      );
    if (!supportsWeeklyManagement(dashboard.leagueStatus))
      throw new Error(
        "Weekly plans activate when Sleeper marks this league in season. Draft Room remains available now.",
      );
    const storedContext = this.store.getWeeklyContext(request);
    if (!storedContext?.context || !storedContext.contextHash)
      throw new Error("Refresh Sleeper before building the weekly plan");
    const context = storedContext.context as WeeklyContextData;
    const aiSettings = this.store.getAiSettings();
    const codex = this.requireCodex();
    const previousBundle = this.store.getWeeklyPlanBundle(request);
    const purpose = `weekly:${request.season}:${String(request.week)}`;
    this.send({
      type: "weekly_plan_started",
      key: request,
      mode: request.mode,
    });
    try {
      this.send({
        type: "weekly_plan_progress",
        key: request,
        stage: "reading_league",
      });
      const watchlist = this.store.listWatchlistEntries(request.leagueId);
      const result = await codex.runTurn({
        threadId: this.store.getThread(request.leagueId, purpose),
        model: aiSettings.model,
        effort: aiSettings.effort,
        prompt: weeklyPlanPrompt({
          request,
          context,
          previousPlan: previousBundle?.plan ?? null,
          previousActions: this.store.listWeeklyActionsForWeek(request),
          watchlist,
        }),
        outputSchema: TUESDAY_PLAN_OUTPUT_JSON_SCHEMA,
      });
      this.store.saveThread(request.leagueId, purpose, result.threadId);
      this.send({
        type: "weekly_plan_progress",
        key: request,
        stage: "building_plan",
      });

      let output;
      try {
        output = TuesdayPlanOutputSchema.parse(JSON.parse(result.text));
      } catch (error) {
        console.warn("Invalid structured Tuesday plan", error);
        throw new Error(
          "Codex returned a weekly plan that did not match the decision format. Try regenerating it.",
        );
      }
      const generatedAt = new Date().toISOString();
      const built = buildWeeklyPlan({
        key: request,
        context,
        output,
        snapshotId:
          this.store.getLatestSnapshotId(request.leagueId) ??
          storedContext.snapshotAt ??
          dashboard.capturedAt,
        inputHash: storedContext.contextHash,
        version: this.store.getNextWeeklyPlanVersion(request),
        model: aiSettings.model,
        reasoningEffort: aiSettings.effort,
        generatedAt,
      });
      let bundle = this.store.saveWeeklyPlan(
        built.plan,
        built.actions,
        built.evidence,
      );
      for (const entry of buildTuesdayWatchlistEntries({
        key: request,
        output,
        generatedAt,
      }))
        this.store.upsertGeneratedWatchlistEntry(entry);
      this.send({ type: "bootstrap_changed" });

      try {
        const summaryResult = await codex.runTurn({
          threadId: result.threadId,
          model: aiSettings.model,
          effort: lowEffortFor(codex, aiSettings),
          prompt: weeklySummaryPrompt(output),
          outputSchema: WEEKLY_SUMMARY_OUTPUT_JSON_SCHEMA,
        });
        this.store.saveThread(
          request.leagueId,
          purpose,
          summaryResult.threadId,
        );
        const editorial = WeeklyPlanEditorialSummarySchema.parse(
          JSON.parse(summaryResult.text),
        );
        const summary = deriveWeeklyPlanSummary(output, editorial);
        this.store.saveWeeklyPlanSummary(built.plan.id, summary);
        bundle = this.store.getWeeklyPlanBundle(request) ?? bundle;
      } catch (error) {
        console.warn("Unable to create weekly plan micro summary", error);
      }

      const latestContext = this.store.getWeeklyContext(request);
      if (
        latestContext?.contextHash &&
        latestContext.contextHash !== built.plan.inputHash
      ) {
        const reconciled = reconcileWeeklyPlan({
          plan: bundle.plan ?? built.plan,
          contextHash: latestContext.contextHash,
          changes: bundle.leagueWeek.meaningfulChanges,
        });
        this.store.setWeeklyPlanStatus(
          built.plan.id,
          reconciled.status,
          reconciled.statusReason,
        );
        bundle = this.store.getWeeklyPlanBundle(request) ?? bundle;
      } else {
        this.store.clearWeeklyChanges(request);
        bundle = this.store.getWeeklyPlanBundle(request) ?? bundle;
      }
      this.send({ type: "weekly_plan_completed", bundle });
      this.send({ type: "bootstrap_changed" });
      return bundle;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Weekly plan generation failed";
      this.send({ type: "weekly_plan_failed", key: request, error: message });
      throw error;
    }
  }

  loadWeeklyPhaseBrief(input: WeeklyPhaseBriefKey): WeeklyPhaseBrief | null {
    return this.store.getCurrentWeeklyPhaseBrief(input);
  }

  async generateWeeklyPhaseBrief(
    input: WeeklyPhaseBriefRequest,
  ): Promise<WeeklyPhaseBrief> {
    const request = WeeklyPhaseBriefRequestSchema.parse(input);
    const dashboard = this.requireDashboard();
    if (
      dashboard.league.leagueId !== request.leagueId ||
      dashboard.league.season !== request.season ||
      dashboard.week !== request.week
    )
      throw new Error(
        "The active league or week changed. Refresh before building this briefing.",
      );
    if (!supportsWeeklyManagement(dashboard.leagueStatus))
      throw new Error(
        "Weekly briefings activate when Sleeper marks this league in season. Draft Room remains available now.",
      );

    const storedContext = this.store.getWeeklyContext(request);
    if (!storedContext?.context || !storedContext.contextHash)
      throw new Error("Refresh Sleeper before building this briefing");
    const planBundle = this.store.getWeeklyPlanBundle(request);
    if (!planBundle?.plan)
      throw new Error(
        "Build Tuesday's weekly plan before running the rest of the week.",
      );

    const context = storedContext.context as WeeklyContextData;
    const plan = planBundle.plan;
    const actionsForWeek = this.store.listWeeklyActionsForWeek(request);
    const dataFreshThrough = storedContext.snapshotAt ?? dashboard.capturedAt;
    const snapshotId =
      this.store.getLatestSnapshotId(request.leagueId) ?? dataFreshThrough;
    const inputHash = weeklyPhaseInputHash({
      context,
      sourcePlanId: plan.id,
      sourcePlanHash: `${plan.inputHash}:${plan.evidenceHash}`,
      phase: request.phase,
      actionState: actionsForWeek.map(
        ({ actionKey, status, dispositionNote, updatedAt }) => ({
          actionKey,
          status,
          dispositionNote,
          updatedAt,
        }),
      ),
    });

    this.send({
      type: "weekly_phase_brief_started",
      key: request,
      mode: request.mode,
    });
    try {
      this.send({
        type: "weekly_phase_brief_progress",
        key: request,
        stage: "reading_league",
      });

      if (request.phase === "wednesday") {
        this.send({
          type: "weekly_phase_brief_progress",
          key: request,
          stage: "reconciling_week",
        });
        const output = buildWednesdayAftermath({
          context,
          actions: actionsForWeek,
          capturedAt: dataFreshThrough,
        });
        this.send({
          type: "weekly_phase_brief_progress",
          key: request,
          stage: "building_brief",
        });
        const built = buildWeeklyPhaseBrief({
          key: request,
          phase: "wednesday",
          context,
          output,
          snapshotId,
          sourcePlanId: plan.id,
          inputHash,
          dataFreshThrough,
          version: this.store.getNextWeeklyPhaseBriefVersion(request),
          model: "local-deterministic",
          reasoningEffort: "none",
        });
        this.assertWeeklyPhaseInputsUnchanged(request, inputHash);
        const brief = this.store.saveWeeklyPhaseBrief(
          built.brief,
          built.actions,
          built.evidence,
        );
        this.send({ type: "weekly_phase_brief_completed", brief });
        this.send({ type: "bootstrap_changed" });
        return brief;
      }

      const aiSettings = this.store.getAiSettings();
      const codex = this.requireCodex();
      const priorBriefs = this.store.getCurrentWeeklyBriefs(request);
      this.send({
        type: "weekly_phase_brief_progress",
        key: request,
        stage: "researching_players",
      });
      if (request.phase === "thursday")
        this.send({
          type: "weekly_phase_brief_progress",
          key: request,
          stage: "optimizing_lineup",
        });
      const purpose = `weekly:${request.season}:${String(request.week)}:${request.phase}`;
      const result = await codex.runTurn({
        threadId: this.store.getThread(request.leagueId, purpose),
        model: aiSettings.model,
        effort: aiSettings.effort,
        prompt: weeklyPhasePrompt({
          request,
          context,
          plan,
          actions: actionsForWeek,
          priorBriefs,
          previousBrief:
            request.phase === "thursday"
              ? priorBriefs.thursday
              : priorBriefs.weekend,
        }),
        outputSchema: WEEKLY_PHASE_OUTPUT_JSON_SCHEMAS[request.phase],
      });
      this.store.saveThread(request.leagueId, purpose, result.threadId);
      this.send({
        type: "weekly_phase_brief_progress",
        key: request,
        stage: "building_brief",
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.text);
      } catch {
        throw new Error(
          "Codex returned a briefing that did not match the decision format. Try regenerating it.",
        );
      }
      const built =
        request.phase === "thursday"
          ? buildWeeklyPhaseBrief({
              key: request,
              phase: "thursday",
              context,
              output: parseThursdayOutput(parsed),
              snapshotId,
              sourcePlanId: plan.id,
              inputHash,
              dataFreshThrough,
              version: this.store.getNextWeeklyPhaseBriefVersion(request),
              model: aiSettings.model,
              reasoningEffort: aiSettings.effort,
            })
          : buildWeeklyPhaseBrief({
              key: request,
              phase: "weekend",
              context,
              output: parseWeekendOutput(parsed),
              snapshotId,
              sourcePlanId: plan.id,
              inputHash,
              dataFreshThrough,
              version: this.store.getNextWeeklyPhaseBriefVersion(request),
              model: aiSettings.model,
              reasoningEffort: aiSettings.effort,
            });
      this.assertWeeklyPhaseInputsUnchanged(request, inputHash);
      const brief = this.store.saveWeeklyPhaseBrief(
        built.brief,
        built.actions,
        built.evidence,
      );
      this.send({ type: "weekly_phase_brief_completed", brief });
      this.send({ type: "bootstrap_changed" });
      return brief;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Weekly briefing generation failed";
      this.send({
        type: "weekly_phase_brief_failed",
        key: request,
        error: message,
      });
      throw error;
    }
  }

  private assertWeeklyPhaseInputsUnchanged(
    request: WeeklyPhaseBriefRequest,
    expectedHash: string,
  ): void {
    const storedContext = this.store.getWeeklyContext(request);
    const plan = this.store.getWeeklyPlanBundle(request)?.plan ?? null;
    if (!storedContext?.context || !plan)
      throw new Error(
        `The ${request.phase} briefing inputs changed while it was being built. Review the refreshed week and try again.`,
      );
    const context = storedContext.context as WeeklyContextData;
    const actions = this.store.listWeeklyActionsForWeek(request);
    const currentHash = weeklyPhaseInputHash({
      context,
      sourcePlanId: plan.id,
      sourcePlanHash: `${plan.inputHash}:${plan.evidenceHash}`,
      phase: request.phase,
      actionState: actions.map(
        ({ actionKey, status, dispositionNote, updatedAt }) => ({
          actionKey,
          status,
          dispositionNote,
          updatedAt,
        }),
      ),
    });
    if (currentHash !== expectedHash)
      throw new Error(
        `Sleeper data or weekly decisions changed while the ${request.phase} briefing was being built. Review the refreshed week and try again.`,
      );
  }

  updateWeeklyAction(input: WeeklyActionUpdate): WeeklyAction {
    const action = this.store.updateWeeklyAction(
      input.actionId,
      input.status,
      input.note ?? null,
    );
    if (action.kind === "watch" && action.status === "dismissed") {
      const watchedPlayerIds = new Set(action.playerIds);
      for (const entry of this.store.listWatchlistEntries(action.leagueId))
        if (watchedPlayerIds.has(entry.playerId))
          this.store.updateWatchlistState(entry.id, "dismissed");
    }
    this.send({ type: "weekly_action_updated", action });
    this.send({ type: "bootstrap_changed" });
    return action;
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
    const leagueWeekKey = {
      leagueId,
      season: dashboard.league.season,
      week: dashboard.week,
    };
    const weeklyBundle = this.store.getWeeklyPlanBundle(leagueWeekKey);
    const weeklyBriefs = this.store.getCurrentWeeklyBriefs(leagueWeekKey);
    const runId = randomUUID();
    const userMessage = this.store.saveChatMessage(leagueId, "user", clean);
    this.send({ type: "chat_started", leagueId, runId, userMessage });
    try {
      const result = await this.requireCodex().runTurn({
        threadId: this.store.getThread(leagueId, "conversation"),
        model: aiSettings.model,
        effort: aiSettings.effort,
        prompt: `Active Sleeper league: ${leagueId}. My Sleeper user ID: ${dashboard.league.userId}. My roster ID: ${String(dashboard.league.rosterId)}. Active season/week: ${dashboard.league.season}/${String(dashboard.week)}.\n\nCurrent persisted weekly plan context (if any):\n${JSON.stringify(
          weeklyBundle
            ? {
                planId: weeklyBundle.plan?.id ?? null,
                status: weeklyBundle.leagueWeek.planStatus,
                competitiveLane: weeklyBundle.leagueWeek.competitiveLane,
                headline: weeklyBundle.plan?.output.headline ?? null,
                summary: weeklyBundle.plan?.output.summary ?? null,
                actions: weeklyBundle.actions.map((action) => ({
                  id: action.id,
                  title: action.title,
                  status: action.status,
                  note: action.dispositionNote,
                })),
                phaseBriefs: Object.fromEntries(
                  Object.entries(weeklyBriefs).map(([phase, brief]) => [
                    phase,
                    brief
                      ? {
                          id: brief.id,
                          generatedAt: brief.generatedAt,
                          headline: brief.output.headline,
                          summary: brief.output.summary,
                        }
                      : null,
                  ]),
                ),
              }
            : null,
        )}\n\nDo not silently mutate the persisted weekly plan. Explain or challenge it conversationally.\n\n${clean}`,
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
      week: matchupWeek,
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

  private async refreshWeeklyContext(
    saved: SavedLeague,
    dashboard: Dashboard,
  ): Promise<void> {
    const result = await getWeeklyContext(
      { api: this.api, players: this.players },
      {
        league_id: saved.leagueId,
        roster_id: saved.rosterId,
        week: dashboard.week,
        recent_matchup_weeks: 3,
        trending_lookback_hours: 24,
        candidate_limit: 40,
      },
    );
    const context = result.data;
    const key = {
      leagueId: context.key.league_id,
      season: context.key.season,
      week: context.key.week,
    };
    this.expireWatchlistEntries(key);
    const previousRecord = this.store.getWeeklyContext(key);
    const previous = previousRecord?.context
      ? (previousRecord.context as WeeklyContextData)
      : null;
    const detectedAt = new Date().toISOString();
    const changes = deriveWeeklyChanges(previous, context, detectedAt);
    const contextHash = weeklyContextHash(context);
    this.store.saveSleeperEvents(
      sleeperEventsFromContext(key, context, detectedAt),
    );
    this.store.saveWeeklyContext({
      ...key,
      phase: weeklyPhaseForDate(),
      snapshotAt: dashboard.capturedAt,
      contextHash,
      context,
      meaningfulChanges: changes,
    });

    const bundle = this.store.getWeeklyPlanBundle(key);
    if (bundle?.plan) {
      this.reconcileObservedWeeklyActions(bundle.actions, context);
      const reconciled = reconcileWeeklyPlan({
        plan: bundle.plan,
        contextHash,
        changes,
      });
      if (
        reconciled.status !== bundle.plan.status ||
        reconciled.statusReason !== bundle.plan.statusReason
      )
        this.store.setWeeklyPlanStatus(
          bundle.plan.id,
          reconciled.status,
          reconciled.statusReason,
        );
    }
    const leagueWeek = this.store.getLeagueWeek(key);
    if (leagueWeek) this.send({ type: "league_week_changed", leagueWeek });
  }

  private seedDraftSeasonHandoff(dashboard: Dashboard): void {
    if (
      dashboard.draft?.status !== "complete" ||
      (dashboard.leagueStatus !== "pre_draft" && dashboard.week > 1)
    )
      return;
    const draftReport = this.store
      .getReports(dashboard.league.leagueId)
      .find(
        (report) =>
          report.kind === "draft_candidates" &&
          report.draftPlan?.draftId === dashboard.draft?.draftId,
      );
    const knownPlayers = new Map(
      [
        ...dashboard.starters,
        ...dashboard.bench,
        ...dashboard.reserve,
        ...dashboard.taxi,
        ...dashboard.draft.picks.flatMap((pick) =>
          pick.player ? [pick.player] : [],
        ),
        ...dashboard.draft.candidates.map((candidate) => candidate.player),
      ].map((player) => [player.playerId, player]),
    );
    const pinnedResearchTargets = [
      ...this.store.getPinnedDraftCandidateIds(dashboard.league.leagueId),
    ].flatMap((playerId) => {
      const player = knownPlayers.get(playerId);
      return player ? [{ player }] : [];
    });
    const handoff = buildDraftSeasonHandoff({
      dashboard,
      draftPlan: draftReport?.draftPlan ?? null,
      pinnedResearchTargets,
      existingWatchlist: this.store.listWatchlistEntries(
        dashboard.league.leagueId,
        { includeInactive: true },
      ),
      generatedAt: dashboard.capturedAt,
    });
    for (const seed of handoff.watchlistSeeds)
      this.store.upsertWatchlistEntry(seed.entry);
  }

  private expireWatchlistEntries(key: {
    leagueId: string;
    season: string;
    week: number;
  }): void {
    for (const entry of this.store.listWatchlistEntries(key.leagueId)) {
      if (!entry.expiresSeason || entry.expiresWeek === null) continue;
      const expired =
        entry.expiresSeason < key.season ||
        (entry.expiresSeason === key.season && entry.expiresWeek < key.week);
      if (expired) this.store.updateWatchlistState(entry.id, "expired");
    }
  }

  private reconcileObservedWeeklyActions(
    actions: WeeklyAction[],
    context: WeeklyContextData,
  ): void {
    const myRosterId = context.my_team.roster_id;
    const thursdayBrief = this.store.getCurrentWeeklyPhaseBrief({
      leagueId: context.key.league_id,
      season: context.key.season,
      week: context.key.week,
      phase: "thursday",
    });
    for (const action of actions) {
      if (action.status !== "pending") continue;
      if (action.kind === "lineup_move") {
        const move =
          thursdayBrief?.phase === "thursday"
            ? thursdayBrief.output.recommendedMoves.find(
                (candidate) =>
                  `thursday:${candidate.actionKey}` === action.actionKey,
              )
            : null;
        if (
          !move ||
          context.my_team.starters[move.toSlotIndex]?.player_id !==
            move.playerId
        )
          continue;
        try {
          this.store.updateWeeklyAction(
            action.id,
            "observed_in_sleeper",
            "Sleeper now shows the recommended player in your starting lineup. Confirm whether this recommendation is complete.",
          );
        } catch (error) {
          console.warn("Unable to reconcile a weekly lineup action", error);
        }
        continue;
      }
      if (
        ![
          "waiver_claim",
          "free_agent_add",
          "drop",
          "trade",
          "roster_upgrade",
          "stash",
        ].includes(action.kind)
      )
        continue;
      const event = context.current_week_transactions.events.find(
        (candidate) =>
          candidate.status.toLowerCase() === "complete" &&
          candidate.roster_ids.includes(myRosterId) &&
          transactionCanObserveAction(
            candidate.transaction.type,
            action.kind,
          ) &&
          action.playerIds.some((playerId) =>
            candidate.player_ids.includes(playerId),
          ),
      );
      if (!event) continue;
      try {
        this.store.updateWeeklyAction(
          action.id,
          "observed_in_sleeper",
          "Sleeper now reflects a related roster transaction. Confirm whether this recommendation is complete.",
          event.event_id,
        );
      } catch (error) {
        console.warn("Unable to reconcile a weekly action", error);
      }
    }
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

function transactionCanObserveAction(
  transactionType: string,
  actionKind: WeeklyAction["kind"],
): boolean {
  if (actionKind === "trade") return transactionType === "trade";
  if (actionKind === "waiver_claim") return transactionType === "waiver";
  return ["waiver", "free_agent"].includes(transactionType);
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

function weeklyPlanPrompt(input: {
  request: WeeklyPlanRequest;
  context: WeeklyContextData;
  previousPlan: WeeklyPlan | null;
  previousActions: WeeklyAction[];
  watchlist: WatchlistEntry[];
}): string {
  const currentRosterId = input.context.my_team.roster_id;
  const researchCohort = selectTuesdayResearchCohort(
    input.context,
    input.watchlist,
  );
  const resolvedActions = input.previousActions
    .filter((action) => action.status !== "pending")
    .map((action) => ({
      actionKey: action.actionKey,
      title: action.title,
      status: action.status,
      note: action.dispositionNote,
    }));
  const context = {
    key: input.context.key,
    mode: input.request.mode,
    priorPlanId: input.previousPlan?.id ?? null,
    league: {
      name: input.context.league.name,
      status: input.context.league.status,
      totalRosters: input.context.league.total_rosters,
      rosterPositions: input.context.league.roster_positions,
      scoringSettings: input.context.league.scoring_settings,
      settings: input.context.league.settings,
      waiverType: input.context.league.waiver_type,
      faabStartingBudget: input.context.league.faab_starting_budget,
    },
    myTeam: {
      rosterId: currentRosterId,
      teamName:
        input.context.my_team.team_name ??
        input.context.my_team.display_name ??
        input.context.my_team.username,
      standings: input.context.my_team.standings,
      faab: input.context.my_team.faab,
      rosterPurposeBaseline: input.context.my_team.roster_purpose_baseline,
      starters: input.context.my_team.starters.map(promptPlayer),
      bench: input.context.my_team.bench.map(promptPlayer),
      reserve: input.context.my_team.reserve.map(promptPlayer),
      taxi: input.context.my_team.taxi.map(promptPlayer),
    },
    leagueTable: input.context.league_table,
    leagueRosters: input.context.league_rosters.map((roster) => ({
      rosterId: roster.roster_id,
      teamName:
        roster.team_name ?? roster.display_name ?? roster.username ?? null,
      standings: roster.standings,
      faab: roster.faab,
      players: roster.all_players.map(promptPlayer),
    })),
    recentMatchups: input.context.recent_matchups,
    currentWeekTransactions: input.context.current_week_transactions.normalized,
    trendingAdds: input.context.trending.adds.slice(0, 20),
    trendingDrops: input.context.trending.drops.slice(0, 20),
    candidateCohort: researchCohort,
    activeWatchlist: input.watchlist,
    priorManagerDispositions: resolvedActions,
    limitations: input.context.limitations,
  };

  return `Build the manager's substantial Tuesday Weekly Plan for one frozen Sleeper league-week context.

League ID: ${input.request.leagueId}
Roster ID: ${String(currentRosterId)}
Season/week: ${input.request.season} / ${String(input.request.week)}
Generation mode: ${input.request.mode}

Frozen deterministic context:
${JSON.stringify(context)}

Process:
1. Call get_weekly_context first with this league ID, roster ID, and week to verify the current Sleeper facts.
2. Treat the frozen candidateCohort as the bounded waiver research set. Do not research the entire free-agent universe.
   Every active or triggered Watch player who remains available is already reserved a place in this cohort.
3. Use live web search for decision-relevant role, opportunity, injury, depth-chart, schedule, and credible consensus context. A search result is discovery, not a source; cite the actual page used.
4. Produce one opinionated current plan and also credible alternatives. AI assists the manager; it does not run the team.

Required reasoning:
- Reassess contender, retooler, or uncertain for this week using record rank, points rank, health, depth, current scoring ability, and durable value. Surface contrary evidence.
- Make Add Now, Watch, and Exit lists. Every Exit player must be on my roster. Every Add/Watch player must be in candidateCohort.
- Audit roster purpose using start, insure, appreciate, and pop. A player may legitimately have no purpose.
- Build a valid ranked waiver ladder. Claims sharing one drop slot use the same contingencyGroup. Use percentages of starting FAAB and account for remaining budget. For non-FAAB leagues, all FAAB fields are null.
- Recommend one focused trade-market interaction, not a batch of generic offers. Do not repeat a declined/dismissed prior action unless material evidence changed, and explain the change.
- Use only exact player IDs and roster IDs present in the frozen context.
- Use unique consecutive waiver priorities starting at 1 and unique actionKey values.
- Give each source a unique non-null evidenceId such as source-1. All sourceIds must match one of those evidenceId values.
- Every material current claim needs a cited source. Sleeper-derived claims use sourceType sleeper and may use a null URL.
- Do not claim to have submitted a claim, changed a roster, or sent a trade. This app is read-only.

Return only JSON matching the supplied schema.`;
}

function weeklyPhasePrompt(input: {
  request: Exclude<WeeklyPhaseBriefRequest, { phase: "wednesday" }>;
  context: WeeklyContextData;
  plan: WeeklyPlan;
  actions: WeeklyAction[];
  priorBriefs: CurrentWeeklyBriefs;
  previousBrief: WeeklyPhaseBrief | null;
}): string {
  const roster = input.context.my_team.all_players
    .filter((player) => player.player_id !== "0")
    .map((player) => ({
      ...promptPlayer(player),
      fantasyPositions: player.fantasy_positions,
      isStarter: input.context.my_team.starters.some(
        (starter) => starter.player_id === player.player_id,
      ),
    }));
  const actionState = input.actions.map((action) => ({
    actionKey: action.actionKey,
    kind: action.kind,
    title: action.title,
    status: action.status,
    note: action.dispositionNote,
    playerIds: action.playerIds,
  }));
  const priorBriefs = Object.fromEntries(
    Object.entries(input.priorBriefs).map(([phase, brief]) => [
      phase,
      brief
        ? {
            id: brief.id,
            generatedAt: brief.generatedAt,
            headline: brief.output.headline,
            summary: brief.output.summary,
          }
        : null,
    ]),
  );
  const phaseContext =
    input.request.phase === "thursday"
      ? {
          legalLineupSlots: currentLegalLineup(input.context),
          roster,
          nextMatchup: input.context.recent_matchups.at(-1) ?? null,
        }
      : {
          legalLineupSlots: currentLegalLineup(input.context),
          roster,
          candidateCohort: input.context.available_candidate_pool.players
            .slice(0, 12)
            .map((player) => ({
              ...promptPlayer(player),
              fantasyPositions: player.fantasy_positions,
              baselineRank: player.baseline_rank,
              baselineScore: player.baseline_score,
              signals: player.signals,
            })),
        };
  const frozen = {
    key: input.context.key,
    mode: input.request.mode,
    league: {
      name: input.context.league.name,
      rosterPositions: input.context.league.roster_positions,
      scoringSettings: input.context.league.scoring_settings,
      settings: input.context.league.settings,
    },
    team: {
      rosterId: input.context.my_team.roster_id,
      standings: input.context.my_team.standings,
      faab: input.context.my_team.faab,
    },
    tuesdayPlan: {
      id: input.plan.id,
      status: input.plan.status,
      headline: input.plan.output.headline,
      summary: input.plan.output.summary,
      competitiveLane: input.plan.output.competitiveLane,
      actions: input.plan.output.actions,
      watch: input.plan.output.watch,
      refreshTriggers: input.plan.output.refreshTriggers,
    },
    actionState,
    priorBriefs,
    previousSamePhaseBrief: input.previousBrief
      ? {
          id: input.previousBrief.id,
          headline: input.previousBrief.output.headline,
          summary: input.previousBrief.output.summary,
          generatedAt: input.previousBrief.generatedAt,
        }
      : null,
    phaseContext,
    limitations: input.context.limitations,
  };

  const phaseInstructions =
    input.request.phase === "thursday"
      ? `Build a focused Thursday start/sit briefing.
- Research only the roster players needed to settle starting slots and close calls. Prefer official injury reports, team reporting, credible projections/rankings, matchup context, and weather when relevant.
- slotAssignments must include every legalLineupSlots entry exactly once, with the exact slotIndex and slot label. Every assigned player must be on the active roster and eligible for that slot. If the current lineup is already best, return it with an empty recommendedMoves array.
- recommendedMoves describes only actual changes from the current lineup. closeCalls explain meaningful toss-ups and the concrete news that would flip them. flexNotes should preserve late-swap optionality where league slots allow it.`
      : `Build a focused weekend safety check.
- Research only current starters with meaningful injury/inactive risk, unresolved Thursday close calls, and the supplied 12-player candidate cohort. Do not survey the entire player universe.
- Critical alerts must concern players on this roster. Stash candidates must come from candidateCohort and any dropPlayerId must be on this roster.
- Recommend only changes justified by news since the earlier plan. Preserve late-swap flexibility and label the actionable time window. An empty action list is correct when nothing material changed.`;

  return `${phaseInstructions}

Frozen league-week context:
${JSON.stringify(frozen)}

Grounding and safety rules:
- Treat the frozen Sleeper context as authoritative for roster ownership, availability, league rules, and IDs. Do not call Sleeper again during this turn.
- Use live web search for current evidence. A search result is discovery, not a source; cite the actual page used.
- Give every source a unique, non-null evidenceId such as source-1. Every sourceIds value must reference one of those evidenceId values.
- Use only exact player IDs and slot indexes present in the frozen context. Never invent a player, roster, or lineup slot.
- This app is read-only. Describe recommendations; never claim to have changed a lineup or added a player.
- Keep the narrative conclusion-led and candid. Surface uncertainty rather than filling gaps with guesses.

Return only JSON matching the supplied schema.`;
}

function parseThursdayOutput(input: unknown): ThursdayLineupOutput {
  const parsed = ThursdayLineupOutputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("Invalid structured Thursday briefing", parsed.error);
    throw new Error(
      "Codex returned a Thursday briefing that did not match the decision format. Try regenerating it.",
    );
  }
  return parsed.data;
}

function parseWeekendOutput(input: unknown): WeekendCheckOutput {
  const parsed = WeekendCheckOutputSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("Invalid structured weekend briefing", parsed.error);
    throw new Error(
      "Codex returned a weekend briefing that did not match the decision format. Try regenerating it.",
    );
  }
  return parsed.data;
}

function weeklySummaryPrompt(output: TuesdayPlanOutput): string {
  return `Condense the completed weekly plan below into Front Office card copy. This is an editorial step only: do not call tools, search the web, or introduce facts.

Return only JSON matching the supplied schema:
- headline: conclusion-led, specific, no more than 100 characters
- summary: at most two sentences and 220 characters, with the most actionable detail first

The app derives lane, pending-action count, and source count directly from the
validated plan after this editorial turn; do not return those fields.

Completed plan:
${JSON.stringify(output)}`;
}

function promptPlayer(player: PlayerSummary) {
  return {
    playerId: player.player_id,
    name: player.name,
    position: player.position,
    team: player.team,
    status: player.status,
    injuryStatus: player.injury_status,
    depthChartOrder: player.depth_chart_order,
    yearsExperience: player.years_exp,
    searchRank: player.search_rank,
  };
}

function lowEffortFor(codex: CodexSupervisor, settings: AiSettings): string {
  const selectedModel = codex
    .getStatus()
    .availableModels.find((model) => model.model === settings.model);
  return selectedModel?.supportedReasoningEfforts.some(
    (candidate) => candidate.effort === "low",
  )
    ? "low"
    : settings.effort;
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
