import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/mcp/create-server.js";
import { createFixtureDependencies } from "../helpers.js";

describe("MCP server contract", () => {
  it("advertises exactly the five read-only tools and returns structured content", async () => {
    const server = createServer(await createFixtureDependencies());
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
        "get_available_players",
        "get_league_history",
        "get_matchup_context",
        "get_team_snapshot",
        "get_trade_context",
      ]);
      for (const tool of listed.tools) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        });
        expect(tool.outputSchema).toBeDefined();
      }

      const result = CallToolResultSchema.parse(
        await client.callTool({
          name: "get_available_players",
          arguments: { league_id: "12345", positions: ["WR"], limit: 10 },
        }),
      );
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        source: "sleeper",
        data: {
          league_id: "12345",
          total_matching: 1,
          players: [{ player_id: "p4", roster_availability: true }],
        },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns safe tool errors without internal details", async () => {
    const server = createServer(await createFixtureDependencies());
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const result = CallToolResultSchema.parse(
        await client.callTool({
          name: "get_team_snapshot",
          arguments: { league_id: "12345", username_or_user_id: "not_a_fixture", week: 3 },
        }),
      );
      expect(result.isError).toBe(true);
      const text = result.content[0];
      expect(text).toMatchObject({ type: "text" });
      if (text?.type === "text") {
        expect(text.text).toContain("SLEEPER_NOT_FOUND");
        expect(text.text).not.toContain("/Users/");
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
