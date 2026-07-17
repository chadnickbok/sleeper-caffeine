import { z } from "zod/v4";

export const IPC_CHANNELS = {
  bootstrap: "app:bootstrap",
  clearLocalData: "settings:clear-local-data",
  codexLogin: "codex:login",
  codexLogout: "codex:logout",
  generateReport: "ai:generate-report",
  loadChatHistory: "ai:load-chat-history",
  openExternal: "shell:open-external",
  previewLeague: "league:preview",
  refreshActiveLeague: "league:refresh-active",
  runtimeEvent: "runtime:event",
  saveLeague: "league:save",
  sendChat: "ai:send-chat",
  setActiveLeague: "league:set-active",
  loadWeeklyPlan: "weekly:load-plan",
  generateWeeklyPlan: "weekly:generate-plan",
  loadWeeklyPhaseBrief: "weekly:load-phase-brief",
  generateWeeklyPhaseBrief: "weekly:generate-phase-brief",
  updateWeeklyAction: "weekly:update-action",
  updateAiSettings: "settings:update-ai",
  toggleDraftCandidatePin: "draft:toggle-candidate-pin",
} as const;

export const DEFAULT_AI_SETTINGS = {
  model: "gpt-5.6-terra",
  effort: "low",
} as const;

export const WEEKLY_MANAGEMENT_LEAGUE_STATUSES = [
  "in_season",
  "post_season",
  "complete",
] as const;

export function supportsWeeklyManagement(status: string): boolean {
  return (WEEKLY_MANAGEMENT_LEAGUE_STATUSES as readonly string[]).includes(
    status,
  );
}

export const DesktopPlatformSchema = z.enum(["darwin", "win32", "linux"]);
export type DesktopPlatform = z.infer<typeof DesktopPlatformSchema>;

export const ReportKindSchema = z.enum([
  "team_analysis",
  "trade_suggestions",
  "draft_candidates",
]);
export type ReportKind = z.infer<typeof ReportKindSchema>;

export const PlayerViewSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  status: z.string().nullable(),
  isStarter: z.boolean(),
  isReserve: z.boolean(),
  isTaxi: z.boolean(),
  rosterSlot: z.string().nullable(),
});
export type PlayerView = z.infer<typeof PlayerViewSchema>;

export const TeamChoiceSchema = z.object({
  rosterId: z.number().int(),
  userId: z.string(),
  username: z.string().nullable(),
  displayName: z.string(),
  teamName: z.string(),
  avatar: z.string().nullable(),
  record: z.string(),
});
export type TeamChoice = z.infer<typeof TeamChoiceSchema>;

export const LeaguePreviewSchema = z.object({
  leagueId: z.string(),
  name: z.string(),
  season: z.string(),
  status: z.string(),
  totalRosters: z.number(),
  teams: z.array(TeamChoiceSchema),
});
export type LeaguePreview = z.infer<typeof LeaguePreviewSchema>;

export const SavedLeagueSchema = z.object({
  leagueId: z.string(),
  name: z.string(),
  season: z.string(),
  rosterId: z.number().int(),
  userId: z.string(),
  teamName: z.string(),
  avatar: z.string().nullable(),
  lastRefreshedAt: z.string().nullable(),
  isActive: z.boolean(),
});
export type SavedLeague = z.infer<typeof SavedLeagueSchema>;

export const DraftPickViewSchema = z.object({
  pickNo: z.number().int(),
  round: z.number().int(),
  draftSlot: z.number().int(),
  rosterId: z.number().int().nullable(),
  isKeeper: z.boolean(),
  player: PlayerViewSchema.nullable(),
});

export const DraftTeamViewSchema = z.object({
  draftSlot: z.number().int(),
  rosterId: z.number().int().nullable(),
  teamName: z.string(),
  avatar: z.string().nullable(),
  isMine: z.boolean(),
});

export const DraftBoardCellSchema = z.object({
  pickNo: z.number().int(),
  round: z.number().int(),
  draftSlot: z.number().int(),
  originalRosterId: z.number().int().nullable(),
  ownerRosterId: z.number().int().nullable(),
  ownerTeamName: z.string().nullable(),
  isMine: z.boolean(),
  isTraded: z.boolean(),
  isOnClock: z.boolean(),
  pick: DraftPickViewSchema.nullable(),
});

export const DraftCandidateViewSchema = z.object({
  rank: z.number().int(),
  player: PlayerViewSchema,
  marketRank: z.number().int().nullable(),
  positionRank: z.number().int(),
  score: z.number().int(),
  fitLabel: z.enum(["primary_fit", "ceiling", "value", "luxury"]),
  rationale: z.string(),
  pinned: z.boolean(),
  scoreBreakdown: z.object({
    market: z.number().int(),
    rosterFit: z.number().int(),
    scarcity: z.number().int(),
    pickWindow: z.number().int(),
    upside: z.number().int(),
  }),
});
export type DraftCandidateView = z.infer<typeof DraftCandidateViewSchema>;

export const DraftViewSchema = z
  .object({
    draftId: z.string(),
    status: z.enum(["pending", "scheduled", "live", "complete", "unsupported"]),
    sourceStatus: z.string(),
    type: z.string(),
    startTime: z.number().nullable(),
    lastPicked: z.number().nullable(),
    rounds: z.number().nullable(),
    teams: z.number().nullable(),
    totalPicks: z.number().int().nullable(),
    currentPickNo: z.number().int().nullable(),
    boardHash: z.string(),
    picks: z.array(DraftPickViewSchema),
    draftTeams: z.array(DraftTeamViewSchema),
    board: z.array(DraftBoardCellSchema),
    myUpcomingPickNumbers: z.array(z.number().int()),
    candidatePoolMode: z.enum(["rookies", "all"]),
    candidates: z.array(DraftCandidateViewSchema),
  })
  .nullable();
export type DraftView = z.infer<typeof DraftViewSchema>;

export const NextMatchupSchema = z
  .object({
    week: z.number().int(),
    matchupId: z.number().int(),
    myPoints: z.number().nullable(),
    opponent: z.object({
      rosterId: z.number().int(),
      teamName: z.string(),
      avatar: z.string().nullable(),
      record: z.string(),
      points: z.number().nullable(),
    }),
  })
  .nullable();
export type NextMatchup = z.infer<typeof NextMatchupSchema>;

