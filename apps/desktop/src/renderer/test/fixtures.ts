import type {
  AiReport,
  Bootstrap,
  CurrentWeeklyBriefs,
  Dashboard,
  DesktopPlatform,
  PlayerView,
  WeeklyAction,
  WeeklyPlan,
  WeeklyPlanBundle,
} from "@sleeper-caffeine/ipc-contract";
import { EMPTY_CURRENT_WEEKLY_BRIEFS } from "@sleeper-caffeine/ipc-contract";

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
    activeLeagueWeek: null,
    currentWeeklyPlan: null,
    weeklyActions: [],
    currentWeeklyBriefs: EMPTY_CURRENT_WEEKLY_BRIEFS,
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

export function weeklyPlanFixture(
  options: {
    status?: WeeklyPlan["status"];
    phase?: WeeklyPlanBundle["leagueWeek"]["phase"];
    planStatus?: WeeklyPlanBundle["leagueWeek"]["planStatus"];
    actions?: WeeklyAction[];
  } = {},
): WeeklyPlanBundle {
  const planId = "weekly-plan-1";
  const players: WeeklyPlan["players"] = [
    weeklyPlayer("qb-1", "Quarterback One", "QB", "BUF"),
    weeklyPlayer("rb-1", "Running Back One", "RB", "ATL"),
    weeklyPlayer("wr-1", "Receiver One", "WR", "DET"),
    weeklyPlayer("bench-1", "Replaceable Veteran", "WR", "TEN"),
    weeklyPlayer("add-rb", "Breakout Runner", "RB", "ARI"),
    weeklyPlayer("add-wr", "Rookie Receiver", "WR", "GB"),
    weeklyPlayer("watch-te", "Athletic Tight End", "TE", "LAC"),
  ];
  const sources: WeeklyPlan["output"]["sources"] = [
    {
      evidenceId: "source-sleeper",
      title: "Sleeper league snapshot",
      url: null,
      claim:
        "Breakout Runner and Rookie Receiver were available in the frozen league snapshot.",
      sourceType: "sleeper",
      fetchedAt: now,
    },
    {
      evidenceId: "source-role",
      title: "Arizona Cardinals: Week 4 role update",
      url: "https://www.azcardinals.com/",
      claim:
        "Breakout Runner earned the first opportunity after the starter's injury.",
      sourceType: "web",
      fetchedAt: now,
    },
    {
      evidenceId: "source-market",
      title: "League transaction market",
      url: null,
      claim:
        "The North Stars have receiver depth and a clear running-back need.",
      sourceType: "sleeper",
      fetchedAt: now,
    },
  ];
  const plan: WeeklyPlan = {
    id: planId,
    leagueId: "league-1",
    season: "2026",
    week: 1,
    version: 1,
    sourceSnapshotId: "snapshot-week-1",
    inputHash: "input-week-1",
    evidenceHash: "evidence-week-1",
    generatedAt: now,
    researchFreshThrough: "2026-07-18T00:00:00.000Z",
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    promptVersion: "weekly-plan-v1",
    schemaVersion: "1",
    status: options.status ?? "current",
    statusReason: null,
    players,
    rosters: [
      { rosterId: 1, teamName: "The Test Roasters", avatar: null },
      { rosterId: 2, teamName: "North Stars", avatar: null },
    ],
    microSummary: {
      headline: "Turn one replaceable roster spot into immediate RB upside",
      summary:
        "Prioritize Breakout Runner, keep the rookie receiver as your fallback, and open one targeted trade conversation.",
      competitiveLane: "contender",
      pendingActionCount: 3,
      sourceCount: sources.length,
    },
    output: {
      headline:
        "Add immediate backfield upside without weakening your weekly core",
      summary:
        "Your starters still profile like a contender, but the final bench spot is not protecting or appreciating. Make Breakout Runner the first claim, preserve Rookie Receiver as the lower-cost fallback, and test one targeted market conversation.",
      confidence: "high",
      competitiveLane: {
        lane: "contender",
        confidence: "medium",
        reasons: [
          "The starting lineup has produced a top-three points total.",
          "Running-back depth can absorb one speculative addition without creating a lineup hole.",
        ],
        contraryEvidence: [
          "Receiver depth becomes fragile if one starter misses time.",
        ],
      },
      actions: [
        {
          actionKey: "claim-breakout-runner",
          kind: "waiver_claim",
          title: "Claim Breakout Runner",
          description:
            "Drop Replaceable Veteran and bid within the 8–12% window before the role becomes obvious.",
          priority: "now",
          playerIds: ["add-rb", "bench-1"],
          rosterIds: [],
          confidence: "high",
          keyUncertainty:
            "The injured starter's practice participation could narrow the short-term runway.",
          sourceIds: ["source-sleeper", "source-role"],
        },
        {
          actionKey: "watch-athletic-tight-end",
          kind: "watch",
          title: "Watch Athletic Tight End's route share",
          description:
            "Do not spend the roster spot until his routes clear the team's veteran option.",
          priority: "monitor",
          playerIds: ["watch-te"],
          rosterIds: [],
          confidence: "medium",
          keyUncertainty:
            "One productive box score without route growth would be noise.",
          sourceIds: ["source-sleeper"],
        },
        {
          actionKey: "open-north-stars-trade",
          kind: "trade",
          title: "Ask the North Stars about receiver depth",
          description:
            "Lead with surplus running-back insurance and ask about their third receiver, without sweetening the offer yet.",
          priority: "soon",
          playerIds: ["rb-1"],
          rosterIds: [2],
          confidence: "medium",
          keyUncertainty:
            "Their manager may value depth more than the current lineup gap suggests.",
          sourceIds: ["source-market"],
        },
      ],
      waiverClaims: [
        {
          priority: 1,
          addPlayerId: "add-rb",
          dropPlayerId: "bench-1",
          contingencyGroup: "bench-upgrade",
          faabPercentMin: 8,
          faabPercentTarget: 10,
          faabPercentMax: 12,
          rationale:
            "The cleanest immediate role gain and the best fit for a contender's bench.",
          confidence: "high",
          sourceIds: ["source-sleeper", "source-role"],
        },
        {
          priority: 2,
          addPlayerId: "add-wr",
          dropPlayerId: "bench-1",
          contingencyGroup: "bench-upgrade",
          faabPercentMin: 3,
          faabPercentTarget: 5,
          faabPercentMax: 6,
          rationale:
            "The better fallback if the primary claim clears your budget ceiling.",
          confidence: "medium",
          sourceIds: ["source-sleeper"],
        },
      ],
      addNow: [
        {
          playerId: "add-rb",
          headline: "The role could arrive before the market adjusts",
          rationale:
            "A direct path to early-down work gives this roster a more useful bench outcome than veteran depth.",
          confidence: "high",
          sourceIds: ["source-role"],
        },
      ],
      watch: [
        {
          playerId: "watch-te",
          headline: "Athletic profile, incomplete deployment",
          rationale:
            "The receiving ability matters only if the routes become a stable part of the weekly plan.",
          confidence: "medium",
          sourceIds: ["source-sleeper"],
          trigger: "Runs a route on at least 60% of team dropbacks.",
        },
      ],
      exit: [
        {
          playerId: "bench-1",
          headline: "A floor you are unlikely to use",
          rationale:
            "The veteran neither starts for this roster nor offers a plausible value spike.",
          confidence: "high",
          sourceIds: ["source-sleeper"],
          dropRank: 1,
          rosterPurposes: [],
        },
      ],
      rosterAudit: [
        {
          playerId: "qb-1",
          purposes: ["start"],
          rationale: "Locked weekly starter in this scoring format.",
          confidence: "high",
        },
        {
          playerId: "rb-1",
          purposes: ["start", "insure"],
          rationale:
            "Starts now and protects the roster's strongest position group.",
          confidence: "high",
        },
        {
          playerId: "wr-1",
          purposes: ["start"],
          rationale: "Stable target volume keeps him in the lineup.",
          confidence: "high",
        },
        {
          playerId: "bench-1",
          purposes: [],
          rationale:
            "No credible starting path, insulation value, or appreciation case.",
          confidence: "high",
        },
      ],
      marketObservation: {
        headline: "One manager's imbalance lines up with yours",
        recommendation:
          "Ask the North Stars what it would take to move their third receiver.",
        partnerRosterIds: [2],
        alternatives: [
          "Offer a smaller pick swap only if they reject the depth framework.",
          "Walk away if the ask reaches a weekly starter.",
        ],
        rationale:
          "They have receiver depth, need running-back stability, and are more plausible than the generic market.",
        sourceIds: ["source-market"],
      },
      alternatives: [
        {
          headline: "Preserve receiver optionality instead",
          recommendation:
            "Make Rookie Receiver the primary claim and use a smaller bid.",
          preferableWhen:
            "You value longer-term upside over the next two weeks of running-back utility.",
          tradeoff:
            "You give up the clearer immediate role and accept more development risk.",
          playerIds: ["add-wr"],
          sourceIds: ["source-sleeper"],
        },
        {
          headline: "Hold FAAB and churn after waivers",
          recommendation:
            "Skip a paid claim and target the best unclaimed player on Wednesday.",
          preferableWhen:
            "Your league historically spends aggressively on early role changes.",
          tradeoff: "The primary target is unlikely to reach free agency.",
          playerIds: [],
          sourceIds: ["source-sleeper"],
        },
      ],
      sources,
      uncertainties: [
        "Practice participation could change the primary claim's expected runway.",
        "No third-party projection feed was required for this Tuesday roster decision.",
      ],
      refreshTriggers: [
        "The injured Arizona starter returns to full practice.",
        "A recommended addition is claimed before waivers run.",
      ],
    },
  };
  const defaultActions: WeeklyAction[] = plan.output.actions.map(
    (action, index) => ({
      id: `weekly-action-${String(index + 1)}`,
      planId,
      leagueId: plan.leagueId,
      season: plan.season,
      week: plan.week,
      actionKey: action.actionKey,
      kind: action.kind,
      status: "pending",
      title: action.title,
      description: action.description,
      priority: action.priority,
      playerIds: action.playerIds,
      rosterIds: action.rosterIds,
      dispositionNote: null,
      observedEventId: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    }),
  );
  const actions = options.actions ?? defaultActions;
  return {
    leagueWeek: {
      leagueId: plan.leagueId,
      season: plan.season,
      week: plan.week,
      phase: options.phase ?? "tuesday",
      latestSnapshotAt: now,
      currentPlanId: planId,
      competitiveLane: "contender",
      planStatus: options.planStatus ?? "current",
      meaningfulChanges: [],
      actionSummary: {
        pending: actions.filter((action) => action.status === "pending").length,
        completed: actions.filter((action) => action.status === "completed")
          .length,
        dismissed: actions.filter((action) =>
          ["dismissed", "declined", "failed", "not_possible"].includes(
            action.status,
          ),
        ).length,
      },
      updatedAt: now,
    },
    plan,
    actions,
  };
}

