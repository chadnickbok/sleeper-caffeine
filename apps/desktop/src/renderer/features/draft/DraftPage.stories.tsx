import type { Meta, StoryObj } from "@storybook/react-vite";
import type {
  CodexStatus,
  Dashboard,
  DraftCandidateView,
  PlayerView,
} from "@sleeper-caffeine/ipc-contract";
import { dashboardFixture } from "../../test/fixtures.js";
import { DraftPage } from "./DraftPage.js";

const ready: CodexStatus = {
  state: "ready",
  binaryPath: "/usr/local/bin/codex",
  version: "test",
  email: "analyst@example.com",
  planType: "test",
  errorMessage: null,
  availableModels: [],
};

const meta = {
  title: "Caffeine/Draft Room",
  component: DraftPage,
  parameters: { layout: "fullscreen" },
  args: {
    dashboard: liveDraft(),
    report: null,
    generating: null,
    codex: ready,
    onGenerate: () => undefined,
    onLogin: () => undefined,
    onRefresh: () => undefined,
    onTogglePin: () => undefined,
  },
} satisfies Meta<typeof DraftPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveSlowDraft: Story = {};

export const ScheduledResearch: Story = {
  args: { dashboard: scheduledDraft() },
};

export const CompletedArchive: Story = {
  args: { dashboard: completedDraft() },
};

function liveDraft(): Dashboard {
  const dashboard = dashboardFixture();
  const prospects = [
    candidate("rookie-wr-1", "Antonio Williams", "WR", 1, 93),
    candidate("rookie-rb-1", "Emmett Johnson", "RB", 2, 91),
    candidate("rookie-qb-1", "Ty Simpson", "QB", 3, 89),
    candidate("rookie-rb-2", "Mike Washington", "RB", 4, 87),
    candidate("rookie-te-1", "Kenyon Sadiq", "TE", 5, 84),
    candidate("rookie-wr-2", "Ja'Kobi Lane", "WR", 6, 82),
  ];
  const picked = [
    draftPlayer("pick-1", "First Runner", "RB"),
    draftPlayer("pick-2", "Top Receiver", "WR"),
    draftPlayer("pick-3", "Second Receiver", "WR"),
  ];
  dashboard.leagueStatus = "drafting";
  dashboard.draft = {
    draftId: "story-draft",
    status: "pending",
    sourceStatus: "pre_draft",
    type: "snake",
    startTime: null,
    lastPicked: 3,
    rounds: 2,
    teams: 4,
    totalPicks: 8,
    currentPickNo: 4,
    boardHash: "story-board-3",
    picks: picked.map((player, index) => ({
      pickNo: index + 1,
      round: 1,
      draftSlot: index + 1,
      rosterId: index + 2,
      isKeeper: false,
      player,
    })),
    draftTeams: [
      team(1, 2, "Sunday Scaries"),
      team(2, 3, "Fourth & Coffee"),
      team(3, 4, "Waiver Weather"),
      team(4, 1, "The Test Roasters", true),
    ],
    board: Array.from({ length: 8 }, (_, index) => {
      const pickNo = index + 1;
      const round = Math.floor(index / 4) + 1;
      const draftSlot = (index % 4) + 1;
      const pick =
        pickNo <= picked.length
          ? {
              pickNo,
              round,
              draftSlot,
              rosterId: pickNo + 1,
              isKeeper: false,
              player: picked[pickNo - 1] ?? null,
            }
          : null;
      return {
        pickNo,
        round,
        draftSlot,
        originalRosterId: draftSlot === 4 ? 1 : draftSlot + 1,
        ownerRosterId: draftSlot === 4 ? 1 : draftSlot + 1,
        ownerTeamName:
          draftSlot === 4 ? "The Test Roasters" : `Team ${String(draftSlot)}`,
        isMine: draftSlot === 4,
        isTraded: false,
        isOnClock: pickNo === 4,
        pick,
      };
    }),
    myUpcomingPickNumbers: [4, 5],
    candidatePoolMode: "rookies",
    candidates: prospects,
  };
  return dashboard;
}

function scheduledDraft() {
  const dashboard = liveDraft();
  if (!dashboard.draft) return dashboard;
  dashboard.draft.status = "scheduled";
  dashboard.draft.sourceStatus = "pre_draft";
  dashboard.draft.startTime = Date.parse("2026-08-20T19:00:00.000Z");
  dashboard.draft.lastPicked = null;
  dashboard.draft.currentPickNo = 1;
  dashboard.draft.picks = [];
  dashboard.draft.boardHash = "scheduled-board";
  dashboard.draft.board = dashboard.draft.board.map((cell) => ({
    ...cell,
    pick: null,
    isOnClock: false,
  }));
  return dashboard;
}

function completedDraft() {
  const dashboard = liveDraft();
  if (!dashboard.draft) return dashboard;
  const mySelection = draftPlayer("rookie-wr-1", "Antonio Williams", "WR");
  dashboard.draft.status = "complete";
  dashboard.draft.sourceStatus = "complete";
  dashboard.draft.currentPickNo = null;
  dashboard.draft.myUpcomingPickNumbers = [];
  dashboard.draft.picks.push(
    {
      pickNo: 4,
      round: 1,
      draftSlot: 4,
      rosterId: 1,
      isKeeper: false,
      player: mySelection,
    },
    ...[
      draftPlayer("pick-5", "Upside Runner", "RB"),
      draftPlayer("pick-6", "Young Tight End", "TE"),
      draftPlayer("pick-7", "Pocket Passer", "QB"),
      draftPlayer("pick-8", "Final Receiver", "WR"),
    ].map((player, index) => {
      const pickNo = index + 5;
      return {
        pickNo,
        round: 2,
        draftSlot: pickNo - 4,
        rosterId: pickNo === 5 ? 1 : 10 - pickNo,
        isKeeper: false,
        player,
      };
    }),
  );
  dashboard.draft.board = dashboard.draft.board.map((cell) => ({
    ...cell,
    isOnClock: false,
    pick:
      dashboard.draft?.picks.find((pick) => pick.pickNo === cell.pickNo) ??
      null,
  }));
  dashboard.draft.candidates = dashboard.draft.candidates.filter(
    (item) => item.player.playerId !== mySelection.playerId,
  );
  return dashboard;
}

function candidate(
  playerId: string,
  name: string,
  position: string,
  rank: number,
  score: number,
): DraftCandidateView {
  return {
    rank,
    player: draftPlayer(playerId, name, position),
    marketRank: rank * 4,
    positionRank: rank,
    score,
    fitLabel: rank === 1 ? "primary_fit" : rank < 4 ? "value" : "ceiling",
    rationale:
      rank === 1
        ? "Best blend of market value, roster fit, and current pick window."
        : "Strong Sleeper market signal inside the current candidate band.",
    pinned: rank === 5,
    scoreBreakdown: {
      market: Math.max(30, 70 - rank * 4),
      rosterFit: 14,
      scarcity: 9,
      pickWindow: 12,
      upside: 8,
    },
  };
}

function draftPlayer(
  playerId: string,
  name: string,
  position: string,
): PlayerView {
  return {
    playerId,
    name,
    position,
    nflTeam: "NFL",
    injuryStatus: null,
    status: "Active",
    isStarter: false,
    isReserve: false,
    isTaxi: false,
    rosterSlot: null,
  };
}

function team(
  draftSlot: number,
  rosterId: number,
  teamName: string,
  isMine = false,
) {
  return { draftSlot, rosterId, teamName, avatar: null, isMine };
}
