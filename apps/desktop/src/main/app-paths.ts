import { join } from "node:path";

export type AppPaths = ReturnType<typeof resolveAppPaths>;

export function resolveAppPaths(userDataDir: string) {
  return {
    cacheDir: join(userDataDir, "cache", "sleeper"),
    databasePath: join(userDataDir, "sleeper-caffeine.sqlite"),
    codexHome: join(userDataDir, "codex-home"),
    analystWorkspace: join(userDataDir, "analyst-workspace"),
  };
}