export const DashboardSchema = z.object({
  league: SavedLeagueSchema,
  capturedAt: z.string(),
  week: z.number().int(),
  leagueStatus: z.string(),
  scoringLabel: z.string(),
  rosterPositions: z.array(z.string()),
  starters: z.array(PlayerViewSchema),
  bench: z.array(PlayerViewSchema),
  reserve: z.array(PlayerViewSchema),
  taxi: z.array(PlayerViewSchema),
  record: z.object({
    wins: z.number(),
    losses: z.number(),
    ties: z.number(),
    pointsFor: z.number(),
  }),
  pickInventory: z.unknown(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  draft: DraftViewSchema,
  nextMatchup: NextMatchupSchema.optional(),
});
export type Dashboard = z.infer<typeof DashboardSchema>;

export const ReportPayloadSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  cards: z.array(
    z.object({
      title: z.string(),
      tone: z.enum(["positive", "warning", "neutral", "critical"]),
      body: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  actions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["now", "soon", "monitor"]),
    }),
  ),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string().url().nullable(),
      claim: z.string(),
      sourceType: z.enum(["sleeper", "web"]),
    }),
  ),
  caveats: z.array(z.string()),
});
export type ReportPayload = z.infer<typeof ReportPayloadSchema>;

export const DraftPlanRoleSchema = z.enum([
  "primary",
  "fallback",
  "later",
  "avoid",
]);
export const DraftPlanStatusSchema = z.enum([
  "current",
  "advanced_valid",
  "fallback_active",
  "completed",
  "superseded",
  "research_stale",
]);

export const DraftPlanOutputSchema = ReportPayloadSchema.extend({
  recommendations: z
    .array(
      z.object({
        playerId: z.string(),
        planRank: z.number().int().positive(),
        tier: z.string(),
        role: DraftPlanRoleSchema,
        rationale: z.string(),
        risks: z.array(z.string()),
        confidence: z.enum(["low", "medium", "high"]),
        expectedAvailability: z.enum(["unlikely", "possible", "likely"]),
      }),
    )
    .min(5)
    .max(10),
  primaryPlayerId: z.string(),
  fallbackPlayerIds: z.array(z.string()),
  futurePickPlans: z.array(
    z.object({
      pickNo: z.number().int().positive(),
      targetPlayerIds: z.array(z.string()),
      strategy: z.string(),
    }),
  ),
});
export type DraftPlanOutput = z.infer<typeof DraftPlanOutputSchema>;

export const DraftPlanSchema = z.object({
  draftId: z.string(),
  boardHash: z.string(),
  inputHash: z.string(),
  basedOnPickCount: z.number().int().nonnegative(),
  currentPickNo: z.number().int().positive().nullable(),
  targetPickNo: z.number().int().positive(),
  generatedAt: z.string(),
  researchFreshThrough: z.string(),
  status: DraftPlanStatusSchema,
  statusReason: z.string().nullable(),
  activeRecommendationPlayerId: z.string().nullable(),
  selectedPlayerId: z.string().nullable(),
  primaryPlayerId: z.string(),
  fallbackPlayerIds: z.array(z.string()),
  recommendations: z.array(
    z.object({
      player: PlayerViewSchema,
      planRank: z.number().int().positive(),
      baselineRank: z.number().int().positive(),
      tier: z.string(),
      role: DraftPlanRoleSchema,
      rationale: z.string(),
      risks: z.array(z.string()),
      confidence: z.enum(["low", "medium", "high"]),
      expectedAvailability: z.enum(["unlikely", "possible", "likely"]),
    }),
  ),
  futurePickPlans: z.array(
    z.object({
      pickNo: z.number().int().positive(),
      targetPlayerIds: z.array(z.string()),
      strategy: z.string(),
    }),
  ),
});
export type DraftPlan = z.infer<typeof DraftPlanSchema>;

export const REPORT_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export const MicroSummaryOutputSchema = z.object({
  headline: z.string().min(1).max(100),
  summary: z.string().min(1).max(220),
});
export type MicroSummaryOutput = z.infer<typeof MicroSummaryOutputSchema>;

export const MicroSummarySchema = MicroSummaryOutputSchema.extend({
  model: z.string().min(1),
  promptVersion: z.string().min(1),
});
export type MicroSummary = z.infer<typeof MicroSummarySchema>;

export const AiReportSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  kind: ReportKindSchema,
  generatedAt: z.string(),
  snapshotAt: z.string(),
  invalidated: z.boolean(),
  payload: ReportPayloadSchema,
  microSummary: MicroSummarySchema.nullable(),
  draftPlan: DraftPlanSchema.nullable(),
});
export type AiReport = z.infer<typeof AiReportSchema>;

export const AiSettingsSchema = z.object({
  model: z.string().min(1).max(100),
  effort: z.string().min(1).max(32),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const CodexModelSchema = z.object({
  model: z.string(),
  displayName: z.string(),
  description: z.string(),
  isDefault: z.boolean(),
  defaultReasoningEffort: z.string(),
  supportedReasoningEfforts: z.array(
    z.object({
      effort: z.string(),
      description: z.string(),
    }),
  ),
});
export type CodexModel = z.infer<typeof CodexModelSchema>;

export const CodexStatusSchema = z.object({
  state: z.enum([
    "unavailable",
    "starting",
    "signed_out",
    "authenticating",
    "ready",
    "running",
    "error",
  ]),
  binaryPath: z.string().nullable(),
  version: z.string().nullable(),
  email: z.string().nullable(),
  planType: z.string().nullable(),
  errorMessage: z.string().nullable(),
  availableModels: z.array(CodexModelSchema),
});
export type CodexStatus = z.infer<typeof CodexStatusSchema>;

export const McpStatusSchema = z.object({
  connectedSessions: z.number(),
  endpoint: z.string(),
  errorMessage: z.string().nullable(),
  host: z.string(),
  port: z.number(),
  state: z.enum(["stopped", "running", "error"]),
});
export type McpStatus = z.infer<typeof McpStatusSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatHistoryCursorSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
});
export type ChatHistoryCursor = z.infer<typeof ChatHistoryCursorSchema>;

export const ChatHistoryPageSchema = z.object({
  messages: z.array(ChatMessageSchema),
  hasMore: z.boolean(),
});
export type ChatHistoryPage = z.infer<typeof ChatHistoryPageSchema>;

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const LeagueWeekKeySchema = z.object({
  leagueId: z.string().min(1),
  season: z.string().min(1),
  week: z.number().int().nonnegative(),
});
export type LeagueWeekKey = z.infer<typeof LeagueWeekKeySchema>;

export const WeeklyPhaseSchema = z.enum([
  "tuesday",
  "wednesday",
  "thursday",
  "weekend",
  "complete",
]);
export type WeeklyPhase = z.infer<typeof WeeklyPhaseSchema>;

export const WeeklyPlanStatusSchema = z.enum([
  "not_built",
  "building",
  "current",
  "data_changed",
  "research_stale",
  "failed",
  "superseded",
]);
export type WeeklyPlanStatus = z.infer<typeof WeeklyPlanStatusSchema>;

export const CompetitiveLaneSchema = z.enum([
  "contender",
  "retooler",
  "uncertain",
]);
export type CompetitiveLane = z.infer<typeof CompetitiveLaneSchema>;

