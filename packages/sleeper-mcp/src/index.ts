#!/usr/bin/env node
import {
  PlayerCache,
  PlayerDirectory,
  SleeperApi,
} from "@sleeper-caffeine/core";
import { loadConfig } from "./config.js";
import { createServer } from "./mcp/create-server.js";
import { connectStdio } from "./mcp/transports/stdio.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new SleeperApi();
  const players = new PlayerDirectory(
    new PlayerCache(api, { cacheDir: config.cacheDir }),
  );
  const server = createServer({ api, players });

  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await connectStdio(server);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Sleeper MCP failed to start: ${message}\n`);
  process.exitCode = 1;
});
