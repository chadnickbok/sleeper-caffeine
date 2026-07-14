import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppRuntime } from "./runtime.js";

const live =
  process.env.RUN_CODEX_LIVE_TESTS === "1" ? describe : describe.skip;

live("Codex app-server integration", () => {
  it("starts with an isolated home and discovers the local Sleeper MCP", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-codex-"));
    const runtime = new AppRuntime(directory);
    try {
      await runtime.start();
      expect(runtime.mcp.getStatus().state).toBe("running");
      expect(runtime.codex?.getStatus().binaryPath).toBeTruthy();
      expect(["signed_out", "ready"]).toContain(
        runtime.codex?.getStatus().state,
      );
    } finally {
      await runtime.stop();
    }
  }, 30_000);
});
