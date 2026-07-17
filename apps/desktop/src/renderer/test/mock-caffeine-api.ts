import type {
  Bootstrap,
  SleeperCaffeineApi,
} from "@sleeper-caffeine/ipc-contract";
import { EMPTY_CURRENT_WEEKLY_BRIEFS } from "@sleeper-caffeine/ipc-contract";

export const emptyBootstrap: Bootstrap = {
  platform: "darwin",
  leagues: [],
  activeDashboard: null,
  reports: [],
  chatMessages: [],
  chatHasMore: false,
  codex: {
    state: "signed_out",
    binaryPath: "/usr/local/bin/codex",
    version: "test",
    email: null,
    planType: null,
    errorMessage: null,
    availableModels: [],
  },
  mcp: {
    connectedSessions: 0,
    endpoint: "http://127.0.0.1:3000/mcp",
    errorMessage: null,
    host: "127.0.0.1",
    port: 3000,
    state: "running",
  },
  aiSettings: { model: "gpt-5.6-terra", effort: "low" },
  activeLeagueWeek: null,
  currentWeeklyPlan: null,
  weeklyActions: [],
  currentWeeklyBriefs: EMPTY_CURRENT_WEEKLY_BRIEFS,
};

export function createMockCaffeineApi(
  overrides: Partial<SleeperCaffeineApi> = {},
): SleeperCaffeineApi {
  const unsupported = () =>
    Promise.reject(new Error("Not implemented in test"));
  return {
    bootstrap: () => Promise.resolve(emptyBootstrap),
    previewLeague: unsupported,
    saveLeague: unsupported,
    setActiveLeague: unsupported,
    refreshActiveLeague: unsupported,
    generateReport: unsupported,
    loadWeeklyPlan: unsupported,
    generateWeeklyPlan: unsupported,
    loadWeeklyPhaseBrief: unsupported,
    generateWeeklyPhaseBrief: unsupported,
    updateWeeklyAction: unsupported,
    loadChatHistory: unsupported,
    sendChat: unsupported,
    loginCodex: () => Promise.resolve(),
    logoutCodex: () => Promise.resolve(),
    clearLocalData: () => Promise.resolve(emptyBootstrap),
    updateAiSettings: () => Promise.resolve(emptyBootstrap),
    toggleDraftCandidatePin: () => Promise.resolve(emptyBootstrap),
    openExternal: () => Promise.resolve(),
    onRuntimeEvent: () => () => undefined,
    ...overrides,
  };
}
