import { createHash } from "node:crypto";
import type {
  Draft,
  DraftPick,
  PlayerSummary,
  Roster,
  SleeperUser,
  TradedPick,
} from "@sleeper-caffeine/core";
import type {
  DraftCandidateView,
  DraftView,
  PlayerView,
  SavedLeague,
} from "@sleeper-caffeine/ipc-contract";

type ConcreteDraftView = NonNullable<DraftView>;

export function selectDraft(
  drafts: Draft[],
  preferredDraftId: string | null | undefined,
): Draft | undefined {
  const preferred = preferredDraftId
    ? drafts.find((draft) => draft.draft_id === preferredDraftId)
    : undefined;
  if (preferred) return preferred;
  return [...drafts].sort(
    (a, b) =>
      sourceStatusPriority(a.status) - sourceStatusPriority(b.status) ||
      (b.last_picked ?? b.start_time ?? b.created ?? 0) -
        (a.last_picked ?? a.start_time ?? a.created ?? 0),
  )[0];
}

export function buildDraftModel(input: {
  draft: Draft;
  picks: DraftPick[];
  tradedPicks: TradedPick[];
  saved: SavedLeague;
  rosters: Roster[];
  users: SleeperUser[];
  players: ReadonlyMap<string, PlayerSummary>;
  rosterPositions: string[];
  leagueSettings: Record<string, unknown>;
  pinnedPlayerIds: ReadonlySet<string>;
  now?: number;
}): ConcreteDraftView {
  const { draft, picks, saved, rosters, users, players } = input;
  const teams = integerSetting(draft.settings["teams"]);
  const rounds = integerSetting(draft.settings["rounds"]);
  const totalPicks = teams && rounds ? teams * rounds : null;
  const supported = draft.type === "linear" || draft.type === "snake";
  const pickByNumber = new Map<number, DraftPick>();
  for (const pick of picks) pickByNumber.set(pick.pick_no, pick);
  const status = derivedStatus({
    sourceStatus: draft.status,
    picks: [...pickByNumber.values()],
    totalPicks,
    startTime: draft.start_time ?? null,
    supported,
    now: input.now ?? Date.now(),
  });
  const currentPickNo =
    status === "live" && totalPicks
      ? firstMissingPick(pickByNumber, totalPicks)
      : null;
  const rosterById = new Map(
    rosters.map((roster) => [roster.roster_id, roster]),
  );
  const userById = new Map(users.map((user) => [user.user_id, user]));
  const rosterIdBySlot = slotRosterMap(draft, rosters, teams);
  const teamName = (rosterId: number | null): string | null => {
    if (rosterId === null) return null;
    const roster = rosterById.get(rosterId);
    const user = roster?.owner_id ? userById.get(roster.owner_id) : undefined;
    const metadataName = user?.metadata?.["team_name"];
    return typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : (user?.display_name ?? user?.username ?? `Roster ${String(rosterId)}`);
  };

  const draftTeams = teams
    ? Array.from({ length: teams }, (_, index) => {
        const draftSlot = index + 1;
        const rosterId = rosterIdBySlot.get(draftSlot) ?? null;
        const roster = rosterId === null ? undefined : rosterById.get(rosterId);
        const user = roster?.owner_id
          ? userById.get(roster.owner_id)
          : undefined;
        return {
          draftSlot,
          rosterId,
          teamName: teamName(rosterId) ?? `Slot ${String(draftSlot)}`,
          avatar: user?.avatar ?? null,
          isMine: rosterId === saved.rosterId,
        };
      })
    : [];

  const board =
    supported && teams && rounds
      ? Array.from(
          { length: rounds },
          (_, roundIndex) => roundIndex + 1,
        ).flatMap((round) =>
          Array.from({ length: teams }, (_, slotIndex) => {
            const draftSlot = slotIndex + 1;
            const pickNo = pickNumberForSlot(
              draft.type,
              round,
              draftSlot,
              teams,
              integerSetting(draft.settings["reversal_round"]),
            );
            const pick = pickByNumber.get(pickNo);
            const originalRosterId = rosterIdBySlot.get(draftSlot) ?? null;
            const tradedOwner = currentOwnerForPick(
              draft.season,
              round,
              originalRosterId,
              input.tradedPicks,
            );
            const ownerRosterId = pick?.roster_id ?? tradedOwner;
            return {
              pickNo,
              round,
              draftSlot,
              originalRosterId,
              ownerRosterId,
              ownerTeamName: teamName(ownerRosterId),
              isMine: ownerRosterId === saved.rosterId,
              isTraded:
                ownerRosterId !== null &&
                originalRosterId !== null &&
                ownerRosterId !== originalRosterId,
              isOnClock: pickNo === currentPickNo,
              pick: pick ? pickView(pick, players) : null,
            };
          }),
        )
      : [];
  const myUpcomingPickNumbers = board
    .filter((cell) => cell.isMine && cell.pick === null)
    .map((cell) => cell.pickNo)
    .sort((a, b) => a - b);
  const candidatePoolMode = inferCandidatePoolMode({
    draft,
    picks,
    players,
    leagueSettings: input.leagueSettings,
    rounds,
  });
  const candidates = rankCandidates({
    players,
    rosters,
    saved,
    rosterPositions: input.rosterPositions,
    picks,
    pinnedPlayerIds: input.pinnedPlayerIds,
    candidatePoolMode,
    currentPickNo,
    nextPickNo: myUpcomingPickNumbers[0] ?? null,
  });
  const normalizedPicks = [...pickByNumber.values()]
    .sort((a, b) => a.pick_no - b.pick_no)
    .map((pick) => pickView(pick, players));
  const boardHash = createHash("sha256")
    .update(
      JSON.stringify(
        board.map((cell) => ({
          pickNo: cell.pickNo,
          ownerRosterId: cell.ownerRosterId,
          playerId: cell.pick?.player?.playerId ?? null,
          isKeeper: cell.pick?.isKeeper ?? false,
        })),
      ),
    )
    .digest("hex")
    .slice(0, 16);

  return {
    draftId: draft.draft_id,
    status,
    sourceStatus: draft.status,
    type: draft.type,
    startTime: draft.start_time ?? null,
    lastPicked: draft.last_picked ?? null,
    rounds,
    teams,
    totalPicks,
    currentPickNo,
    boardHash,
    picks: normalizedPicks,
    draftTeams,
    board,
    myUpcomingPickNumbers,
    candidatePoolMode,
    candidates,
  };
}

