import { describe, expect, it } from "vitest";
import { selectFinalAgentMessage } from "./supervisor.js";

describe("selectFinalAgentMessage", () => {
  it("uses the final agent item instead of concatenated progress text", () => {
    expect(
      selectFinalAgentMessage(
        [
          { type: "agentMessage", text: "I will inspect the league." },
          { type: "mcpToolCall", tool: "get_team_snapshot" },
          { type: "agentMessage", text: '{"headline":"Final report"}' },
        ],
        "streamed fallback",
      ),
    ).toBe('{"headline":"Final report"}');
  });

  it("falls back to streamed text when completed items are absent", () => {
    expect(selectFinalAgentMessage(undefined, "streamed response")).toBe(
      "streamed response",
    );
  });
});
