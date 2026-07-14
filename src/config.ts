import { resolve } from "node:path";
import { z } from "zod/v4";

const EnvironmentSchema = z.object({
  SLEEPER_CACHE_DIR: z.string().trim().min(1).optional(),
  SLEEPER_LOG_LEVEL: z.enum(["silent", "error", "info", "debug"]).default("error"),
});

export type AppConfig = {
  cacheDir: string;
  logLevel: "silent" | "error" | "info" | "debug";
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.parse(env);
  return {
    cacheDir: resolve(parsed.SLEEPER_CACHE_DIR ?? ".cache/sleeper"),
    logLevel: parsed.SLEEPER_LOG_LEVEL,
  };
}