export function pickNumberForSlot(
  type: string,
  round: number,
  draftSlot: number,
  teams: number,
  reversalRound: number | null = null,
): number {
  if (type !== "snake") return (round - 1) * teams + draftSlot;
  let reverse = round % 2 === 0;
  if (reversalRound && round >= reversalRound) reverse = !reverse;
  const position = reverse ? teams - draftSlot + 1 : draftSlot;
  return (round - 1) * teams + position;
}

function derivedStatus(input: {
  sourceStatus: string;
  picks: DraftPick[];
  totalPicks: number | null;
  startTime: number | null;
  supported: boolean;
  now: number;
}): ConcreteDraftView["status"] {
  if (!input.supported) return "unsupported";
  const uniquePicks = new Set(input.picks.map((pick) => pick.pick_no)).size;
  if (
    input.sourceStatus === "complete" ||
    (input.totalPicks !== null && uniquePicks >= input.totalPicks)
  )
    return "complete";
  if (
    uniquePicks > 0 ||
    input.sourceStatus === "drafting" ||
    input.sourceStatus === "in_progress"
  )
    return "live";
  if (input.startTime !== null && input.startTime > input.now)
    return "scheduled";
  return "pending";
}

function firstMissingPick(
  picks: ReadonlyMap<number, DraftPick>,
  totalPicks: number,
): number | null {
  for (let pickNo = 1; pickNo <= totalPicks; pickNo += 1)
    if (!picks.has(pickNo)) return pickNo;
  return null;
}

function slotRosterMap(
  draft: Draft,
  rosters: Roster[],
  teams: number | null,
): Map<number, number> {
  const result = new Map<number, number>();
  for (const [slot, rosterId] of Object.entries(
    draft.slot_to_roster_id ?? {},
  )) {
    const parsedSlot = Number(slot);
    const parsedRoster = Number(rosterId);
    if (Number.isInteger(parsedSlot) && Number.isInteger(parsedRoster))
      result.set(parsedSlot, parsedRoster);
  }
  if (result.size === 0) {
    for (const [userId, slot] of Object.entries(draft.draft_order ?? {})) {
      const roster = rosters.find((candidate) => candidate.owner_id === userId);
      if (roster) result.set(slot, roster.roster_id);
    }
  }
  if (result.size === 0 && teams) {
    [...rosters]
      .sort((a, b) => a.roster_id - b.roster_id)
      .slice(0, teams)
      .forEach((roster, index) => result.set(index + 1, roster.roster_id));
  }
  return result;
}

