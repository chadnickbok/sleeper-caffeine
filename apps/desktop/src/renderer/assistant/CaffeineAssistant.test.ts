import type { ChatMessage } from "@sleeper-caffeine/ipc-contract";
import { describe, expect, it } from "vitest";
import {
  mergeMessages,
  withRunMessages,
  type CaffeineChatRun,
} from "./CaffeineAssistant.js";

function message(
  id: string,
  role: "user" | "assistant",
  content = id,
): ChatMessage {
  return {
    id,
    leagueId: "league-1",
    role,
    content,
    createdAt: "2026-07-17T12:00:00.000Z",
  };
}

describe("Caffeine assistant message adaptation", () => {
  it("deduplicates overlapping persisted history pages", () => {
    expect(
      mergeMessages(
        [message("one", "user"), message("two", "assistant")],
        [message("two", "assistant"), message("three", "user")],
      ).map((entry) => entry.id),
    ).toEqual(["one", "two", "three"]);
  });

  it("replaces a streaming placeholder with the persisted completion", () => {
    const userMessage = message("question", "user", "Who should I draft?");
    const run: CaffeineChatRun = {
      leagueId: "league-1",
      runId: "run-1",
      userMessage,
      delta: "Start with",
      status: "running",
      assistantMessage: null,
      error: null,
    };

    const streaming = withRunMessages([], run);
    expect(streaming.map((entry) => entry.id)).toEqual([
      "question",
      "run:run-1",
    ]);
    expect(streaming[1]).toMatchObject({
      content: "Start with",
      runtimeStatus: "running",
    });

    const completed = withRunMessages([userMessage], {
      ...run,
      status: "complete",
      assistantMessage: message("answer", "assistant", "Draft the receiver."),
    });
    expect(completed.map((entry) => entry.id)).toEqual(["question", "answer"]);
    expect(completed.some((entry) => entry.id === "run:run-1")).toBe(false);
  });
});
