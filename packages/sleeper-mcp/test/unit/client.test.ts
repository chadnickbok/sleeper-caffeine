import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { SleeperClient, type FetchLike } from "@sleeper-caffeine/core";
import { jsonResponse } from "../helpers.js";

describe("SleeperClient", () => {
  it("retries transient responses and validates the result", async () => {
    const fetch = vi.fn<FetchLike>();
    fetch.mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503));
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const sleep = vi.fn(async () => undefined);
    const client = new SleeperClient({
      fetch,
      maxRetries: 1,
      random: () => 0,
      sleep,
    });

    await expect(
      client.get("/test", z.object({ ok: z.boolean() })),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("maps 404 responses to a stable error", async () => {
    const client = new SleeperClient({
      fetch: async () => jsonResponse({}, 404),
      maxRetries: 0,
    });

    await expect(client.get("/missing", z.object({}))).rejects.toMatchObject({
      code: "SLEEPER_NOT_FOUND",
    });
  });

  it("rejects unexpected successful payloads", async () => {
    const client = new SleeperClient({
      fetch: async () => jsonResponse({ nope: true }),
      maxRetries: 0,
    });

    await expect(
      client.get("/shape", z.object({ ok: z.boolean() })),
    ).rejects.toMatchObject({
      code: "INVALID_SLEEPER_RESPONSE",
    });
  });

  it("rejects paths that could replace the fixed host", async () => {
    const client = new SleeperClient({ fetch: async () => jsonResponse({}) });
    await expect(
      client.get("//example.com", z.object({})),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