function currentOwnerForPick(
  season: string,
  round: number,
  originalRosterId: number | null,
  tradedPicks: TradedPick[],
): number | null {
  if (originalRosterId === null) return null;
  const trade = [...tradedPicks]
    .reverse()
    .find(
      (candidate) =>
        candidate.season === season &&
        candidate.round === round &&
        candidate.roster_id === originalRosterId,
    );
  return trade?.owner_id ?? originalRosterId;
}

function pickView(
  pick: DraftPick,
  players: ReadonlyMap<string, PlayerSummary>,
) {
  const player = players.get(pick.player_id);
  return {
    pickNo: pick.pick_no,
    round: pick.round,
    draftSlot: pick.draft_slot,
    rosterId: pick.roster_id ?? null,
    isKeeper: pick.is_keeper ?? false,
    player: player ? playerView(player) : null,
  };
}

function rankCandidates(input: {
  players: ReadonlyMap<string, PlayerSummary>;
  rosters: Roster[];
  saved: SavedLeague;
  rosterPositions: string[];
  picks: DraftPick[];
  pinnedPlayerIds: ReadonlySet<string>;
  candidatePoolMode: "rookies" | "all";
  currentPickNo: number | null;
  nextPickNo: number | null;
}): DraftCandidateView[] {
  const rostered = new Set(
    input.rosters.flatMap((roster) => roster.players ?? []),
  );
  const drafted = new Set(input.picks.map((pick) => pick.player_id));
  const supportedPositions = new Set(["QB", "RB", "WR", "TE"]);
  const market = [...input.players.values()]
    .filter((player) => {
      const position = player.position?.toUpperCase() ?? null;
      const status = player.status?.toLowerCase() ?? "";
      return (
        position !== null &&
        supportedPositions.has(position) &&
        player.search_rank !== null &&
        !rostered.has(player.player_id) &&
        !drafted.has(player.player_id) &&
        status !== "retired" &&
        status !== "inactive" &&
        (input.candidatePoolMode === "all" || player.years_exp === 0)
      );
    })
    .sort(
      (a, b) =>
        (a.search_rank ?? Number.MAX_SAFE_INTEGER) -
          (b.search_rank ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    );
  const myRoster = input.rosters.find(
    (roster) => roster.roster_id === input.saved.rosterId,
  );
  const rosterPositionCounts = new Map<string, number>();
  const effectiveRosterPlayerIds = new Set([
    ...(myRoster?.players ?? []),
    ...input.picks
      .filter((pick) => pick.roster_id === input.saved.rosterId)
      .map((pick) => pick.player_id),
  ]);
  for (const playerId of effectiveRosterPlayerIds) {
    const position = input.players.get(playerId)?.position?.toUpperCase();
    if (position)
      rosterPositionCounts.set(
        position,
        (rosterPositionCounts.get(position) ?? 0) + 1,
      );
  }
  const desiredDepth = desiredRosterDepth(input.rosterPositions);
  const positionOrdinals = new Map<string, number>();
  const selectionsUntilPick =
    input.currentPickNo && input.nextPickNo
      ? Math.max(1, input.nextPickNo - input.currentPickNo)
      : 6;
  const scored = market.map((player, index) => {
    const position = player.position?.toUpperCase() ?? "";
    const positionRank = (positionOrdinals.get(position) ?? 0) + 1;
    positionOrdinals.set(position, positionRank);
    const marketScore = clamp(102 - index * 2, 20, 100);
    const rosterCount = rosterPositionCounts.get(position) ?? 0;
    const desired = desiredDepth.get(position) ?? 2;
    const rosterFit = clamp(55 + (desired - rosterCount) * 12, 25, 100);
    const scarcity = clamp(105 - (positionRank - 1) * 8, 30, 100);
    const pickWindow = clamp(
      100 - Math.abs(index + 1 - selectionsUntilPick) * 7,
      35,
      100,
    );
    const upside =
      player.years_exp === 0
        ? 100
        : player.years_exp === 1
          ? 85
          : player.years_exp !== null && player.years_exp <= 3
            ? 70
            : 50;
    const score = Math.round(
      marketScore * 0.45 +
        rosterFit * 0.25 +
        scarcity * 0.1 +
        pickWindow * 0.1 +
        upside * 0.1,
    );
    return {
      player,
      positionRank,
      score,
      marketScore,
      rosterFit,
      scarcity,
      pickWindow,
      upside,
    };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.player.search_rank ?? Number.MAX_SAFE_INTEGER) -
        (b.player.search_rank ?? Number.MAX_SAFE_INTEGER),
  );
  const visible = scored.filter(
    (candidate, index) =>
      index < 60 || input.pinnedPlayerIds.has(candidate.player.player_id),
  );
  return visible.map((candidate, index) => ({
    rank: index + 1,
    player: playerView(candidate.player),
    marketRank:
      candidate.player.search_rank === null
        ? null
        : Math.round(candidate.player.search_rank),
    positionRank: candidate.positionRank,
    score: candidate.score,
    fitLabel: fitLabel(candidate),
    rationale: candidateRationale(candidate, selectionsUntilPick),
    pinned: input.pinnedPlayerIds.has(candidate.player.player_id),
    scoreBreakdown: {
      market: candidate.marketScore,
      rosterFit: candidate.rosterFit,
      scarcity: candidate.scarcity,
      pickWindow: candidate.pickWindow,
      upside: candidate.upside,
    },
  }));
}

function desiredRosterDepth(rosterPositions: string[]): Map<string, number> {
  const exact = (position: string) =>
    rosterPositions.filter((slot) => slot.toUpperCase() === position).length;
  const flex = rosterPositions.filter((slot) => {
    const normalized = slot.toUpperCase();
    return normalized === "FLEX" || normalized === "W/R/T";
  }).length;
  const superFlex = rosterPositions.some((slot) =>
    ["SUPER_FLEX", "SUPERFLEX", "Q/W/R/T"].includes(slot.toUpperCase()),
  );
  return new Map([
    ["QB", Math.max(superFlex ? 3 : 2, exact("QB") + (superFlex ? 2 : 1))],
    ["RB", Math.max(4, exact("RB") + flex + 2)],
    ["WR", Math.max(5, exact("WR") + flex + 2)],
    ["TE", Math.max(2, exact("TE") + 1)],
  ]);
}

function fitLabel(candidate: {
  rosterFit: number;
  marketScore: number;
  upside: number;
}): DraftCandidateView["fitLabel"] {
  if (candidate.rosterFit >= 80) return "primary_fit";
  if (candidate.upside >= 85 && candidate.marketScore >= 60) return "ceiling";
  if (candidate.marketScore >= 70) return "value";
  return "luxury";
}

function candidateRationale(
  candidate: {
    player: PlayerSummary;
    rosterFit: number;
    marketScore: number;
    scarcity: number;
    pickWindow: number;
  },
  selectionsUntilPick: number,
): string {
  const position = candidate.player.position ?? "player";
  if (candidate.rosterFit >= 80)
    return `Strong ${position} roster fit with a credible Sleeper market baseline.`;
  if (candidate.marketScore >= 90)
    return `One of the strongest remaining Sleeper market signals at ${position}.`;
  if (candidate.scarcity >= 90)
    return `A scarce remaining ${position} option near your current draft window.`;
  if (candidate.pickWindow < 55)
    return `More likely to require an earlier pick than your slot ${String(selectionsUntilPick)} selections away.`;
  return `Balanced market value and roster fit for the next pick window.`;
}

function inferCandidatePoolMode(input: {
  draft: Draft;
  picks: DraftPick[];
  players: ReadonlyMap<string, PlayerSummary>;
  leagueSettings: Record<string, unknown>;
  rounds: number | null;
}): "rookies" | "all" {
  const completedPlayerYears = input.picks.flatMap((pick) => {
    const years = input.players.get(pick.player_id)?.years_exp;
    return years === null || years === undefined ? [] : [years];
  });
  const completedPicksAreRookies =
    completedPlayerYears.length >= 2 &&
    completedPlayerYears.every((years) => years === 0);
  const dynasty = Number(input.leagueSettings["type"]) === 2;
  const shortDynastyDraft =
    dynasty && input.rounds !== null && input.rounds <= 6;
  return completedPicksAreRookies || shortDynastyDraft ? "rookies" : "all";
}

function playerView(player: PlayerSummary): PlayerView {
  return {
    playerId: player.player_id,
    name: player.name,
    position: player.position,
    nflTeam: player.team,
    injuryStatus: player.injury_status,
    status: player.status,
    isStarter: false,
    isReserve: false,
    isTaxi: false,
    rosterSlot: null,
  };
}

function integerSetting(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function sourceStatusPriority(status: string): number {
  if (status === "drafting" || status === "in_progress") return 0;
  if (status === "pre_draft") return 1;
  return 2;
}
