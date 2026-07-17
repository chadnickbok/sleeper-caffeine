export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
} as const;

export const mutationKeys = {
  clear: ["app", "clear"] as const,
  draftPin: ["draft", "pin"] as const,
  login: ["codex", "login"] as const,
  logout: ["codex", "logout"] as const,
  report: ["report", "generate"] as const,
  saveLeague: ["league", "save"] as const,
  settings: ["settings", "ai"] as const,
  switchLeague: ["league", "switch"] as const,
  refresh: ["league", "refresh"] as const,
  chat: ["chat", "send"] as const,
  weeklyPlan: ["weekly", "plan"] as const,
  weeklyPhaseBrief: ["weekly", "phase-brief"] as const,
  weeklyAction: ["weekly", "action"] as const,
} as const;