export const WeeklyChangeKindSchema = z.enum([
  "roster",
  "transaction",
  "waiver",
  "matchup",
  "player_status",
  "depth_chart",
  "week",
  "league",
]);

export const WeeklyChangeSchema = z.object({
  id: z.string().min(1),
  kind: WeeklyChangeKindSchema,
  headline: z.string().min(1),
  description: z.string().min(1),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  occurredAt: z.string(),
  detectedAt: z.string(),
  material: z.boolean(),
  sourceEventId: z.string().nullable(),
});
export type WeeklyChange = z.infer<typeof WeeklyChangeSchema>;

export const WeeklyActionSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  dismissed: z.number().int().nonnegative(),
});

export const LeagueWeekSchema = LeagueWeekKeySchema.extend({
  phase: WeeklyPhaseSchema,
  latestSnapshotAt: z.string().nullable(),
  currentPlanId: z.string().nullable(),
  competitiveLane: CompetitiveLaneSchema.nullable(),
  planStatus: WeeklyPlanStatusSchema,
  meaningfulChanges: z.array(WeeklyChangeSchema),
  actionSummary: WeeklyActionSummarySchema,
  updatedAt: z.string(),
});
export type LeagueWeek = z.infer<typeof LeagueWeekSchema>;

export const EvidenceCategorySchema = z.enum([
  "usage",
  "role",
  "injury",
  "market",
  "matchup",
  "projection",
]);
export const EvidenceSourceTypeSchema = z.enum(["sleeper", "web", "provider"]);

