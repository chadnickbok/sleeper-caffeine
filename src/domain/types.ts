import type { PlayerDirectory } from "../players/directory.js";
import type { SleeperApi } from "../sleeper/endpoints.js";

export type ToolWarning = {
  code: string;
  message: string;
};

export type CacheMetadata = {
  players_fetched_at: string;
  players_stale: boolean;
};

export type DomainResult<T extends Record<string, unknown>> = {
  data: T;
  warnings: ToolWarning[];
  cache?: CacheMetadata;
};

export type DomainDependencies = {
  api: SleeperApi;
  players: PlayerDirectory;
};
