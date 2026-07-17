import { useQueryClient } from "@tanstack/react-query";
import type { Bootstrap, RuntimeEvent } from "@sleeper-caffeine/ipc-contract";
import { useEffect } from "react";
import { caffeineClient } from "../api/caffeine-client.js";
import { queryKeys } from "../api/query-keys.js";

export function useRuntimeEvents(onEvent: (event: RuntimeEvent) => void): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      caffeineClient.onRuntimeEvent((event) => {
        if (event.type === "bootstrap_changed")
          void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
        if (event.type === "codex_status")
          queryClient.setQueryData<Bootstrap>(queryKeys.bootstrap, (current) =>
            current ? { ...current, codex: event.status } : current,
          );
        if (event.type === "mcp_status")
          queryClient.setQueryData<Bootstrap>(queryKeys.bootstrap, (current) =>
            current ? { ...current, mcp: event.status } : current,
          );
        if (event.type === "draft_changed")
          void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
        onEvent(event);
      }),
    [onEvent, queryClient],
  );
}
