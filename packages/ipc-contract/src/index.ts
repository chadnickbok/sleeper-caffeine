import { z } from "zod/v4";

export const IPC_CHANNELS = {
  bootstrap: "app:bootstrap",
  clearLocalData: "settings:clear-local-data",
  codexLogin: "codex:login",
  codexLogout: "codex:logout",
  generateReport: "ai:generate-report",
  openExternal: "shell:open-external",
  previewLeague: "league:preview",
  refreshActiveLeague: "league:refresh-active",
  runtimeEvent: "runtime:event",
  saveLeague: "league:save",
  sendChat: "ai:send-chat",
  setActiveLeague: "league:set-active",
  updateAiSettings: "settings:update-ai",
} as const;

export const DEFAULT_AI_SETTINGS = {
  model: "gpt-5.6-terra",
  effort: "low",
} as const;

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
  player: PlayerViewSchema.nullable(),
});

export const DraftViewSchema = z
  .object({
    draftId: z.string(),
    status: z.string(),
    type: z.string(),
    startTime: z.number().nullable(),
    rounds: z.number().nullable(),
    teams: z.number().nullable(),
    picks: z.array(DraftPickViewSchema),
    myUpcomingPickNumbers: z.array(z.number().int()),
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

export const BootstrapSchema = z.object({
  leagues: z.array(SavedLeagueSchema),
  activeDashboard: DashboardSchema.nullable(),
  reports: z.array(AiReportSchema),
  chatMessages: z.array(ChatMessageSchema),
  codex: CodexStatusSchema,
  mcp: McpStatusSchema,
  aiSettings: AiSettingsSchema,
});
export type Bootstrap = z.infer<typeof BootstrapSchema>;

export type RuntimeEvent =
  | { type: "bootstrap_changed" }
  | { type: "codex_status"; status: CodexStatus }
  | { type: "mcp_status"; status: McpStatus }
  | { type: "report_delta"; kind: ReportKind; text: string }
  | { type: "chat_delta"; text: string }
  | { type: "draft_changed"; leagueId: string };

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
  generateReport(kind: ReportKind): Promise<AiReport>;
  sendChat(message: string): Promise<ChatMessage>;
  loginCodex(): Promise<void>;
  logoutCodex(): Promise<void>;
  clearLocalData(): Promise<Bootstrap>;
  updateAiSettings(input: AiSettings): Promise<Bootstrap>;
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

export const MICRO_SUMMARY_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary"],
  properties: {
    headline: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: "string", minLength: 1, maxLength: 220 },
  },
} as const;