export const EvidenceClaimSchema = z.object({
  id: z.string().min(1),
  leagueId: z.string().nullable(),
  playerId: z.string().nullable(),
  category: EvidenceCategorySchema,
  claim: z.string().min(1),
  metricName: z.string().nullable(),
  metricValue: z.number().nullable(),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  sourceType: EvidenceSourceTypeSchema,
  fetchedAt: z.string(),
  effectiveWeek: z.number().int().nonnegative().nullable(),
  expiresAt: z.string().nullable(),
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const EvidenceSourceSchema = z.object({
  evidenceId: z.string().nullable(),
  title: z.string().min(1),
  url: z.string().url().nullable(),
  claim: z.string().min(1),
  sourceType: EvidenceSourceTypeSchema,
  fetchedAt: z.string(),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const RosterPurposeSchema = z.enum([
  "start",
  "insure",
  "appreciate",
  "pop",
]);
export type RosterPurpose = z.infer<typeof RosterPurposeSchema>;

export const PlayerRecommendationSchema = z.object({
  playerId: z.string().min(1),
  headline: z.string().min(1),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema,
  sourceIds: z.array(z.string()),
});
export type PlayerRecommendation = z.infer<typeof PlayerRecommendationSchema>;

export const RosterPurposeAssessmentSchema = z.object({
  playerId: z.string().min(1),
  purposes: z.array(RosterPurposeSchema),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema,
});
export type RosterPurposeAssessment = z.infer<
  typeof RosterPurposeAssessmentSchema
>;

export const TuesdayActionKindSchema = z.enum([
  "waiver_claim",
  "free_agent_add",
  "roster_upgrade",
  "watch",
  "drop",
  "trade",
  "lineup_move",
  "inactive_check",
  "stash",
]);

export const TuesdayActionOutputSchema = z.object({
  actionKey: z.string().min(1),
  kind: TuesdayActionKindSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["now", "soon", "monitor"]),
  playerIds: z.array(z.string()),
  rosterIds: z.array(z.number().int()),
  confidence: ConfidenceSchema,
  keyUncertainty: z.string().nullable(),
  sourceIds: z.array(z.string()),
});
export type TuesdayActionOutput = z.infer<typeof TuesdayActionOutputSchema>;

export const WaiverClaimOutputSchema = z.object({
  priority: z.number().int().positive(),
  addPlayerId: z.string().min(1),
  dropPlayerId: z.string().nullable(),
  contingencyGroup: z.string().min(1),
  faabPercentMin: z.number().min(0).max(100).nullable(),
  faabPercentTarget: z.number().min(0).max(100).nullable(),
  faabPercentMax: z.number().min(0).max(100).nullable(),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema,
  sourceIds: z.array(z.string()),
});
export type WaiverClaimOutput = z.infer<typeof WaiverClaimOutputSchema>;

export const PlanAlternativeSchema = z.object({
  headline: z.string().min(1),
  recommendation: z.string().min(1),
  preferableWhen: z.string().min(1),
  tradeoff: z.string().min(1),
  playerIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
});
export type PlanAlternative = z.infer<typeof PlanAlternativeSchema>;

export const TuesdayPlanOutputSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  competitiveLane: z.object({
    lane: CompetitiveLaneSchema,
    confidence: ConfidenceSchema,
    reasons: z.array(z.string()),
    contraryEvidence: z.array(z.string()),
  }),
  actions: z.array(TuesdayActionOutputSchema),
  waiverClaims: z.array(WaiverClaimOutputSchema),
  addNow: z.array(PlayerRecommendationSchema),
  watch: z.array(
    PlayerRecommendationSchema.extend({ trigger: z.string().min(1) }),
  ),
  exit: z.array(
    PlayerRecommendationSchema.extend({
      dropRank: z.number().int().positive(),
      rosterPurposes: z.array(RosterPurposeSchema),
    }),
  ),
  rosterAudit: z.array(RosterPurposeAssessmentSchema),
  marketObservation: z.object({
    headline: z.string().min(1),
    recommendation: z.string().min(1),
    partnerRosterIds: z.array(z.number().int()),
    alternatives: z.array(z.string()),
    rationale: z.string().min(1),
    sourceIds: z.array(z.string()),
  }),
  alternatives: z.array(PlanAlternativeSchema),
  sources: z.array(EvidenceSourceSchema),
  uncertainties: z.array(z.string()),
  refreshTriggers: z.array(z.string()),
});
export type TuesdayPlanOutput = z.infer<typeof TuesdayPlanOutputSchema>;

export const WeeklyPlanSummarySchema = z.object({
  headline: z.string().min(1).max(100),
  summary: z.string().min(1).max(220),
  competitiveLane: CompetitiveLaneSchema,
  pendingActionCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
});
export type WeeklyPlanSummary = z.infer<typeof WeeklyPlanSummarySchema>;

export const WeeklyPlanPlayerSchema = z.object({
  playerId: z.string().min(1),
  name: z.string().min(1),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  status: z.string().nullable(),
});
export type WeeklyPlanPlayer = z.infer<typeof WeeklyPlanPlayerSchema>;

export const WeeklyPlanRosterSchema = z.object({
  rosterId: z.number().int(),
  teamName: z.string().min(1),
  avatar: z.string().nullable(),
});
export type WeeklyPlanRoster = z.infer<typeof WeeklyPlanRosterSchema>;

export const WeeklyPlanSchema = LeagueWeekKeySchema.extend({
  id: z.string().min(1),
  version: z.number().int().positive(),
  sourceSnapshotId: z.string().min(1),
  inputHash: z.string().min(1),
  evidenceHash: z.string().min(1),
  generatedAt: z.string(),
  researchFreshThrough: z.string(),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  status: WeeklyPlanStatusSchema.exclude(["not_built", "building", "failed"]),
  statusReason: z.string().nullable(),
  output: TuesdayPlanOutputSchema,
  players: z.array(WeeklyPlanPlayerSchema),
  rosters: z.array(WeeklyPlanRosterSchema),
  microSummary: WeeklyPlanSummarySchema.nullable(),
});
export type WeeklyPlan = z.infer<typeof WeeklyPlanSchema>;

export const WeeklyActionStatusSchema = z.enum([
  "pending",
  "completed",
  "dismissed",
  "declined",
  "failed",
  "not_possible",
  "observed_in_sleeper",
  "superseded",
]);
export type WeeklyActionStatus = z.infer<typeof WeeklyActionStatusSchema>;

export const WeeklyActionDispositionSchema = z.enum([
  "completed",
  "dismissed",
  "declined",
  "failed",
  "not_possible",
]);
export type WeeklyActionDisposition = z.infer<
  typeof WeeklyActionDispositionSchema
>;

export const WeeklyActionSchema = LeagueWeekKeySchema.extend({
  id: z.string().min(1),
  planId: z.string().min(1),
  actionKey: z.string().min(1),
  kind: TuesdayActionKindSchema,
  status: WeeklyActionStatusSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["now", "soon", "monitor"]),
  playerIds: z.array(z.string()),
  rosterIds: z.array(z.number().int()),
  dispositionNote: z.string().nullable(),
  observedEventId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type WeeklyAction = z.infer<typeof WeeklyActionSchema>;

export const WeeklyActionUpdateSchema = z.object({
  actionId: z.string().min(1),
  status: WeeklyActionStatusSchema,
  note: z.string().trim().max(500).nullable().optional(),
});
export type WeeklyActionUpdate = z.infer<typeof WeeklyActionUpdateSchema>;

export const SleeperEventSchema = LeagueWeekKeySchema.extend({
  id: z.string().min(1),
  dedupeKey: z.string().min(1),
  eventType: z.enum([
    "roster_add",
    "roster_drop",
    "trade",
    "waiver",
    "free_agent",
    "matchup",
    "player_status",
    "league",
  ]),
  upstreamId: z.string().nullable(),
  occurredAt: z.string(),
  detectedAt: z.string(),
  rosterIds: z.array(z.number().int()),
  playerIds: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
});
export type SleeperEvent = z.infer<typeof SleeperEventSchema>;

export const WatchlistEntrySchema = z.object({
  id: z.string().min(1),
  leagueId: z.string().min(1),
  playerId: z.string().min(1),
  hypothesis: z.string().min(1),
  trigger: z.string().min(1),
  state: z.enum(["active", "triggered", "resolved", "dismissed", "expired"]),
  createdSeason: z.string().min(1),
  createdWeek: z.number().int().nonnegative(),
  expiresSeason: z.string().nullable(),
  expiresWeek: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;

export const ProviderIdentitySchema = z.object({
  playerId: z.string().min(1),
  provider: z.string().min(1),
  providerPlayerId: z.string().min(1),
  updatedAt: z.string(),
});
export type ProviderIdentity = z.infer<typeof ProviderIdentitySchema>;

export const WeeklyPlanBundleSchema = z.object({
  leagueWeek: LeagueWeekSchema,
  plan: WeeklyPlanSchema.nullable(),
  actions: z.array(WeeklyActionSchema),
});
export type WeeklyPlanBundle = z.infer<typeof WeeklyPlanBundleSchema>;

export const WeeklyPlanRequestSchema = LeagueWeekKeySchema.extend({
  mode: z.enum(["build", "refine", "regenerate"]),
});
export type WeeklyPlanRequest = z.infer<typeof WeeklyPlanRequestSchema>;

export const WeeklyBriefPhaseSchema = z.enum([
  "wednesday",
  "thursday",
  "weekend",
]);
export type WeeklyBriefPhase = z.infer<typeof WeeklyBriefPhaseSchema>;

export const WeeklyPhaseBriefKeySchema = LeagueWeekKeySchema.extend({
  phase: WeeklyBriefPhaseSchema,
});
export type WeeklyPhaseBriefKey = z.infer<typeof WeeklyPhaseBriefKeySchema>;

export const ObservedWeeklyActionSchema = z.object({
  actionKey: z.string().nullable(),
  kind: z.enum([
    "waiver_claim",
    "free_agent_add",
    "drop",
    "trade",
    "roster_move",
  ]),
  outcome: z.enum(["completed", "failed", "outbid", "withdrawn", "unknown"]),
  title: z.string().min(1),
  description: z.string().min(1),
  playerIds: z.array(z.string()),
  rosterIds: z.array(z.number().int()),
  faabAmount: z.number().nonnegative().nullable(),
  sourceIds: z.array(z.string()),
});
export type ObservedWeeklyAction = z.infer<typeof ObservedWeeklyActionSchema>;

export const NewlyFreePlayerSchema = PlayerRecommendationSchema.extend({
  availableSince: z.string().nullable(),
  recommendedAction: z.enum(["add_now", "watch", "pass"]),
});
export type NewlyFreePlayer = z.infer<typeof NewlyFreePlayerSchema>;

export const RosterCongestionSchema = z.object({
  position: z.string().min(1),
  headline: z.string().min(1),
  rationale: z.string().min(1),
  recommendation: z.string().min(1),
  playerIds: z.array(z.string()),
  confidence: ConfidenceSchema,
  sourceIds: z.array(z.string()),
});
export type RosterCongestion = z.infer<typeof RosterCongestionSchema>;

export const WednesdayAftermathOutputSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  observedActions: z.array(ObservedWeeklyActionSchema),
  importantDrops: z.array(PlayerRecommendationSchema),
  newlyFreePlayers: z.array(NewlyFreePlayerSchema),
  congestion: z.array(RosterCongestionSchema),
  sources: z.array(EvidenceSourceSchema),
  uncertainties: z.array(z.string()),
});
export type WednesdayAftermathOutput = z.infer<
  typeof WednesdayAftermathOutputSchema
>;

export const LineupSlotAssignmentSchema = z.object({
  slotIndex: z.number().int().nonnegative(),
  slot: z.string().min(1),
  playerId: z.string().min(1),
});
export type LineupSlotAssignment = z.infer<typeof LineupSlotAssignmentSchema>;

export const RecommendedLineupMoveSchema = z.object({
  actionKey: z.string().min(1),
  playerId: z.string().min(1),
  replacePlayerId: z.string().nullable(),
  fromSlotIndex: z.number().int().nonnegative().nullable(),
  toSlotIndex: z.number().int().nonnegative(),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema,
  sourceIds: z.array(z.string()),
});
export type RecommendedLineupMove = z.infer<typeof RecommendedLineupMoveSchema>;

export const LineupCloseCallSchema = z.object({
  slotIndex: z.number().int().nonnegative(),
  chosenPlayerId: z.string().min(1),
  alternativePlayerId: z.string().min(1),
  rationale: z.string().min(1),
  projectedPointDelta: z.number().nullable(),
  flipConditions: z.array(z.string().min(1)),
  confidence: ConfidenceSchema,
  sourceIds: z.array(z.string()),
});
export type LineupCloseCall = z.infer<typeof LineupCloseCallSchema>;

export const LineupFlexNoteSchema = z.object({
  headline: z.string().min(1),
  rationale: z.string().min(1),
  slotIndexes: z.array(z.number().int().nonnegative()),
  playerIds: z.array(z.string()),
});
export type LineupFlexNote = z.infer<typeof LineupFlexNoteSchema>;

export const ThursdayLineupOutputSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  slotAssignments: z.array(LineupSlotAssignmentSchema).min(1),
  recommendedMoves: z.array(RecommendedLineupMoveSchema),
  closeCalls: z.array(LineupCloseCallSchema),
  flexNotes: z.array(LineupFlexNoteSchema),
  sources: z.array(EvidenceSourceSchema),
  uncertainties: z.array(z.string()),
});
export type ThursdayLineupOutput = z.infer<typeof ThursdayLineupOutputSchema>;

