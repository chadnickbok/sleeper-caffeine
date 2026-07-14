import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexSupervisor } from "@sleeper-caffeine/codex-runtime";
import type { Dashboard, ReportPayload } from "@sleeper-caffeine/ipc-contract";
import { describe, expect, it, vi } from "vitest";
import { AppRuntime, parseLeagueId } from "./runtime.js";

describe("parseLeagueId", () => {
  it("accepts a numeric Sleeper league ID", () => {
    expect(parseLeagueId("289646328504385536")).toBe("289646328504385536");
  });

  it("extracts IDs from Sleeper league URLs", () => {
    expect(
      parseLeagueId("https://sleeper.com/leagues/289646328504385536/"),
    ).toBe("289646328504385536");
  });

  it("rejects unrelated URLs", () => {
    expect(() => parseLeagueId("https://example.com/not-sleeper")).toThrow(
      "Sleeper league URL",
    );
  });
});

describe("report generation", () => {
  it("persists a low-effort micro summary after the full report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sleeper-caffeine-report-"));
    const runtime = new AppRuntime(directory);
    const fullReport: ReportPayload = {
      headline: "The complete team analysis",
      summary: "A long-form summary for the full report view.",
      confidence: "high",
      cards: [],
      actions: [],
      sources: [],
      caveats: [],
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({
        threadId: "report-thread",
        turnId: "full-turn",
        text: JSON.stringify(fullReport),
      })
      .mockResolvedValueOnce({
        threadId: "report-thread",
        turnId: "micro-turn",
        text: JSON.stringify({
          headline: "Elite backs anchor a fragile contender",
          summary:
            "The backfield creates an edge, but receiver depth remains thin.",
        }),
      });
    runtime.codex = {
      runTurn,
      getStatus: () => ({
        state: "ready",
        binaryPath: "/usr/local/bin/codex",
        version: "test",
        email: "test@example.com",
        planType: "test",
        errorMessage: null,
        availableModels: [
          {
            model: "gpt-5.6-terra",
            displayName: "GPT-5.6 Terra",
            description: "Test model",
            isDefault: true,
            defaultReasoningEffort: "low",
            supportedReasoningEfforts: [{ effort: "low", description: "Fast" }],
          },
        ],
      }),
    } as unknown as CodexSupervisor;

    const dashboard: Dashboard = {
      league: {
        leagueId: "league-1",
        name: "Test League",
        season: "2026",
        rosterId: 1,
        userId: "user-1",
        teamName: "Test Team",
        avatar: null,
        lastRefreshedAt: "2026-07-14T12:00:00.000Z",
        isActive: true,
      },
      capturedAt: "2026-07-14T12:00:00.000Z",
      week: 1,
      leagueStatus: "pre_draft",
      scoringLabel: "PPR",
      rosterPositions: [],
      starters: [],
      bench: [],
      reserve: [],
      taxi: [],
      record: { wins: 0, losses: 0, ties: 0, pointsFor: 0 },
      pickInventory: null,
      warnings: [],
      draft: null,
      nextMatchup: null,
    };
    runtime.store.saveLeague({
      leagueId: dashboard.league.leagueId,
      name: dashboard.league.name,
      season: dashboard.league.season,
      team: {
        rosterId: 1,
        userId: "user-1",
        username: "tester",
        displayName: "Tester",
        teamName: "Test Team",
        avatar: null,
        record: "0-0",
      },
    });
    runtime.store.saveDashboard(dashboard, {});

    try {
      const report = await runtime.generateReport("team_analysis");
      expect(runTurn).toHaveBeenCalledTimes(2);
      const microSummaryRequest = runTurn.mock.calls[1]?.[0] as {
        threadId: string;
        model: string;
        effort: string;
        prompt: string;
      };
      expect(microSummaryRequest).toMatchObject({
        threadId: "report-thread",
        model: "gpt-5.6-terra",
        effort: "low",
      });
      expect(microSummaryRequest.prompt).toContain(
        "Do not call tools, use web search, introduce new facts",
      );
      expect(microSummaryRequest.prompt).toContain(
        "hard limit of 100 characters",
      );
      expect(microSummaryRequest.prompt).toContain("first three lines");
      expect(report.microSummary).toEqual({
        headline: "Elite backs anchor a fragile contender",
        summary:
          "The backfield creates an edge, but receiver depth remains thin.",
        model: "gpt-5.6-terra",
        promptVersion: "1",
      });
      expect(runtime.store.getReports("league-1")[0]?.microSummary).toEqual(
        report.microSummary,
      );
      expect(report.microSummary).not.toHaveProperty("generatedAt");
    } finally {
      runtime.store.close();
    }
  });
});
