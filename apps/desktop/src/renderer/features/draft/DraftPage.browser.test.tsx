import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type {
  Dashboard,
  DraftCandidateView,
  PlayerView,
} from "@sleeper-caffeine/ipc-contract";
import { DraftPage } from "./DraftPage.js";
import "../../test/browser-styles.js";

test("filters, expands, and pins candidates without an AI turn", async () => {
  const onTogglePin = vi.fn();
  await render(
    <DraftPage
      dashboard={dashboard()}
      report={null}
      generating={null}
      codex={{
        state: "ready",
        binaryPath: "/usr/local/bin/codex",
        version: "test",
        email: "analyst@example.com",
        planType: "test",
        errorMessage: null,
        availableModels: [],
      }}
      onGenerate={vi.fn()}
      onLogin={vi.fn()}
      onRefresh={vi.fn()}
      onTogglePin={onTogglePin}
    />,
  );

  const receiverRow = page.getByRole("button", {
    name: /Receiver Prospect.*Baseline #1/,
  });
  const runningBackRow = page.getByRole("button", {
    name: /Running Back Prospect.*Baseline #2/,
  });
  await expect.element(receiverRow).toBeVisible();
  await expect.element(runningBackRow).toBeVisible();

  await page.getByRole("button", { name: "RB", exact: true }).click();
  await expect.element(runningBackRow).toBeVisible();
  await expect.element(receiverRow).not.toBeInTheDocument();

  await runningBackRow.click();
  await expect.element(page.getByText("88 baseline score")).toBeVisible();

  await page.getByRole("button", { name: "+ Pin" }).click();
  expect(onTogglePin).toHaveBeenCalledWith("rb-1");
});

test("turns on room-only polling without starting an AI turn", async () => {
  const onRefresh = vi.fn();
  const onGenerate = vi.fn();
  await renderDraft(dashboard(), { onRefresh, onGenerate });

  await page
    .getByRole("button", { name: "Auto-refresh off", exact: true })
    .click();

  expect(onRefresh).toHaveBeenCalledOnce();
  expect(onGenerate).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("button", { name: "Auto-refresh on", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.element(page.getByText("Waiting for pick one")).toBeVisible();
  await expect.element(page.getByText("Baseline value band")).toBeVisible();
});

test("explains scheduled and completed draft states", async () => {
  const scheduled = dashboard();
  if (!scheduled.draft) throw new Error("Expected a draft fixture");
  scheduled.draft.status = "scheduled";
  scheduled.draft.startTime = Date.parse("2026-08-20T19:00:00.000Z");
  scheduled.draft.candidates = [];
  const scheduledRender = await renderDraft(scheduled);

  await expect
    .element(page.getByText("Research the board now; react when picks begin."))
    .toBeVisible();
  await expect
    .element(page.getByText(/has not published an available-player pool/))
    .toBeVisible();
  await scheduledRender.unmount();

  const complete = dashboard();
  if (!complete.draft) throw new Error("Expected a draft fixture");
  complete.draft.status = "complete";
  complete.draft.sourceStatus = "complete";
  complete.draft.currentPickNo = null;
  complete.draft.myUpcomingPickNumbers = [];
  complete.draft.picks = [
    {
      pickNo: 2,
      round: 1,
      draftSlot: 2,
      rosterId: 1,
      isKeeper: false,
      player: player("wr-1", "Receiver Prospect", "WR"),
    },
  ];
  await renderDraft(complete);

  await expect
    .element(page.getByText("Your final board is preserved."))
    .toBeVisible();
  await expect.element(page.getByText("Research archive")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: /Auto-refresh off/ }))
    .toBeDisabled();
  await expect
    .element(page.getByText("Build one researched plan for the next decision."))
    .not.toBeInTheDocument();
});

async function renderDraft(
  value: Dashboard,
  overrides: {
    onRefresh?: () => void;
    onGenerate?: () => void;
  } = {},
) {
  return render(
    <DraftPage
      dashboard={value}
      report={null}
      generating={null}
      codex={{
        state: "ready",
        binaryPath: "/usr/local/bin/codex",
        version: "test",
        email: "analyst@example.com",
        planType: "test",
        errorMessage: null,
        availableModels: [],
      }}
      onGenerate={overrides.onGenerate ?? vi.fn()}
      onLogin={vi.fn()}
      onRefresh={overrides.onRefresh ?? vi.fn()}
      onTogglePin={vi.fn()}
    />,
  );
}

function dashboard(): Dashboard {
  return {
    league: {
      leagueId: "league-1",
      name: "Browser Test League",
      season: "2026",
      rosterId: 1,
      userId: "user-1",
      teamName: "Test Roasters",
      avatar: null,
      lastRefreshedAt: "2026-07-17T12:00:00.000Z",
      isActive: true,
    },
    capturedAt: "2026-07-17T12:00:00.000Z",
    week: 1,
    leagueStatus: "drafting",
    scoringLabel: "PPR",
    rosterPositions: ["QB", "RB", "WR", "FLEX"],
    starters: [],
    bench: [],
    reserve: [],
    taxi: [],
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0 },
    pickInventory: null,
    warnings: [],
    nextMatchup: null,
    draft: {
      draftId: "draft-1",
      status: "live",
      sourceStatus: "drafting",
      type: "snake",
      startTime: null,
      lastPicked: 1,
      rounds: 2,
      teams: 2,
      totalPicks: 4,
      currentPickNo: 2,
      boardHash: "browser-board",
      picks: [],
      draftTeams: [],
      board: [],
      myUpcomingPickNumbers: [2, 4],
      candidatePoolMode: "rookies",
      candidates: [
        candidate("wr-1", "Receiver Prospect", "WR", 1),
        candidate("rb-1", "Running Back Prospect", "RB", 2),
      ],
    },
  };
}

function candidate(
  playerId: string,
  name: string,
  position: string,
  rank: number,
): DraftCandidateView {
  return {
    rank,
    player: player(playerId, name, position),
    marketRank: rank,
    positionRank: rank,
    score: 90 - rank,
    fitLabel: "value",
    rationale: `Baseline rationale for ${playerId}`,
    pinned: false,
    scoreBreakdown: {
      market: 60,
      rosterFit: 15,
      scarcity: 10,
      pickWindow: 10,
      upside: 5,
    },
  };
}

function player(playerId: string, name: string, position: string): PlayerView {
  return {
    playerId,
    name,
    position,
    nflTeam: "TEST",
    injuryStatus: null,
    status: "Active",
    isStarter: false,
    isReserve: false,
    isTaxi: false,
    rosterSlot: null,
  };
}