export const CriticalStatusAlertSchema = z.object({
  playerId: z.string().min(1),
  severity: z.enum(["critical", "warning", "monitor"]),
  status: z.string().min(1),
  headline: z.string().min(1),
  rationale: z.string().min(1),
  recommendedAction: z.string().min(1),
  sourceIds: z.array(z.string()),
});
export type CriticalStatusAlert = z.infer<typeof CriticalStatusAlertSchema>;

export const WeekendFlexibilityNoteSchema = z.object({
  headline: z.string().min(1),
  rationale: z.string().min(1),
  playerIds: z.array(z.string()),
  slotIndexes: z.array(z.number().int().nonnegative()),
});
export type WeekendFlexibilityNote = z.infer<
  typeof WeekendFlexibilityNoteSchema
>;

export const StashCandidateSchema = PlayerRecommendationSchema.extend({
  dropPlayerId: z.string().nullable(),
  window: z.enum(["saturday", "sunday_early", "sunday_late", "monday"]),
  trigger: z.string().min(1),
});
export type StashCandidate = z.infer<typeof StashCandidateSchema>;

export const WeekendActionOutputSchema = z.object({
  actionKey: z.string().min(1),
  kind: z.enum(["lineup_move", "inactive_check", "stash"]),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["now", "soon", "monitor"]),
  playerIds: z.array(z.string()),
  confidence: ConfidenceSchema,
  sourceIds: z.array(z.string()),
});
export type WeekendActionOutput = z.infer<typeof WeekendActionOutputSchema>;

export const WeekendCheckOutputSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  criticalStatusAlerts: z.array(CriticalStatusAlertSchema),
  flexibilityNotes: z.array(WeekendFlexibilityNoteSchema),
  stashCandidates: z.array(StashCandidateSchema),
  actions: z.array(WeekendActionOutputSchema),
  sources: z.array(EvidenceSourceSchema),
  uncertainties: z.array(z.string()),
});
export type WeekendCheckOutput = z.infer<typeof WeekendCheckOutputSchema>;

const WeeklyPhaseBriefMetadataSchema = LeagueWeekKeySchema.extend({
  id: z.string().min(1),
  version: z.number().int().positive(),
  sourceSnapshotId: z.string().min(1),
  sourcePlanId: z.string().nullable(),
  inputHash: z.string().min(1),
  evidenceHash: z.string().min(1),
  generatedAt: z.string(),
  dataFreshThrough: z.string(),
  researchFreshThrough: z.string(),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  players: z.array(WeeklyPlanPlayerSchema),
});

export const WeeklyPhaseBriefSchema = z.discriminatedUnion("phase", [
  WeeklyPhaseBriefMetadataSchema.extend({
    phase: z.literal("wednesday"),
    output: WednesdayAftermathOutputSchema,
  }),
  WeeklyPhaseBriefMetadataSchema.extend({
    phase: z.literal("thursday"),
    output: ThursdayLineupOutputSchema,
  }),
  WeeklyPhaseBriefMetadataSchema.extend({
    phase: z.literal("weekend"),
    output: WeekendCheckOutputSchema,
  }),
]);
export type WeeklyPhaseBrief = z.infer<typeof WeeklyPhaseBriefSchema>;

export const CurrentWeeklyBriefsSchema = z.object({
  wednesday: WeeklyPhaseBriefSchema.nullable(),
  thursday: WeeklyPhaseBriefSchema.nullable(),
  weekend: WeeklyPhaseBriefSchema.nullable(),
});
export type CurrentWeeklyBriefs = z.infer<typeof CurrentWeeklyBriefsSchema>;

export const EMPTY_CURRENT_WEEKLY_BRIEFS: CurrentWeeklyBriefs = {
  wednesday: null,
  thursday: null,
  weekend: null,
};

export const WeeklyPhaseBriefRequestSchema = WeeklyPhaseBriefKeySchema.extend({
  mode: z.enum(["build", "refine", "regenerate"]),
});
export type WeeklyPhaseBriefRequest = z.infer<
  typeof WeeklyPhaseBriefRequestSchema
>;

export const BootstrapSchema = z.object({
  platform: DesktopPlatformSchema,
  leagues: z.array(SavedLeagueSchema),
  activeDashboard: DashboardSchema.nullable(),
  reports: z.array(AiReportSchema),
  chatMessages: z.array(ChatMessageSchema),
  chatHasMore: z.boolean(),
  codex: CodexStatusSchema,
  mcp: McpStatusSchema,
  aiSettings: AiSettingsSchema,
  activeLeagueWeek: LeagueWeekSchema.nullable(),
  currentWeeklyPlan: WeeklyPlanSchema.nullable(),
  weeklyActions: z.array(WeeklyActionSchema),
  currentWeeklyBriefs: CurrentWeeklyBriefsSchema,
});
export type Bootstrap = z.infer<typeof BootstrapSchema>;

