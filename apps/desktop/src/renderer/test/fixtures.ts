import type {
  AiReport,
  Bootstrap,
  Dashboard,
  DesktopPlatform,
  PlayerView,
} from "@sleeper-caffeine/ipc-contract";

const now = "2026-07-17T12:00:00.000Z";

export function playerFixture(
  playerId: string,
  name: string,
  position: string,
  rosterSlot = position,
): PlayerView {
  return {
    playerId,
    name,
    position,
    nflTeam: "TEST",
    injuryStatus: null,
    status: "Active",
    isStarter: true,
    isReserve: false,
    isTaxi: false,
    rosterSlot,
  };
}

export function dashboardFixture(): Dashboard {
  const starters = [
    playerFixture("qb-1", "Quarterback One", "QB"),
    playerFixture("rb-1", "Running Back One", "RB"),
    playerFixture("rb-2", "Running Back Two", "RB"),
    playerFixture("wr-1", "Receiver One", "WR"),
    playerFixture("wr-2", "Receiver Two", "WR"),
    playerFixture("te-1", "Tight End One", "TE"),
    playerFixture("flex-1", "Flex Player One", "WR", "FLEX"),
    playerFixture("flex-2", "Flex Player Two", "RB", "FLEX"),
  ];
  return {
    league: {
      leagueId: "league-1",
      name: "Sleeper Test League With A Deliberately Long Name",
      season: "2026",
      rosterId: 1,
      userId: "user-1",
      teamName: "The Test Roasters",
      avatar: null,
      lastRefreshedAt: now,
      isActive: true,
    },
    capturedAt: now,
    week: 1,
    leagueStatus: "in_season",
    scoringLabel: "PPR",
    rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX"],
    starters,
    bench: [playerFixture("bench-1", "Bench Player", "WR")],
    reserve: [],
    taxi: [],
    record: { wins: 2, losses: 1, ties: 0, pointsFor: 412.6 },
    pickInventory: null,
    warnings: [],
    draft: null,
    nextMatchup: {
      week: 4,
      matchupId: 1,
      myPoints: null,
      opponent: {
        rosterId: 2,
        teamName: "The Extremely Long Opponent Name",
        avatar: null,
        record: "1-2",
        points: null,
      },
    },
  };
}

export function bootstrapFixture(
  platform: DesktopPlatform = "darwin",
): Bootstrap {
  const dashboard = dashboardFixture();
  return {
    platform,
    leagues: [dashboard.league],
    activeDashboard: dashboard,
    reports: [],
    chatMessages: [],
    chatHasMore: false,
    codex: {
      state: "ready",
      binaryPath: "/usr/local/bin/codex",
      version: "test",
      email: "analyst@example.com",
      planType: "test",
      errorMessage: null,
      availableModels: [],
    },
    mcp: {
      connectedSessions: 0,
      endpoint: "http://127.0.0.1:9312/mcp",
      errorMessage: null,
      host: "127.0.0.1",
      port: 9312,
      state: "running",
    },
    aiSettings: { model: "gpt-5.6-terra", effort: "low" },
  };
}

export function reportFixture(overrides: Partial<AiReport> = {}): AiReport {
  return {
    id: "report-1",
    leagueId: "league-1",
    kind: "team_analysis",
    generatedAt: now,
    snapshotAt: now,
    invalidated: false,
    microSummary: null,
    draftPlan: null,
    payload: {
      headline: "A strong core with one obvious pressure point",
      summary:
        "The roster has enough weekly stability to contend while preserving room for one targeted improvement.",
      confidence: "high",
      cards: [
        {
          title: "Core strength",
          body: "Your starters provide a dependable weekly floor.",
          bullets: ["Strong running backs"],
          tone: "positive",
        },
      ],
      actions: [
        {
          title: "Add receiver depth",
          description: "Use the next flexible roster spot on upside.",
          priority: "soon",
        },
      ],
      sources: [
        {
          title: "Sleeper league snapshot",
          url: null,
          claim: "Roster and league settings verified.",
          sourceType: "sleeper",
        },
      ],
      caveats: ["Monitor training camp roles."],
    },
    ...overrides,
  };
}