function weeklyPlayer(
  playerId: string,
  name: string,
  position: string,
  nflTeam: string,
): WeeklyPlan["players"][number] {
  return {
    playerId,
    name,
    position,
    nflTeam,
    injuryStatus: null,
    status: "Active",
  };
}

export function weeklyBriefsFixture(): CurrentWeeklyBriefs {
  const bundle = weeklyPlanFixture();
  if (!bundle.plan) throw new Error("Weekly fixture plan missing");
  const players = bundle.plan.players;
  const sleeperSource = {
    evidenceId: "phase-sleeper",
    title: "Sleeper weekly snapshot",
    url: null,
    claim:
      "Roster, transaction, availability, and starter state were verified.",
    sourceType: "sleeper" as const,
    fetchedAt: now,
  };
  const webSource = {
    evidenceId: "phase-web",
    title: "Official team status report",
    url: "https://www.nfl.com/injuries/",
    claim: "Receiver One remained limited in the final practice report.",
    sourceType: "web" as const,
    fetchedAt: now,
  };
  const metadata = {
    id: "phase-brief",
    version: 1,
    leagueId: bundle.plan.leagueId,
    season: bundle.plan.season,
    week: bundle.plan.week,
    sourceSnapshotId: "snapshot-week-1-phase",
    sourcePlanId: bundle.plan.id,
    inputHash: "phase-input",
    evidenceHash: "phase-evidence",
    generatedAt: now,
    dataFreshThrough: "2026-07-17T14:00:00.000Z",
    researchFreshThrough: "2026-07-18T00:00:00.000Z",
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    promptVersion: "weekly-phase-v1",
    schemaVersion: "1",
    players,
  };
  return {
    wednesday: {
      ...metadata,
      id: "wednesday-brief",
      phase: "wednesday",
      output: {
        headline:
          "Your first claim landed; one useful receiver also hit the wire",
        summary:
          "Breakout Runner joined the roster within budget. Recheck the newly dropped receiver before treating Tuesday's plan as finished.",
        confidence: "high",
        observedActions: [
          {
            actionKey: "claim-breakout-runner",
            kind: "waiver_claim",
            outcome: "completed",
            title: "Breakout Runner was added",
            description:
              "Sleeper recorded the addition and the planned veteran drop.",
            playerIds: ["add-rb", "bench-1"],
            rosterIds: [1],
            faabAmount: 10,
            sourceIds: ["phase-sleeper"],
          },
        ],
        importantDrops: [
          {
            playerId: "add-wr",
            headline: "A rookie with a cleaner path is newly available",
            rationale:
              "Another manager's waiver churn created a more interesting receiver option than the pre-waiver pool.",
            confidence: "medium",
            sourceIds: ["phase-sleeper"],
          },
        ],
        newlyFreePlayers: [
          {
            playerId: "watch-te",
            headline: "Athletic Tight End cleared waivers",
            rationale:
              "He is free to add, but the route threshold still has not been met.",
            confidence: "medium",
            sourceIds: ["phase-sleeper"],
            availableSince: now,
            recommendedAction: "watch",
          },
        ],
        congestion: [
          {
            position: "RB",
            headline: "The bench now carries three similar contingency backs",
            rationale:
              "The successful claim improved upside but concentrated too much of the bench in one archetype.",
            recommendation:
              "Keep the highest-upside two and use the next move on receiver insulation.",
            playerIds: ["rb-1", "add-rb"],
            confidence: "medium",
            sourceIds: ["phase-sleeper"],
          },
        ],
        sources: [sleeperSource],
        uncertainties: [
          "Sleeper records outcomes, but it cannot explain every opposing manager's claim order.",
        ],
      },
    },
    thursday: {
      ...metadata,
      id: "thursday-brief",
      phase: "thursday",
      output: {
        headline: "Start the rookie in FLEX, but keep the late window open",
        summary:
          "The legal lineup has one worthwhile change. Rookie Receiver earns the FLEX spot while the late-game placement preserves an injury pivot.",
        confidence: "medium",
        slotAssignments: [
          { slotIndex: 0, slot: "QB", playerId: "qb-1" },
          { slotIndex: 1, slot: "RB", playerId: "rb-1" },
          { slotIndex: 2, slot: "WR", playerId: "wr-1" },
          { slotIndex: 3, slot: "FLEX", playerId: "add-wr" },
        ],
        recommendedMoves: [
          {
            actionKey: "start-rookie-flex",
            playerId: "add-wr",
            replacePlayerId: "bench-1",
            fromSlotIndex: null,
            toSlotIndex: 3,
            rationale:
              "The rookie's role and game environment create the better ceiling without sacrificing lineup flexibility.",
            confidence: "medium",
            sourceIds: ["phase-sleeper", "phase-web"],
          },
        ],
        closeCalls: [
          {
            slotIndex: 3,
            chosenPlayerId: "add-wr",
            alternativePlayerId: "bench-1",
            rationale:
              "The rookie wins on role growth, but the decision remains sensitive to final inactive news.",
            projectedPointDelta: 1.8,
            flipConditions: [
              "Flip back if Rookie Receiver is unexpectedly limited before kickoff.",
            ],
            confidence: "medium",
            sourceIds: ["phase-web"],
          },
        ],
        flexNotes: [
          {
            headline: "Keep the latest player in FLEX",
            rationale:
              "The late kickoff preserves the widest replacement set if final status news changes.",
            slotIndexes: [3],
            playerIds: ["add-wr"],
          },
        ],
        sources: [sleeperSource, webSource],
        uncertainties: [
          "Final inactives remain the decisive unresolved input.",
        ],
      },
    },
    weekend: {
      ...metadata,
      id: "weekend-brief",
      phase: "weekend",
      output: {
        headline:
          "One status check matters; the final bench spot can still compound",
        summary:
          "Confirm Receiver One's active status, preserve the late FLEX, and use the last churnable spot on an asymmetric stash only after early games lock.",
        confidence: "medium",
        criticalStatusAlerts: [
          {
            playerId: "wr-1",
            severity: "warning",
            status: "Questionable",
            headline: "Receiver One needs a final active check",
            rationale:
              "Limited practice work leaves a real, but not yet critical, inactive risk.",
            recommendedAction:
              "Check official inactives before the early window locks.",
            sourceIds: ["phase-web"],
          },
        ],
        flexibilityNotes: [
          {
            headline: "Leave the late player in FLEX",
            rationale:
              "The current slot order preserves both receiver and running-back pivots.",
            playerIds: ["add-wr"],
            slotIndexes: [3],
          },
        ],
        stashCandidates: [
          {
            playerId: "watch-te",
            headline: "A free final-window bet on athletic upside",
            rationale:
              "If the roster spot remains unused after early games, the tight end offers a more asymmetric outcome than static depth.",
            confidence: "medium",
            sourceIds: ["phase-sleeper"],
            dropPlayerId: "bench-1",
            window: "sunday_late",
            trigger:
              "The current bench player is no longer needed as an injury pivot.",
          },
        ],
        actions: [
          {
            actionKey: "check-receiver-status",
            kind: "inactive_check",
            title: "Confirm Receiver One is active",
            description:
              "Use the official inactive list before accepting the current lineup.",
            priority: "now",
            playerIds: ["wr-1"],
            confidence: "high",
            sourceIds: ["phase-web"],
          },
        ],
        sources: [sleeperSource, webSource],
        uncertainties: [
          "The official inactive list is not available until game day.",
        ],
      },
    },
  };
}
