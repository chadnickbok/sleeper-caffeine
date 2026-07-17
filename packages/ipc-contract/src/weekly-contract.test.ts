import { describe, expect, it } from "vitest";
import {
  THURSDAY_LINEUP_OUTPUT_JSON_SCHEMA,
  TUESDAY_PLAN_OUTPUT_JSON_SCHEMA,
  TuesdayPlanOutputSchema,
  WEEKEND_CHECK_OUTPUT_JSON_SCHEMA,
  WEDNESDAY_AFTERMATH_OUTPUT_JSON_SCHEMA,
  WeekendCheckOutputSchema,
  WednesdayAftermathOutputSchema,
  WeeklyPhaseBriefSchema,
  WeeklyPlanSchema,
  ThursdayLineupOutputSchema,
  supportsWeeklyManagement,
} from "./index.js";

describe("weekly management league eligibility", () => {
  it("only enables weekly work for supported Sleeper lifecycle states", () => {
    expect(
      ["in_season", "post_season", "complete"].map(supportsWeeklyManagement),
    ).toEqual([true, true, true]);
    expect(
      ["pre_draft", "drafting", "paused", "unknown"].map(
        supportsWeeklyManagement,
      ),
    ).toEqual([false, false, false, false]);
  });
});

const output = {
  headline: "Improve the last roster spot",
  summary: "Make one measured claim and preserve the core lineup.",
  confidence: "medium",
  competitiveLane: {
    lane: "contender",
    confidence: "medium",
    reasons: ["Strong points profile"],
    contraryEvidence: [],
  },
  actions: [],
  waiverClaims: [],
  addNow: [],
  watch: [],
  exit: [],
  rosterAudit: [],
  marketObservation: {
    headline: "Monitor the receiver market",
    recommendation: "Ask about one veteran receiver.",
    partnerRosterIds: [],
    alternatives: [],
    rationale: "The roster has surplus running-back depth.",
    sourceIds: [],
  },
  alternatives: [],
  sources: [],
  uncertainties: [],
  refreshTriggers: [],
} as const;

