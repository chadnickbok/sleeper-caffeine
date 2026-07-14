import { EventEmitter } from "node:events";
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
  type PlayerSummary,
  type RosterView,
  type ToolWarning,
} from "@sleeper-caffeine/core";
import { LocalMcpBridge } from "@sleeper-caffeine/mcp";
import { CodexSupervisor } from "@sleeper-caffeine/codex-runtime";
import {
  ReportPayloadSchema,
  REPORT_OUTPUT_JSON_SCHEMA,
  type AiReport,
  type Bootstrap,
  type ChatMessage,
  type Dashboard,
  type DraftView,
  type LeaguePreview,
  type PlayerView,
  type ReportKind,
  type RuntimeEvent,
  type SavedLeague,
} from "@sleeper-caffeine/ipc-contract";
import { LocalStore } from "./store.js";

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
    return {
      leagues: this.store.listLeagues(),
      activeDashboard: active ? this.store.getDashboard(active.leagueId) : null,
      reports: active ? this.store.getReports(active.leagueId) : [],
      chatMessages: active ? this.store.listChatMessages(active.leagueId) : [],
      codex: this.codex?.getStatus() ?? {
        state: "starting",
        binaryPath: null,
        version: null,
        email: null,
        planType: null,
        errorMessage: null,
      },
      mcp: this.mcp.getStatus(),
    };
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
    const dashboard = this.requireDashboard();
    const purpose = `report:${kind}`;
    const result = await this.requireCodex().runTurn({
      threadId: this.store.getThread(dashboard.league.leagueId, purpose),
      prompt: reportPrompt(kind, dashboard),
      outputSchema: REPORT_OUTPUT_JSON_SCHEMA,
      onDelta: (text) => this.send({ type: "report_delta", kind, text }),
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
    const report = this.store.saveReport({
      leagueId: dashboard.league.leagueId,
      kind,
      snapshotAt: dashboard.capturedAt,
      payload,
    });
    this.send({ type: "bootstrap_changed" });
    return report;
  }

  async sendChat(message: string): Promise<ChatMessage> {
    const dashboard = this.requireDashboard();
    const clean = message.trim();
    if (!clean) throw new Error("Ask the analyst a question first");
    this.store.saveChatMessage(dashboard.league.leagueId, "user", clean);
    const result = await this.requireCodex().runTurn({
      threadId: this.store.getThread(dashboard.league.leagueId, "conversation"),
      prompt: `Active Sleeper league: ${dashboard.league.leagueId}. My Sleeper user ID: ${dashboard.league.userId}. My roster ID: ${String(dashboard.league.rosterId)}.\n\n${clean}`,
      onDelta: (text) => this.send({ type: "chat_delta", text }),
    });
    this.store.saveThread(
      dashboard.league.leagueId,
      "conversation",
      result.threadId,
    );
    const response = this.store.saveChatMessage(
      dashboard.league.leagueId,
      "assistant",
      result.text.trim(),
    );
    this.send({ type: "bootstrap_changed" });
    return response;
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
    const draft = await buildDraftView(
      drafts,
      saved,
      directory.players,
      this.api,
    );
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

async function buildDraftView(
  drafts: Draft[],
  saved: SavedLeague,
  players: ReadonlyMap<string, PlayerSummary>,
  api: SleeperApi,
): Promise<DraftView> {
  const draft = [...drafts].sort(
    (a, b) =>
      draftPriority(a.status) - draftPriority(b.status) ||
      (b.start_time ?? 0) - (a.start_time ?? 0),
  )[0];
  if (!draft) return null;
  let picks: DraftPick[] = [];
  try {
    picks = await api.getDraftPicks(draft.draft_id);
  } catch {
    // Pre-draft leagues can legitimately have no picks yet.
  }
  const teams = numeric(draft.settings["teams"]);
  const rounds = numeric(draft.settings["rounds"]);
  const mySlot = draft.draft_order?.[saved.userId] ?? null;
  const upcoming: number[] = [];
  if (teams && rounds && mySlot) {
    const picked = new Set(picks.map((pick) => pick.pick_no));
    for (let round = 1; round <= rounds; round += 1) {
      const slot =
        draft.type === "snake" && round % 2 === 0 ? teams - mySlot + 1 : mySlot;
      const pickNo = (round - 1) * teams + slot;
      if (!picked.has(pickNo)) upcoming.push(pickNo);
    }
  }
  return {
    draftId: draft.draft_id,
    status: draft.status,
    type: draft.type,
    startTime: draft.start_time ?? null,
    rounds,
    teams,
    picks: picks.map((pick) => ({
      pickNo: pick.pick_no,
      round: pick.round,
      draftSlot: pick.draft_slot,
      rosterId: pick.roster_id ?? null,
      player: players.has(pick.player_id)
        ? toPlayer(players.get(pick.player_id) as PlayerSummary)
        : null,
    })),
    myUpcomingPickNumbers: upcoming,
  };
}

function draftPriority(status: string): number {
  if (status === "drafting" || status === "in_progress") return 0;
  if (status === "pre_draft") return 1;
  return 2;
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
  return `League ID: ${dashboard.league.leagueId}\nMy user ID: ${dashboard.league.userId}\nMy roster ID: ${String(dashboard.league.rosterId)}\nSnapshot captured: ${dashboard.capturedAt}\n\n${task}\n\nCall the relevant Sleeper MCP tools first. Then use live web search for current player context. Return only JSON matching the supplied schema. Every material current-news claim should have a source entry; Sleeper-derived claims should be labeled sourceType sleeper. A search result is discovery, not a source: cite the actual page you relied on.`;
}