export type RuntimeEvent =
  | { type: "bootstrap_changed" }
  | { type: "codex_status"; status: CodexStatus }
  | { type: "mcp_status"; status: McpStatus }
  | { type: "report_delta"; kind: ReportKind; text: string }
  | {
      type: "chat_started";
      leagueId: string;
      runId: string;
      userMessage: ChatMessage;
    }
  | { type: "chat_delta"; leagueId: string; runId: string; text: string }
  | {
      type: "chat_completed";
      leagueId: string;
      runId: string;
      assistantMessage: ChatMessage;
    }
  | {
      type: "chat_failed";
      leagueId: string;
      runId: string;
      error: string;
    }
  | { type: "draft_changed"; leagueId: string }
  | {
      type: "weekly_plan_started";
      key: LeagueWeekKey;
      mode: WeeklyPlanRequest["mode"];
    }
  | {
      type: "weekly_plan_progress";
      key: LeagueWeekKey;
      stage: "reading_league" | "researching_candidates" | "building_plan";
    }
  | { type: "weekly_plan_completed"; bundle: WeeklyPlanBundle }
  | { type: "weekly_plan_failed"; key: LeagueWeekKey; error: string }
  | {
      type: "weekly_phase_brief_started";
      key: WeeklyPhaseBriefKey;
      mode: WeeklyPhaseBriefRequest["mode"];
    }
  | {
      type: "weekly_phase_brief_progress";
      key: WeeklyPhaseBriefKey;
      stage:
        | "reading_league"
        | "reconciling_week"
        | "researching_players"
        | "optimizing_lineup"
        | "building_brief";
    }
  | { type: "weekly_phase_brief_completed"; brief: WeeklyPhaseBrief }
  | {
      type: "weekly_phase_brief_failed";
      key: WeeklyPhaseBriefKey;
      error: string;
    }
  | { type: "weekly_action_updated"; action: WeeklyAction }
  | { type: "league_week_changed"; leagueWeek: LeagueWeek };

export type SleeperCaffeineApi = {
  bootstrap(): Promise<Bootstrap>;
  previewLeague(input: string): Promise<LeaguePreview>;
  saveLeague(input: {
    leagueId: string;
    rosterId: number;
    userId: string;
  }): Promise<Bootstrap>;
  setActiveLeague(leagueId: string): Promise<Bootstrap>;
  refreshActiveLeague(): Promise<Bootstrap>;
  loadWeeklyPlan(input: LeagueWeekKey): Promise<WeeklyPlanBundle>;
  generateWeeklyPlan(input: WeeklyPlanRequest): Promise<WeeklyPlanBundle>;
  loadWeeklyPhaseBrief(
    input: WeeklyPhaseBriefKey,
  ): Promise<WeeklyPhaseBrief | null>;
  generateWeeklyPhaseBrief(
    input: WeeklyPhaseBriefRequest,
  ): Promise<WeeklyPhaseBrief>;
  updateWeeklyAction(input: WeeklyActionUpdate): Promise<WeeklyAction>;
  generateReport(kind: ReportKind): Promise<AiReport>;
  loadChatHistory(input: {
    leagueId: string;
    before: ChatHistoryCursor | null;
    limit?: number;
  }): Promise<ChatHistoryPage>;
  sendChat(message: string): Promise<ChatMessage>;
  loginCodex(): Promise<void>;
  logoutCodex(): Promise<void>;
  clearLocalData(): Promise<Bootstrap>;
  updateAiSettings(input: AiSettings): Promise<Bootstrap>;
  toggleDraftCandidatePin(playerId: string): Promise<Bootstrap>;
  openExternal(url: string): Promise<void>;
  onRuntimeEvent(listener: (event: RuntimeEvent) => void): () => void;
};

export const REPORT_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "confidence",
    "cards",
    "actions",
    "sources",
    "caveats",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "tone", "body", "bullets"],
        properties: {
          title: { type: "string" },
          tone: {
            type: "string",
            enum: ["positive", "warning", "neutral", "critical"],
          },
          body: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "priority"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["now", "soon", "monitor"] },
        },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "claim", "sourceType"],
        properties: {
          title: { type: "string" },
          url: { type: ["string", "null"] },
          claim: { type: "string" },
          sourceType: { type: "string", enum: ["sleeper", "web"] },
        },
      },
    },
    caveats: { type: "array", items: { type: "string" } },
  },
} as const;

export const DRAFT_PLAN_OUTPUT_JSON_SCHEMA = {
  ...REPORT_OUTPUT_JSON_SCHEMA,
  required: [
    ...REPORT_OUTPUT_JSON_SCHEMA.required,
    "recommendations",
    "primaryPlayerId",
    "fallbackPlayerIds",
    "futurePickPlans",
  ],
  properties: {
    ...REPORT_OUTPUT_JSON_SCHEMA.properties,
    recommendations: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "playerId",
          "planRank",
          "tier",
          "role",
          "rationale",
          "risks",
          "confidence",
          "expectedAvailability",
        ],
        properties: {
          playerId: { type: "string" },
          planRank: { type: "integer", minimum: 1 },
          tier: { type: "string" },
          role: {
            type: "string",
            enum: ["primary", "fallback", "later", "avoid"],
          },
          rationale: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          expectedAvailability: {
            type: "string",
            enum: ["unlikely", "possible", "likely"],
          },
        },
      },
    },
    primaryPlayerId: { type: "string" },
    fallbackPlayerIds: { type: "array", items: { type: "string" } },
    futurePickPlans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pickNo", "targetPlayerIds", "strategy"],
        properties: {
          pickNo: { type: "integer", minimum: 1 },
          targetPlayerIds: { type: "array", items: { type: "string" } },
          strategy: { type: "string" },
        },
      },
    },
  },
} as const;

const CONFIDENCE_JSON_SCHEMA = {
  type: "string",
  enum: ["low", "medium", "high"],
} as const;

const MATERIAL_SOURCE_IDS_JSON_SCHEMA = {
  type: "array",
  minItems: 1,
  items: { type: "string", minLength: 1 },
} as const;

const PLAYER_RECOMMENDATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["playerId", "headline", "rationale", "confidence", "sourceIds"],
  properties: {
    playerId: { type: "string" },
    headline: { type: "string" },
    rationale: { type: "string" },
    confidence: CONFIDENCE_JSON_SCHEMA,
    sourceIds: MATERIAL_SOURCE_IDS_JSON_SCHEMA,
  },
} as const;

const EVIDENCE_SOURCE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["evidenceId", "title", "url", "claim", "sourceType", "fetchedAt"],
  properties: {
    evidenceId: { type: "string", minLength: 1 },
    title: { type: "string" },
    url: { type: ["string", "null"] },
    claim: { type: "string" },
    sourceType: {
      type: "string",
      enum: ["sleeper", "web", "provider"],
    },
    fetchedAt: { type: "string" },
  },
} as const;

