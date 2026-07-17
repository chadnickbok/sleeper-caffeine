import type {
  AiSettings,
  ChatHistoryCursor,
  LeagueWeekKey,
  ReportKind,
  SleeperCaffeineApi,
  WeeklyActionUpdate,
  WeeklyPhaseBriefKey,
  WeeklyPhaseBriefRequest,
  WeeklyPlanRequest,
} from "@sleeper-caffeine/ipc-contract";

function api(): SleeperCaffeineApi {
  return window.sleeperCaffeine;
}

export const caffeineClient = {
  bootstrap: () => api().bootstrap(),
  previewLeague: (input: string) => api().previewLeague(input),
  saveLeague: (input: { leagueId: string; rosterId: number; userId: string }) =>
    api().saveLeague(input),
  setActiveLeague: (leagueId: string) => api().setActiveLeague(leagueId),
  refreshActiveLeague: () => api().refreshActiveLeague(),
  generateReport: (kind: ReportKind) => api().generateReport(kind),
  loadWeeklyPlan: (input: LeagueWeekKey) => api().loadWeeklyPlan(input),
  generateWeeklyPlan: (input: WeeklyPlanRequest) =>
    api().generateWeeklyPlan(input),
  loadWeeklyPhaseBrief: (input: WeeklyPhaseBriefKey) =>
    api().loadWeeklyPhaseBrief(input),
  generateWeeklyPhaseBrief: (input: WeeklyPhaseBriefRequest) =>
    api().generateWeeklyPhaseBrief(input),
  updateWeeklyAction: (input: WeeklyActionUpdate) =>
    api().updateWeeklyAction(input),
  loadChatHistory: (input: {
    leagueId: string;
    before: ChatHistoryCursor | null;
    limit?: number;
  }) => api().loadChatHistory(input),
  sendChat: (message: string) => api().sendChat(message),
  loginCodex: () => api().loginCodex(),
  logoutCodex: () => api().logoutCodex(),
  clearLocalData: () => api().clearLocalData(),
  updateAiSettings: (input: AiSettings) => api().updateAiSettings(input),
  toggleDraftCandidatePin: (playerId: string) =>
    api().toggleDraftCandidatePin(playerId),
  openExternal: (url: string) => api().openExternal(url),
  onRuntimeEvent: (
    listener: Parameters<SleeperCaffeineApi["onRuntimeEvent"]>[0],
  ) => api().onRuntimeEvent(listener),
};
