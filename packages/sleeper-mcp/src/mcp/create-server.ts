import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AvailablePlayersInputSchema,
  DraftSnapshotInputSchema,
  getAvailablePlayers,
  getDraftSnapshot,
  getLeagueHistory,
  getMatchupContext,
  getTeamSnapshot,
  getTradeContext,
  getWeeklyContext,
  LeagueHistoryInputSchema,
  MatchupContextInputSchema,
  TeamSnapshotInputSchema,
  TradeContextInputSchema,
  WeeklyContextInputSchema,
  type DomainDependencies,
} from "@sleeper-caffeine/core";
import { runTool } from "./response.js";
import {
  AvailablePlayersOutputSchema,
  DraftSnapshotOutputSchema,
  LeagueHistoryOutputSchema,
  MatchupContextOutputSchema,
  TeamSnapshotOutputSchema,
  TradeContextOutputSchema,
  WeeklyContextOutputSchema,
} from "./schemas.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createServer(dependencies: DomainDependencies): McpServer {
  const server = new McpServer(
    { name: "sleeper-mcp", version: "0.1.0" },
    {
      instructions:
        "Sleeper tools are read-only. Player availability is derived only from absence on league rosters and does not prove waiver clearance. Use separate current sources for news, injuries, projections, and weather. Never claim these tools changed a lineup, waiver, or trade.",
    },
  );

  server.registerTool(
    "get_draft_snapshot",
    {
      title: "Get live Sleeper draft snapshot",
      description:
        "Get the factual live draft board, completed picks, current pick, board hash, and a roster's remaining owned picks. Use this before draft advice.",
      inputSchema: DraftSnapshotInputSchema,
      outputSchema: DraftSnapshotOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) =>
      runTool(
        () => getDraftSnapshot(dependencies, input),
        (data) => {
          const draft = data["draft"] as Record<string, unknown> | null;
          const currentPick = draft?.["current_pick_no"];
          return draft
            ? `Loaded live draft snapshot at pick ${typeof currentPick === "number" ? String(currentPick) : "complete"}.`
            : "No Sleeper draft is attached to this league.";
        },
      ),
  );

  server.registerTool(
    "get_team_snapshot",
    {
      title: "Get Sleeper team snapshot",
      description:
        "Get a manager's current league settings, joined roster, weekly matchup, and traded-pick context from Sleeper. Call this before roster advice.",
      inputSchema: TeamSnapshotInputSchema,
      outputSchema: TeamSnapshotOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) =>
      runTool(
        () => getTeamSnapshot(dependencies, input),
        (data) => `Loaded team snapshot for week ${String(data["week"])}.`,
      ),
  );

  server.registerTool(
    "get_available_players",
    {
      title: "Get roster-available Sleeper players",
      description:
        "List NFL players absent from every roster in a Sleeper league, optionally filtered and ranked by Sleeper trending adds or search rank. This is roster availability, not waiver clearance.",
      inputSchema: AvailablePlayersInputSchema,
      outputSchema: AvailablePlayersOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) =>
      runTool(
        () => getAvailablePlayers(dependencies, input),
        (data) =>
          `Found ${String(data["total_matching"])} roster-available players before the result limit.`,
      ),
  );

  server.registerTool(
    "get_matchup_context",
    {
      title: "Get Sleeper matchup context",
      description:
        "Get both sides of a weekly Sleeper matchup with joined starters, bench, reserve, taxi, records, points, scoring, and roster slots. It does not provide projections or current news.",
      inputSchema: MatchupContextInputSchema,
      outputSchema: MatchupContextOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) =>
      runTool(
        () => getMatchupContext(dependencies, input),
        (data) => `Loaded matchup context for week ${String(data["week"])}.`,
      ),
  );

  server.registerTool(
    "get_trade_context",
    {
      title: "Get Sleeper trade context",
      description:
        "Get joined rosters, the traded-picks ledger, draft metadata, and optionally selected weeks of transaction history for evaluating trades in a Sleeper league.",
      inputSchema: TradeContextInputSchema,
      outputSchema: TradeContextOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) =>
      runTool(
        () => getTradeContext(dependencies, input),
        () =>
          "Loaded league rosters, traded picks, drafts, and requested transactions.",
      ),
  );

  server.registerTool(
    "get_weekly_context",
    {
      title: "Get Sleeper weekly management context",
      description:
        "Get one manager's joined roster plus every league roster, recent matchups, complete current-week transactions, FAAB and standings context, Sleeper trending adds and drops, and a bounded deterministic available-player cohort. Use this before weekly waiver, roster, or market advice.",
      inputSchema: WeeklyContextInputSchema,
      outputSchema: WeeklyContextOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) =>
      runTool(
        () => getWeeklyContext(dependencies, input),
        (data) => {
          const key = data["key"] as Record<string, unknown>;
          return `Loaded weekly context for week ${String(key["week"])}.`;
        },
      ),
  );

  server.registerTool(
    "get_league_history",
    {
      title: "Get Sleeper league history",
      description:
        "Follow a Sleeper league's previous_league_id chain and summarize up to ten seasons of teams, records, settings, and obtainable champions.",
      inputSchema: LeagueHistoryInputSchema,
      outputSchema: LeagueHistoryOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) =>
      runTool(
        () => getLeagueHistory(dependencies, input),
        (data) =>
          `Loaded ${String(Array.isArray(data["seasons"]) ? data["seasons"].length : 0)} league seasons.`,
      ),
  );

  return server;
}