/** Strict response schema supplied to codex app-server for the Tuesday turn. */
export const TUESDAY_PLAN_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "confidence",
    "competitiveLane",
    "actions",
    "waiverClaims",
    "addNow",
    "watch",
    "exit",
    "rosterAudit",
    "marketObservation",
    "alternatives",
    "sources",
    "uncertainties",
    "refreshTriggers",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    confidence: CONFIDENCE_JSON_SCHEMA,
    competitiveLane: {
      type: "object",
      additionalProperties: false,
      required: ["lane", "confidence", "reasons", "contraryEvidence"],
      properties: {
        lane: {
          type: "string",
          enum: ["contender", "retooler", "uncertain"],
        },
        confidence: CONFIDENCE_JSON_SCHEMA,
        reasons: { type: "array", items: { type: "string" } },
        contraryEvidence: { type: "array", items: { type: "string" } },
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "actionKey",
          "kind",
          "title",
          "description",
          "priority",
          "playerIds",
          "rosterIds",
          "confidence",
          "keyUncertainty",
          "sourceIds",
        ],
        properties: {
          actionKey: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "waiver_claim",
              "free_agent_add",
              "roster_upgrade",
              "watch",
              "drop",
              "trade",
              "lineup_move",
              "inactive_check",
              "stash",
            ],
          },
          title: { type: "string" },
          description: { type: "string" },
          priority: {
            type: "string",
            enum: ["now", "soon", "monitor"],
          },
          playerIds: { type: "array", items: { type: "string" } },
          rosterIds: { type: "array", items: { type: "integer" } },
          confidence: CONFIDENCE_JSON_SCHEMA,
          keyUncertainty: { type: ["string", "null"] },
          sourceIds: MATERIAL_SOURCE_IDS_JSON_SCHEMA,
        },
      },
    },
    waiverClaims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "priority",
          "addPlayerId",
          "dropPlayerId",
          "contingencyGroup",
          "faabPercentMin",
          "faabPercentTarget",
          "faabPercentMax",
          "rationale",
          "confidence",
          "sourceIds",
        ],
        properties: {
          priority: { type: "integer", minimum: 1 },
          addPlayerId: { type: "string" },
          dropPlayerId: { type: ["string", "null"] },
          contingencyGroup: { type: "string" },
          faabPercentMin: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 100,
          },
          faabPercentTarget: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 100,
          },
          faabPercentMax: {
            type: ["number", "null"],
            minimum: 0,
            maximum: 100,
          },
          rationale: { type: "string" },
          confidence: CONFIDENCE_JSON_SCHEMA,
          sourceIds: MATERIAL_SOURCE_IDS_JSON_SCHEMA,
        },
      },
    },
    addNow: { type: "array", items: PLAYER_RECOMMENDATION_JSON_SCHEMA },
    watch: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "playerId",
          "headline",
          "rationale",
          "confidence",
          "sourceIds",
          "trigger",
        ],
        properties: {
          ...PLAYER_RECOMMENDATION_JSON_SCHEMA.properties,
          trigger: { type: "string" },
        },
      },
    },
    exit: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "playerId",
          "headline",
          "rationale",
          "confidence",
          "sourceIds",
          "dropRank",
          "rosterPurposes",
        ],
        properties: {
          ...PLAYER_RECOMMENDATION_JSON_SCHEMA.properties,
          dropRank: { type: "integer", minimum: 1 },
          rosterPurposes: {
            type: "array",
            items: {
              type: "string",
              enum: ["start", "insure", "appreciate", "pop"],
            },
          },
        },
      },
    },
    rosterAudit: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["playerId", "purposes", "rationale", "confidence"],
        properties: {
          playerId: { type: "string" },
          purposes: {
            type: "array",
            items: {
              type: "string",
              enum: ["start", "insure", "appreciate", "pop"],
            },
          },
          rationale: { type: "string" },
          confidence: CONFIDENCE_JSON_SCHEMA,
        },
      },
    },
    marketObservation: {
      type: "object",
      additionalProperties: false,
      required: [
        "headline",
        "recommendation",
        "partnerRosterIds",
        "alternatives",
        "rationale",
        "sourceIds",
      ],
      properties: {
        headline: { type: "string" },
        recommendation: { type: "string" },
        partnerRosterIds: { type: "array", items: { type: "integer" } },
        alternatives: { type: "array", items: { type: "string" } },
        rationale: { type: "string" },
        sourceIds: { type: "array", items: { type: "string" } },
      },
    },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "headline",
          "recommendation",
          "preferableWhen",
          "tradeoff",
          "playerIds",
          "sourceIds",
        ],
        properties: {
          headline: { type: "string" },
          recommendation: { type: "string" },
          preferableWhen: { type: "string" },
          tradeoff: { type: "string" },
          playerIds: { type: "array", items: { type: "string" } },
          sourceIds: MATERIAL_SOURCE_IDS_JSON_SCHEMA,
        },
      },
    },
    sources: { type: "array", items: EVIDENCE_SOURCE_JSON_SCHEMA },
    uncertainties: { type: "array", items: { type: "string" } },
    refreshTriggers: { type: "array", items: { type: "string" } },
  },
} as const;

const OBSERVED_WEEKLY_ACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "actionKey",
    "kind",
    "outcome",
    "title",
    "description",
    "playerIds",
    "rosterIds",
    "faabAmount",
    "sourceIds",
  ],
  properties: {
    actionKey: { type: ["string", "null"] },
    kind: {
      type: "string",
      enum: ["waiver_claim", "free_agent_add", "drop", "trade", "roster_move"],
    },
    outcome: {
      type: "string",
      enum: ["completed", "failed", "outbid", "withdrawn", "unknown"],
    },
    title: { type: "string" },
    description: { type: "string" },
    playerIds: { type: "array", items: { type: "string" } },
    rosterIds: { type: "array", items: { type: "integer" } },
    faabAmount: { type: ["number", "null"], minimum: 0 },
    sourceIds: { type: "array", items: { type: "string" } },
  },
} as const;

const NEWLY_FREE_PLAYER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    ...PLAYER_RECOMMENDATION_JSON_SCHEMA.required,
    "availableSince",
    "recommendedAction",
  ],
  properties: {
    ...PLAYER_RECOMMENDATION_JSON_SCHEMA.properties,
    availableSince: { type: ["string", "null"] },
    recommendedAction: {
      type: "string",
      enum: ["add_now", "watch", "pass"],
    },
  },
} as const;

const ROSTER_CONGESTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "position",
    "headline",
    "rationale",
    "recommendation",
    "playerIds",
    "confidence",
    "sourceIds",
  ],
  properties: {
    position: { type: "string" },
    headline: { type: "string" },
    rationale: { type: "string" },
    recommendation: { type: "string" },
    playerIds: { type: "array", items: { type: "string" } },
    confidence: CONFIDENCE_JSON_SCHEMA,
    sourceIds: { type: "array", items: { type: "string" } },
  },
} as const;

