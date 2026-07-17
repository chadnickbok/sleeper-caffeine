import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AiSettings,
  Bootstrap,
  ReportKind,
  WeeklyActionStatus,
  WeeklyPhaseBriefRequest,
  WeeklyPlanRequest,
} from "@sleeper-caffeine/ipc-contract";
import { useCallback, useState } from "react";
import { caffeineClient } from "./caffeine-client.js";
import { mutationKeys, queryKeys } from "./query-keys.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface CaffeinePendingState {
  clear: boolean;
  draftPin: string | null;
  login: boolean;
  logout: boolean;
  report: ReportKind | null;
  settings: boolean;
  switchLeague: boolean;
  refresh: boolean;
  chat: boolean;
  weeklyPlan: WeeklyPlanRequest | null;
  weeklyPhaseBrief: WeeklyPhaseBriefRequest | null;
  weeklyAction: string | null;
}

export function useBootstrapQuery() {
  return useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: caffeineClient.bootstrap,
  });
}

export function useCaffeineCommands() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const writeBootstrap = useCallback(
    (bootstrap: Bootstrap) => {
      queryClient.setQueryData(queryKeys.bootstrap, bootstrap);
      return bootstrap;
    },
    [queryClient],
  );
  const fail = useCallback((cause: unknown) => {
    setError(messageOf(cause));
    throw cause;
  }, []);
  const cancelBootstrapRead = () =>
    queryClient.cancelQueries({ queryKey: queryKeys.bootstrap });

  const switchLeagueMutation = useMutation({
    mutationKey: mutationKeys.switchLeague,
    mutationFn: caffeineClient.setActiveLeague,
    onMutate: cancelBootstrapRead,
    onSuccess: writeBootstrap,
  });
  const refreshMutation = useMutation({
    mutationKey: mutationKeys.refresh,
    mutationFn: caffeineClient.refreshActiveLeague,
    onMutate: cancelBootstrapRead,
    onSuccess: writeBootstrap,
  });
  const reportMutation = useMutation({
    mutationKey: mutationKeys.report,
    mutationFn: caffeineClient.generateReport,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
  const loginMutation = useMutation({
    mutationKey: mutationKeys.login,
    mutationFn: caffeineClient.loginCodex,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
  const logoutMutation = useMutation({
    mutationKey: mutationKeys.logout,
    mutationFn: caffeineClient.logoutCodex,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
  const clearMutation = useMutation({
    mutationKey: mutationKeys.clear,
    mutationFn: caffeineClient.clearLocalData,
    onMutate: cancelBootstrapRead,
    onSuccess: writeBootstrap,
  });
  const settingsMutation = useMutation({
    mutationKey: mutationKeys.settings,
    mutationFn: caffeineClient.updateAiSettings,
    onMutate: cancelBootstrapRead,
    onSuccess: writeBootstrap,
  });
  const pinMutation = useMutation({
    mutationKey: mutationKeys.draftPin,
    mutationFn: caffeineClient.toggleDraftCandidatePin,
    onMutate: cancelBootstrapRead,
    onSuccess: writeBootstrap,
  });
  const chatMutation = useMutation({
    mutationKey: mutationKeys.chat,
    mutationFn: caffeineClient.sendChat,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
  const weeklyPlanMutation = useMutation({
    mutationKey: mutationKeys.weeklyPlan,
    mutationFn: caffeineClient.generateWeeklyPlan,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
  const weeklyPhaseBriefMutation = useMutation({
    mutationKey: mutationKeys.weeklyPhaseBrief,
    mutationFn: caffeineClient.generateWeeklyPhaseBrief,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
  const weeklyActionMutation = useMutation({
    mutationKey: mutationKeys.weeklyAction,
    mutationFn: caffeineClient.updateWeeklyAction,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });

  const run = useCallback(
    async <T>(operation: Promise<T>): Promise<T> => {
      setError(null);
      try {
        return await operation;
      } catch (cause) {
        return fail(cause);
      }
    },
    [fail],
  );

  return {
    error,
    dismissError: () => setError(null),
    switchLeague: (leagueId: string) =>
      run(switchLeagueMutation.mutateAsync(leagueId)),
    refresh: () => run(refreshMutation.mutateAsync()),
    generateReport: (kind: ReportKind) => run(reportMutation.mutateAsync(kind)),
    login: () => run(loginMutation.mutateAsync()),
    logout: () => run(logoutMutation.mutateAsync()),
    clear: () => run(clearMutation.mutateAsync()),
    updateAiSettings: (settings: AiSettings) =>
      run(settingsMutation.mutateAsync(settings)),
    toggleDraftPin: (playerId: string) =>
      run(pinMutation.mutateAsync(playerId)),
    sendChat: (message: string) => run(chatMutation.mutateAsync(message)),
    generateWeeklyPlan: (input: WeeklyPlanRequest) =>
      weeklyPlanMutation.mutateAsync(input),
    generateWeeklyPhaseBrief: (input: WeeklyPhaseBriefRequest) =>
      weeklyPhaseBriefMutation.mutateAsync(input),
    updateWeeklyAction: (
      actionId: string,
      status: WeeklyActionStatus,
      note?: string | null,
    ) =>
      run(
        weeklyActionMutation.mutateAsync({
          actionId,
          status,
          ...(note === undefined ? {} : { note }),
        }),
      ),
    setBootstrap: writeBootstrap,
    pending: {
      clear: clearMutation.isPending,
      draftPin: pinMutation.isPending ? pinMutation.variables : null,
      login: loginMutation.isPending,
      logout: logoutMutation.isPending,
      report: reportMutation.isPending ? reportMutation.variables : null,
      settings: settingsMutation.isPending,
      switchLeague: switchLeagueMutation.isPending,
      refresh: refreshMutation.isPending,
      chat: chatMutation.isPending,
      weeklyPlan: weeklyPlanMutation.isPending
        ? weeklyPlanMutation.variables
        : null,
      weeklyPhaseBrief: weeklyPhaseBriefMutation.isPending
        ? weeklyPhaseBriefMutation.variables
        : null,
      weeklyAction: weeklyActionMutation.isPending
        ? weeklyActionMutation.variables.actionId
        : null,
    } satisfies CaffeinePendingState,
  };
}
