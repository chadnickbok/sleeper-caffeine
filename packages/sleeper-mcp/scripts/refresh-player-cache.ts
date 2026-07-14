import {
  PlayerCache,
  PlayerDirectory,
  SleeperApi,
} from "@sleeper-caffeine/core";
import { loadConfig } from "../src/config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const directory = new PlayerDirectory(
    new PlayerCache(new SleeperApi(), { cacheDir: config.cacheDir }),
  );
  const result = await directory.refresh();
  process.stderr.write(
    `Refreshed ${String(result.players.size)} NFL players at ${result.fetchedAt}${result.stale ? " (stale fallback)" : ""}.\n`,
  );
  if (result.stale) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Player cache refresh failed: ${message}\n`);
  process.exitCode = 1;
});