/** Strict response schema supplied to codex app-server for Wednesday review. */
export const WEDNESDAY_AFTERMATH_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "confidence",
    "observedActions",
    "importantDrops",
    "newlyFreePlayers",
    "congestion",
    "sources",
    "uncertainties",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    confidence: CONFIDENCE_JSON_SCHEMA,
    observedActions: {
      type: "array",
      items: OBSERVED_WEEKLY_ACTION_JSON_SCHEMA,
    },
    importantDrops: {
      type: "array",
      items: PLAYER_RECOMMENDATION_JSON_SCHEMA,
    },
    newlyFreePlayers: {
      type: "array",
      items: NEWLY_FREE_PLAYER_JSON_SCHEMA,
    },
    congestion: { type: "array", items: ROSTER_CONGESTION_JSON_SCHEMA },
    sources: { type: "array", items: EVIDENCE_SOURCE_JSON_SCHEMA },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

const LINEUP_SLOT_ASSIGNMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["slotIndex", "slot", "playerId"],
  properties: {
    slotIndex: { type: "integer", minimum: 0 },
    slot: { type: "string" },
    playerId: { type: "string" },
  },
} as const;

const RECOMMENDED_LINEUP_MOVE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "actionKey",
    "playerId",
    "replacePlayerId",
    "fromSlotIndex",
    "toSlotIndex",
    "rationale",
    "confidence",
    "sourceIds",
  ],
  properties: {
    actionKey: { type: "string" },
    playerId: { type: "string" },
    replacePlayerId: { type: ["string", "null"] },
    fromSlotIndex: { type: ["integer", "null"], minimum: 0 },
    toSlotIndex: { type: "integer", minimum: 0 },
    rationale: { type: "string" },
    confidence: CONFIDENCE_JSON_SCHEMA,
    sourceIds: { type: "array", items: { type: "string" } },
  },
} as const;

const LINEUP_CLOSE_CALL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "slotIndex",
    "chosenPlayerId",
    "alternativePlayerId",
    "rationale",
    "projectedPointDelta",
    "flipConditions",
    "confidence",
    "sourceIds",
  ],
  properties: {
    slotIndex: { type: "integer", minimum: 0 },
    chosenPlayerId: { type: "string" },
    alternativePlayerId: { type: "string" },
    rationale: { type: "string" },
    projectedPointDelta: { type: ["number", "null"] },
    flipConditions: { type: "array", items: { type: "string" } },
    confidence: CONFIDENCE_JSON_SCHEMA,
    sourceIds: { type: "array", items: { type: "string" } },
  },
} as const;

const LINEUP_FLEX_NOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "rationale", "slotIndexes", "playerIds"],
  properties: {
    headline: { type: "string" },
    rationale: { type: "string" },
    slotIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
    playerIds: { type: "array", items: { type: "string" } },
  },
} as const;

/** Strict response schema supplied to codex app-server for Thursday lineup work. */
export const THURSDAY_LINEUP_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "confidence",
    "slotAssignments",
    "recommendedMoves",
    "closeCalls",
    "flexNotes",
    "sources",
    "uncertainties",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    confidence: CONFIDENCE_JSON_SCHEMA,
    slotAssignments: {
      type: "array",
      minItems: 1,
      items: LINEUP_SLOT_ASSIGNMENT_JSON_SCHEMA,
    },
    recommendedMoves: {
      type: "array",
      items: RECOMMENDED_LINEUP_MOVE_JSON_SCHEMA,
    },
    closeCalls: { type: "array", items: LINEUP_CLOSE_CALL_JSON_SCHEMA },
    flexNotes: { type: "array", items: LINEUP_FLEX_NOTE_JSON_SCHEMA },
    sources: { type: "array", items: EVIDENCE_SOURCE_JSON_SCHEMA },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

const CRITICAL_STATUS_ALERT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "playerId",
    "severity",
    "status",
    "headline",
    "rationale",
    "recommendedAction",
    "sourceIds",
  ],
  properties: {
    playerId: { type: "string" },
    severity: {
      type: "string",
      enum: ["critical", "warning", "monitor"],
    },
    status: { type: "string" },
    headline: { type: "string" },
    rationale: { type: "string" },
    recommendedAction: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } },
  },
} as const;

const WEEKEND_FLEXIBILITY_NOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "rationale", "playerIds", "slotIndexes"],
  properties: {
    headline: { type: "string" },
    rationale: { type: "string" },
    playerIds: { type: "array", items: { type: "string" } },
    slotIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
  },
} as const;

const STASH_CANDIDATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    ...PLAYER_RECOMMENDATION_JSON_SCHEMA.required,
    "dropPlayerId",
    "window",
    "trigger",
  ],
  properties: {
    ...PLAYER_RECOMMENDATION_JSON_SCHEMA.properties,
    dropPlayerId: { type: ["string", "null"] },
    window: {
      type: "string",
      enum: ["saturday", "sunday_early", "sunday_late", "monday"],
    },
    trigger: { type: "string" },
  },
} as const;

const WEEKEND_ACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "actionKey",
    "kind",
    "title",
    "description",
    "priority",
    "playerIds",
    "confidence",
    "sourceIds",
  ],
  properties: {
    actionKey: { type: "string" },
    kind: {
      type: "string",
      enum: ["lineup_move", "inactive_check", "stash"],
    },
    title: { type: "string" },
    description: { type: "string" },
    priority: { type: "string", enum: ["now", "soon", "monitor"] },
    playerIds: { type: "array", items: { type: "string" } },
    confidence: CONFIDENCE_JSON_SCHEMA,
    sourceIds: { type: "array", items: { type: "string" } },
  },
} as const;

/** Strict response schema supplied to codex app-server for weekend checks. */
export const WEEKEND_CHECK_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "summary",
    "confidence",
    "criticalStatusAlerts",
    "flexibilityNotes",
    "stashCandidates",
    "actions",
    "sources",
    "uncertainties",
  ],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    confidence: CONFIDENCE_JSON_SCHEMA,
    criticalStatusAlerts: {
      type: "array",
      items: CRITICAL_STATUS_ALERT_JSON_SCHEMA,
    },
    flexibilityNotes: {
      type: "array",
      items: WEEKEND_FLEXIBILITY_NOTE_JSON_SCHEMA,
    },
    stashCandidates: { type: "array", items: STASH_CANDIDATE_JSON_SCHEMA },
    actions: { type: "array", items: WEEKEND_ACTION_JSON_SCHEMA },
    sources: { type: "array", items: EVIDENCE_SOURCE_JSON_SCHEMA },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

export const WEEKLY_PHASE_OUTPUT_JSON_SCHEMAS = {
  wednesday: WEDNESDAY_AFTERMATH_OUTPUT_JSON_SCHEMA,
  thursday: THURSDAY_LINEUP_OUTPUT_JSON_SCHEMA,
  weekend: WEEKEND_CHECK_OUTPUT_JSON_SCHEMA,
} as const;

export const MICRO_SUMMARY_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary"],
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: "string", minLength: 1, maxLength: 220 },
  },
} as const;
