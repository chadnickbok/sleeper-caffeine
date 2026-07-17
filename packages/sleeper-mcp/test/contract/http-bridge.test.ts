import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { LocalMcpBridge } from "../../src/mcp/transports/http.js";
import { createFixtureDependencies } from "../helpers.js";

const running: LocalMcpBridge[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((bridge) => bridge.stop()));
});

describe("LocalMcpBridge", () => {
  it("serves the standalone Sleeper tools over streamable HTTP", async () => {
    const bridge = new LocalMcpBridge({
      dependencies: await createFixtureDependencies(),
      port: 0,
    });
    running.push(bridge);
    const status = await bridge.start();
    const client = new Client({ name: "http-contract-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(status.endpoint),
    );
    await client.connect(transport as Parameters<Client["connect"]>[0]);

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "get_draft_snapshot",
      "get_team_snapshot",
      "get_available_players",
      "get_matchup_context",
      "get_trade_context",
      "get_league_history",
    ]);
    expect(bridge.getStatus().connectedSessions).toBe(1);
    await client.close();
  });
});