describe("Tuesday weekly contracts", () => {
  it("keeps the app-server schema strict at every structured object boundary", () => {
    expect(TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(
      TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.properties.competitiveLane
        .additionalProperties,
    ).toBe(false);
    expect(
      TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.properties.actions.items
        .additionalProperties,
    ).toBe(false);
    expect(
      TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.properties.waiverClaims.items
        .additionalProperties,
    ).toBe(false);
    expect(
      TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.properties.marketObservation
        .additionalProperties,
    ).toBe(false);
    expect(
      TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.properties.sources.items.properties
        .evidenceId,
    ).toEqual({ type: "string", minLength: 1 });
    expect(
      TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.properties.waiverClaims.items.properties
        .sourceIds.minItems,
    ).toBe(1);
    expect(
      TUESDAY_PLAN_OUTPUT_JSON_SCHEMA.properties.actions.items.properties
        .sourceIds.minItems,
    ).toBe(1);
  });

  it("separates model output from renderer-safe canonical catalogs", () => {
    expect(TuesdayPlanOutputSchema.parse(output)).toEqual(output);
    const plan = WeeklyPlanSchema.parse({
      id: "plan-1",
      leagueId: "league-1",
      season: "2026",
      week: 2,
      version: 1,
      sourceSnapshotId: "snapshot-1",
      inputHash: "input-1",
      evidenceHash: "evidence-1",
      generatedAt: "2026-09-15T12:00:00.000Z",
      researchFreshThrough: "2026-09-18T12:00:00.000Z",
      model: "gpt-test",
      reasoningEffort: "high",
      promptVersion: "1",
      schemaVersion: "1",
      status: "current",
      statusReason: null,
      output,
      players: [
        {
          playerId: "player-1",
          name: "Player One",
          position: "WR",
          nflTeam: "SEA",
          injuryStatus: null,
          status: "Active",
        },
      ],
      rosters: [{ rosterId: 3, teamName: "A Trade Partner", avatar: null }],
      microSummary: null,
    });
    expect(plan.players[0]?.name).toBe("Player One");
    expect(plan.output).not.toHaveProperty("players");
  });
});

const source = {
  evidenceId: "evidence-1",
  title: "Official status report",
  url: "https://example.com/status",
  claim: "Player One returned to full practice.",
  sourceType: "web",
  fetchedAt: "2026-09-16T12:00:00.000Z",
} as const;

const wednesdayOutput = {
  headline: "The primary claim landed",
  summary: "Review one surprise drop before closing the waiver window.",
  confidence: "high",
  observedActions: [
    {
      actionKey: "claim-player-2",
      kind: "waiver_claim",
      outcome: "completed",
      title: "Player Two joined the roster",
      description: "The seven-dollar bid cleared overnight.",
      playerIds: ["player-2"],
      rosterIds: [1],
      faabAmount: 7,
      sourceIds: ["evidence-1"],
    },
  ],
  importantDrops: [],
  newlyFreePlayers: [
    {
      playerId: "player-3",
      headline: "A useful receiver is unexpectedly free",
      rationale: "The role is stronger than the end of your bench.",
      confidence: "medium",
      sourceIds: ["evidence-1"],
      availableSince: "2026-09-16T08:00:00.000Z",
      recommendedAction: "watch",
    },
  ],
  congestion: [],
  sources: [source],
  uncertainties: ["The dropped player's injury status is unresolved."],
} as const;

const thursdayOutput = {
  headline: "Preserve the flex while starting the stronger role",
  summary: "One receiver swap improves the lineup without sacrificing options.",
  confidence: "medium",
  slotAssignments: [
    { slotIndex: 0, slot: "QB", playerId: "player-qb" },
    { slotIndex: 1, slot: "WR", playerId: "player-2" },
  ],
  recommendedMoves: [
    {
      actionKey: "start-player-2",
      playerId: "player-2",
      replacePlayerId: "player-1",
      fromSlotIndex: null,
      toSlotIndex: 1,
      rationale: "Player Two has the more stable route role.",
      confidence: "medium",
      sourceIds: ["evidence-1"],
    },
  ],
  closeCalls: [
    {
      slotIndex: 1,
      chosenPlayerId: "player-2",
      alternativePlayerId: "player-1",
      rationale: "The roles are close enough to monitor practice news.",
      projectedPointDelta: 1.4,
      flipConditions: ["Player Two is limited Friday"],
      confidence: "medium",
      sourceIds: ["evidence-1"],
    },
  ],
  flexNotes: [
    {
      headline: "Keep the late player in FLEX",
      rationale: "That preserves the widest set of late-swap options.",
      slotIndexes: [4],
      playerIds: ["player-4"],
    },
  ],
  sources: [source],
  uncertainties: [],
} as const;

const weekendOutput = {
  headline: "One inactive check remains",
  summary: "The lineup is stable; keep the final bench spot flexible.",
  confidence: "high",
  criticalStatusAlerts: [
    {
      playerId: "player-2",
      severity: "warning",
      status: "questionable",
      headline: "Confirm Player Two is active",
      rationale: "He was limited Friday and plays in the late window.",
      recommendedAction: "Check official inactives before the early games.",
      sourceIds: ["evidence-1"],
    },
  ],
  flexibilityNotes: [],
  stashCandidates: [
    {
      playerId: "player-5",
      headline: "Reserve-back upside is still available",
      rationale: "He would inherit a useful role after one plausible event.",
      confidence: "medium",
      sourceIds: ["evidence-1"],
      dropPlayerId: null,
      window: "sunday_late",
      trigger: "A bench spot remains open after the early window.",
    },
  ],
  actions: [
    {
      actionKey: "inactive-check-player-2",
      kind: "inactive_check",
      title: "Check Player Two's status",
      description: "Confirm the official inactive list before lock.",
      priority: "now",
      playerIds: ["player-2"],
      confidence: "high",
      sourceIds: ["evidence-1"],
    },
  ],
  sources: [source],
  uncertainties: [],
} as const;

function expectEveryObjectToBeStrict(schema: unknown): void {
  if (Array.isArray(schema)) {
    for (const value of schema) expectEveryObjectToBeStrict(value);
    return;
  }
  if (!schema || typeof schema !== "object") return;
  const record = schema as Record<string, unknown>;
  if (record.type === "object") expect(record.additionalProperties).toBe(false);
  for (const value of Object.values(record)) expectEveryObjectToBeStrict(value);
}

describe("later weekly phase contracts", () => {
  it("parses each domain-specific app-server output", () => {
    expect(WednesdayAftermathOutputSchema.parse(wednesdayOutput)).toEqual(
      wednesdayOutput,
    );
    expect(ThursdayLineupOutputSchema.parse(thursdayOutput)).toEqual(
      thursdayOutput,
    );
    expect(WeekendCheckOutputSchema.parse(weekendOutput)).toEqual(
      weekendOutput,
    );
  });

  it("keeps every app-server object boundary strict", () => {
    expectEveryObjectToBeStrict(WEDNESDAY_AFTERMATH_OUTPUT_JSON_SCHEMA);
    expectEveryObjectToBeStrict(THURSDAY_LINEUP_OUTPUT_JSON_SCHEMA);
    expectEveryObjectToBeStrict(WEEKEND_CHECK_OUTPUT_JSON_SCHEMA);
  });

  it("uses the phase discriminator to keep persisted outputs coherent", () => {
    const metadata = {
      id: "brief-1",
      leagueId: "league-1",
      season: "2026",
      week: 2,
      version: 1,
      sourceSnapshotId: "snapshot-1",
      sourcePlanId: "plan-1",
      inputHash: "input-1",
      evidenceHash: "evidence-1",
      generatedAt: "2026-09-16T12:00:00.000Z",
      dataFreshThrough: "2026-09-16T12:00:00.000Z",
      researchFreshThrough: "2026-09-18T12:00:00.000Z",
      model: "gpt-test",
      reasoningEffort: "high",
      promptVersion: "1",
      schemaVersion: "1",
      players: [],
    };
    expect(
      WeeklyPhaseBriefSchema.parse({
        ...metadata,
        phase: "wednesday",
        output: wednesdayOutput,
      }).phase,
    ).toBe("wednesday");
    expect(() =>
      WeeklyPhaseBriefSchema.parse({
        ...metadata,
        phase: "thursday",
        output: wednesdayOutput,
      }),
    ).toThrow();
  });
});
