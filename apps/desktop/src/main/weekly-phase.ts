import { createHash, randomUUID } from "node:crypto";
import type {
  EvidenceClaim,
  EvidenceSource,
  LeagueWeekKey,
  ThursdayLineupOutput,
  WednesdayAftermathOutput,
  WeeklyAction,
  WeeklyPhaseBrief,
  WeeklyPlanPlayer,
  WeekendCheckOutput,
} from "@sleeper-caffeine/ipc-contract";
import type { PlayerSummary, WeeklyContextData } from "@sleeper-caffeine/core";

const RESEARCH_TTL_MS = 12 * 60 * 60 * 1_000;
export const WEEKLY_PHASE_SCHEMA_VERSION = "1";
export const WEEKLY_PHASE_PROMPT_VERSIONS = {
  wednesday: "wednesday-aftermath-1",
  thursday: "thursday-lineup-1",
  weekend: "weekend-check-1",
} as const;

type CommonBuildInput = {
  key: LeagueWeekKey;
  context: WeeklyContextData;
  snapshotId: string;
  sourcePlanId: string | null;
  inputHash: string;
  dataFreshThrough: string;
  version: number;
  model: string;
  reasoningEffort: string;
  generatedAt?: string;
};

export type BuiltWeeklyPhaseBrief = {
  brief: WeeklyPhaseBrief;
  actions: WeeklyAction[];
  evidence: EvidenceClaim[];
};

export function buildWeeklyPhaseBrief(
  input: CommonBuildInput &
    (
      | { phase: "wednesday"; output: WednesdayAftermathOutput }
      | { phase: "thursday"; output: ThursdayLineupOutput }
      | { phase: "weekend"; output: WeekendCheckOutput }
    ),
): BuiltWeeklyPhaseBrief {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const players = phasePlayerCatalog(input.context);
  const knownPlayerIds = new Set(players.map((player) => player.playerId));
  const knownSourceIds = sourceIds(input.output.sources);

  if (input.phase === "wednesday")
    validateWednesday(
      input.context,
      input.output,
      knownPlayerIds,
      knownSourceIds,
    );
  if (input.phase === "thursday")
    validateThursday(input.context, input.output, knownSourceIds);
  if (input.phase === "weekend")
    validateWeekend(input.context, input.output, knownSourceIds);

  const common = {
    ...input.key,
    id: randomUUID(),
    version: input.version,
    sourceSnapshotId: input.snapshotId,
    sourcePlanId: input.sourcePlanId,
    inputHash: input.inputHash,
    evidenceHash: shortHash(input.output.sources),
    generatedAt,
    dataFreshThrough: input.dataFreshThrough,
    researchFreshThrough: new Date(
      Date.parse(generatedAt) + RESEARCH_TTL_MS,
    ).toISOString(),
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    promptVersion: WEEKLY_PHASE_PROMPT_VERSIONS[input.phase],
    schemaVersion: WEEKLY_PHASE_SCHEMA_VERSION,
    players,
  };
  const brief: WeeklyPhaseBrief =
    input.phase === "wednesday"
      ? { ...common, phase: "wednesday", output: input.output }
      : input.phase === "thursday"
        ? { ...common, phase: "thursday", output: input.output }
        : { ...common, phase: "weekend", output: input.output };
  return {
    brief,
    actions: actionsForBrief(brief, input.sourcePlanId),
    evidence: evidenceForBrief(brief),
  };
}

export function weeklyPhaseInputHash(input: {
  context: WeeklyContextData;
  sourcePlanId: string | null;
  sourcePlanHash: string | null;
  phase: "wednesday" | "thursday" | "weekend";
  actionState?: unknown;
}): string {
  return shortHash({
    phase: input.phase,
    sourcePlanId: input.sourcePlanId,
    sourcePlanHash: input.sourcePlanHash,
    actionState: input.actionState ?? null,
    key: input.context.key,
    roster: input.context.my_team.all_players.map((player) => ({
      id: player.player_id,
      status: player.status,
      injury: player.injury_status,
    })),
    starters: currentLegalLineup(input.context),
    transactions: input.context.current_week_transactions.normalized,
    candidates: input.context.available_candidate_pool.players
      .slice(0, 20)
      .map((player) => ({
        id: player.player_id,
        rank: player.baseline_rank,
        status: player.status,
        injury: player.injury_status,
      })),
  });
}

/**
 * Wednesday is intentionally deterministic. Sleeper's transaction ledger can
 * tell us what happened; an AI turn is only useful later if the manager asks
 * to refine the plan in response.
 */
export function buildWednesdayAftermath(input: {
  context: WeeklyContextData;
  actions: WeeklyAction[];
  capturedAt?: string;
}): WednesdayAftermathOutput {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const myRosterId = input.context.my_team.roster_id;
  const ownedIds = new Set(
    input.context.league_rosters.flatMap((roster) =>
      roster.all_players.map((player) => player.player_id),
    ),
  );
  const candidates = new Map(
    input.context.available_candidate_pool.players.map((player) => [
      player.player_id,
      player,
    ]),
  );
  const transactions = input.context.current_week_transactions.normalized;
  const source = sleeperLedgerSource(input.context, capturedAt);
  const sourceIds = [source.evidenceId as string];

  const observedActions = transactions
    .filter((transaction) => transaction.roster_ids.includes(myRosterId))
    .map((transaction) => {
      const myAdds = transaction.adds.filter(
        (entry) => entry.roster_id === myRosterId,
      );
      const myDrops = transaction.drops.filter(
        (entry) => entry.roster_id === myRosterId,
      );
      const playerIds = [...myAdds, ...myDrops].map((entry) => entry.player_id);
      const matched = input.actions.find(
        (action) =>
          action.status !== "superseded" &&
          action.playerIds.some((playerId) => playerIds.includes(playerId)),
      );
      const names = [...myAdds, ...myDrops].map((entry) => entry.player.name);
      return {
        actionKey: matched?.actionKey ?? null,
        kind: observedKind(transaction.type),
        outcome: observedOutcome(transaction.status),
        title:
          names.length > 0
            ? names.join(" / ")
            : `${titleCase(transaction.type)} transaction`,
        description: transactionDescription(
          transaction.type,
          transaction.status,
          myAdds.map((entry) => entry.player.name),
          myDrops.map((entry) => entry.player.name),
        ),
        playerIds,
        rosterIds: transaction.roster_ids,
        faabAmount: transaction.faab_bid,
        sourceIds,
      } as const;
    });

  const newlyFree = new Map<string, PlayerSummary>();
  for (const transaction of transactions)
    for (const drop of transaction.drops)
      if (!ownedIds.has(drop.player_id))
        newlyFree.set(drop.player_id, drop.player);
  const newlyFreePlayers = [...newlyFree.values()]
    .sort(
      (left, right) =>
        (candidates.get(left.player_id)?.baseline_rank ?? 9_999) -
        (candidates.get(right.player_id)?.baseline_rank ?? 9_999),
    )
    .slice(0, 10)
    .map((player) => {
      const rank = candidates.get(player.player_id)?.baseline_rank ?? null;
      return {
        playerId: player.player_id,
        headline:
          rank !== null
            ? `${player.name} is now available at baseline rank ${String(rank)}`
            : `${player.name} was released into the player pool`,
        rationale:
          rank !== null
            ? "Sleeper's roster ledger confirms availability; the local candidate funnel supplies the baseline rank."
            : "Sleeper confirms the drop, but this player did not reach the current focused candidate cohort.",
        confidence: "medium" as const,
        sourceIds,
        availableSince: capturedAt,
        recommendedAction:
          rank !== null && rank <= 10
            ? ("add_now" as const)
            : rank !== null && rank <= 25
              ? ("watch" as const)
              : ("pass" as const),
      };
    });

  const importantDrops = newlyFreePlayers
    .filter((player) => player.recommendedAction !== "pass")
    .slice(0, 6)
    .map(
      ({
        playerId,
        headline,
        rationale,
        confidence,
        sourceIds,
        recommendedAction,
      }) => ({
        playerId,
        rationale,
        confidence,
        sourceIds,
        headline:
          recommendedAction === "add_now"
            ? `${headline} — inspect now`
            : `${headline} — add to the watch queue`,
      }),
    );
  const congestion = rosterCongestion(input.context, sourceIds);
  const changeCount = observedActions.length + newlyFreePlayers.length;

  return {
    headline:
      changeCount === 0
        ? "The waiver board is quiet; keep Tuesday's structure"
        : `${String(changeCount)} post-waiver signal${changeCount === 1 ? "" : "s"} deserve a look`,
    summary:
      changeCount === 0
        ? "Sleeper shows no roster result or newly free player that materially changes the current plan."
        : `${String(observedActions.length)} transaction result${observedActions.length === 1 ? "" : "s"} touched your roster and ${String(newlyFreePlayers.length)} newly free player${newlyFreePlayers.length === 1 ? " is" : "s are"} worth classifying before you refine anything.`,
    confidence: "high",
    observedActions,
    importantDrops,
    newlyFreePlayers,
    congestion,
    sources: [source],
    uncertainties: [
      "Sleeper records transaction outcomes, but it does not expose every manager's intent or complete failed-claim ordering.",
    ],
  };
}

export function currentLegalLineup(context: WeeklyContextData) {
  return context.my_team.starters.map((player, slotIndex) => ({
    slotIndex,
    slot:
      player.starter_slot ??
      context.league.roster_positions[slotIndex] ??
      `STARTER_${String(slotIndex + 1)}`,
    playerId: player.player_id,
  }));
}

function validateWednesday(
  context: WeeklyContextData,
  output: WednesdayAftermathOutput,
  knownPlayerIds: ReadonlySet<string>,
  knownSourceIds: ReadonlySet<string>,
) {
  const availableIds = new Set(
    context.available_candidate_pool.players.map((player) => player.player_id),
  );
  for (const action of output.observedActions) {
    assertKnownIds(action.playerIds, knownPlayerIds, "observed player");
    assertMaterialSources(action.sourceIds, knownSourceIds, "observed action");
  }
  for (const player of output.importantDrops) {
    assertKnownIds([player.playerId], knownPlayerIds, "important drop");
    assertMaterialSources(player.sourceIds, knownSourceIds, "important drop");
  }
  for (const player of output.newlyFreePlayers) {
    if (!availableIds.has(player.playerId))
      throw new Error(
        `Newly free player ${player.playerId} is not available in the frozen context`,
      );
    assertMaterialSources(
      player.sourceIds,
      knownSourceIds,
      "newly free player",
    );
  }
  for (const item of output.congestion) {
    assertKnownIds(item.playerIds, knownPlayerIds, "congestion player");
    assertMaterialSources(item.sourceIds, knownSourceIds, "roster congestion");
  }
}

function validateThursday(
  context: WeeklyContextData,
  output: ThursdayLineupOutput,
  knownSourceIds: ReadonlySet<string>,
) {
  const playable = new Map(
    [...context.my_team.starters, ...context.my_team.bench]
      .filter((player) => player.player_id !== "0")
      .map((player) => [player.player_id, player]),
  );
  const slots = currentLegalLineup(context);
  if (output.slotAssignments.length !== slots.length)
    throw new Error("The proposed lineup must fill every starting slot");
  const slotIndexes = output.slotAssignments.map(
    (assignment) => assignment.slotIndex,
  );
  assertUnique(slotIndexes.map(String), "lineup slot");
  assertUnique(
    output.slotAssignments.map((assignment) => assignment.playerId),
    "lineup player",
  );
  for (const assignment of output.slotAssignments) {
    const expected = slots[assignment.slotIndex];
    if (!expected)
      throw new Error(`Unknown lineup slot ${String(assignment.slotIndex)}`);
    if (assignment.slot !== expected.slot)
      throw new Error(
        `Lineup slot ${String(assignment.slotIndex)} must be labeled ${expected.slot}`,
      );
    const player = playable.get(assignment.playerId);
    if (!player)
      throw new Error(
        `Lineup player ${assignment.playerId} is not on the active roster`,
      );
    if (!eligibleForSlot(player, assignment.slot))
      throw new Error(`${player.name} is not eligible for ${assignment.slot}`);
  }
  const assignedBySlot = new Map(
    output.slotAssignments.map((assignment) => [
      assignment.slotIndex,
      assignment.playerId,
    ]),
  );
  assertUnique(
    output.recommendedMoves.map((move) => move.actionKey),
    "lineup action key",
  );
  for (const move of output.recommendedMoves) {
    if (assignedBySlot.get(move.toSlotIndex) !== move.playerId)
      throw new Error(
        `Lineup move ${move.actionKey} does not match the proposed assignment`,
      );
    const currentTarget = slots[move.toSlotIndex];
    if (!currentTarget)
      throw new Error(
        `Lineup move ${move.actionKey} targets an unknown starting slot`,
      );
    if (currentTarget.playerId === move.playerId)
      throw new Error(
        `Lineup move ${move.actionKey} does not change the lineup`,
      );
    if (move.replacePlayerId !== currentTarget.playerId)
      throw new Error(
        `Lineup move ${move.actionKey} must replace current starter ${currentTarget.playerId}`,
      );
    const currentSourceIndex = context.my_team.starters.findIndex(
      (player) => player.player_id === move.playerId,
    );
    const expectedSourceIndex =
      currentSourceIndex >= 0 ? currentSourceIndex : null;
    if (move.fromSlotIndex !== expectedSourceIndex)
      throw new Error(
        `Lineup move ${move.actionKey} has the wrong current source slot`,
      );
    if (!playable.has(move.playerId) || !playable.has(move.replacePlayerId))
      throw new Error(
        `Lineup move ${move.actionKey} references a player outside the active roster`,
      );
    assertMaterialSources(move.sourceIds, knownSourceIds, "lineup move");
  }
  for (const closeCall of output.closeCalls) {
    const slot = slots[closeCall.slotIndex];
    if (!slot)
      throw new Error(
        `Close call targets unknown lineup slot ${String(closeCall.slotIndex)}`,
      );
    if (assignedBySlot.get(closeCall.slotIndex) !== closeCall.chosenPlayerId)
      throw new Error("A close-call winner must match the proposed lineup");
    if (closeCall.chosenPlayerId === closeCall.alternativePlayerId)
      throw new Error("A close call must compare two different players");
    const chosen = playable.get(closeCall.chosenPlayerId);
    const alternative = playable.get(closeCall.alternativePlayerId);
    if (!chosen || !alternative)
      throw new Error("Close-call players must be on the active roster");
    if (
      !eligibleForSlot(chosen, slot.slot) ||
      !eligibleForSlot(alternative, slot.slot)
    )
      throw new Error(
        `Both close-call players must be eligible for ${slot.slot}`,
      );
    assertMaterialSources(closeCall.sourceIds, knownSourceIds, "close call");
  }
  for (const note of output.flexNotes) {
    for (const slotIndex of note.slotIndexes)
      if (!slots[slotIndex])
        throw new Error(
          `Flex note references unknown slot ${String(slotIndex)}`,
        );
    for (const playerId of note.playerIds)
      if (!playable.has(playerId))
        throw new Error(
          `Flex-note player ${playerId} is not on the active roster`,
        );
  }
}

function validateWeekend(
  context: WeeklyContextData,
  output: WeekendCheckOutput,
  knownSourceIds: ReadonlySet<string>,
) {
  const myPlayerIds = new Set(
    context.my_team.all_players.map((player) => player.player_id),
  );
  const availableIds = new Set(
    context.available_candidate_pool.players.map((player) => player.player_id),
  );
  for (const alert of output.criticalStatusAlerts) {
    if (!myPlayerIds.has(alert.playerId))
      throw new Error(
        `Weekend status alert ${alert.playerId} is not on the selected roster`,
      );
    assertMaterialSources(alert.sourceIds, knownSourceIds, "status alert");
  }
  const slots = currentLegalLineup(context);
  for (const note of output.flexibilityNotes) {
    for (const playerId of note.playerIds)
      if (!myPlayerIds.has(playerId))
        throw new Error(
          `Weekend flexibility player ${playerId} is not on the selected roster`,
        );
    for (const slotIndex of note.slotIndexes)
      if (!slots[slotIndex])
        throw new Error(
          `Weekend flexibility note references unknown slot ${String(slotIndex)}`,
        );
  }
  for (const candidate of output.stashCandidates) {
    if (!availableIds.has(candidate.playerId))
      throw new Error(
        `Stash candidate ${candidate.playerId} is not available in the frozen context`,
      );
    if (candidate.dropPlayerId && !myPlayerIds.has(candidate.dropPlayerId))
      throw new Error(
        `Stash drop ${candidate.dropPlayerId} is not on the selected roster`,
      );
    assertMaterialSources(
      candidate.sourceIds,
      knownSourceIds,
      "stash candidate",
    );
  }
  assertUnique(
    output.actions.map((action) => action.actionKey),
    "weekend action key",
  );
  for (const action of output.actions) {
    const allowedIds =
      action.kind === "stash"
        ? new Set([...myPlayerIds, ...availableIds])
        : myPlayerIds;
    assertKnownIds(action.playerIds, allowedIds, "weekend action player");
    if (
      action.kind === "stash" &&
      !action.playerIds.some((playerId) => availableIds.has(playerId))
    )
      throw new Error(
        "A weekend stash action must include an available player",
      );
    assertMaterialSources(action.sourceIds, knownSourceIds, "weekend action");
  }
}

function actionsForBrief(
  brief: WeeklyPhaseBrief,
  planId: string | null,
): WeeklyAction[] {
  if (!planId) return [];
  const createdAt = brief.generatedAt;
  if (brief.phase === "thursday")
    return brief.output.recommendedMoves.map((move) => ({
      leagueId: brief.leagueId,
      season: brief.season,
      week: brief.week,
      id: randomUUID(),
      planId,
      actionKey: `thursday:${move.actionKey}`,
      kind: "lineup_move",
      status: "pending",
      title: `Set the recommended lineup at ${brief.output.slotAssignments.find((assignment) => assignment.slotIndex === move.toSlotIndex)?.slot ?? `slot ${String(move.toSlotIndex + 1)}`}`,
      description: move.rationale,
      priority: "soon",
      playerIds: [
        move.playerId,
        ...(move.replacePlayerId ? [move.replacePlayerId] : []),
      ],
      rosterIds: [],
      dispositionNote: null,
      observedEventId: null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null,
    }));
  if (brief.phase === "weekend")
    return brief.output.actions.map((action) => ({
      leagueId: brief.leagueId,
      season: brief.season,
      week: brief.week,
      id: randomUUID(),
      planId,
      actionKey: `weekend:${action.actionKey}`,
      kind: action.kind,
      status: "pending",
      title: action.title,
      description: action.description,
      priority: action.priority,
      playerIds: action.playerIds,
      rosterIds: [],
      dispositionNote: null,
      observedEventId: null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null,
    }));
  return [];
}

function evidenceForBrief(brief: WeeklyPhaseBrief): EvidenceClaim[] {
  const category =
    brief.phase === "thursday"
      ? "projection"
      : brief.phase === "weekend"
        ? "injury"
        : "market";
  return brief.output.sources.map((source, index) => ({
    id:
      source.evidenceId ??
      `weekly:${brief.leagueId}:${brief.season}:${String(brief.week)}:${brief.phase}:${shortHash({ source, index })}`,
    leagueId: brief.leagueId,
    playerId: null,
    category,
    claim: source.claim,
    metricName: null,
    metricValue: null,
    sourceTitle: source.title,
    sourceUrl: source.url,
    sourceType: source.sourceType,
    fetchedAt: source.fetchedAt,
    effectiveWeek: brief.week,
    expiresAt: brief.researchFreshThrough,
  }));
}

function phasePlayerCatalog(context: WeeklyContextData): WeeklyPlanPlayer[] {
  const players = new Map<string, PlayerSummary>();
  for (const roster of context.league_rosters)
    for (const player of roster.all_players)
      players.set(player.player_id, player);
  for (const player of context.available_candidate_pool.players)
    players.set(player.player_id, player);
  for (const transaction of context.current_week_transactions.normalized)
    for (const entry of [...transaction.adds, ...transaction.drops])
      players.set(entry.player_id, entry.player);
  return [...players.values()]
    .filter((player) => player.player_id !== "0")
    .sort((left, right) => left.player_id.localeCompare(right.player_id))
    .map((player) => ({
      playerId: player.player_id,
      name: player.name,
      position: player.position,
      nflTeam: player.team,
      injuryStatus: player.injury_status,
      status: player.status,
    }));
}

function rosterCongestion(
  context: WeeklyContextData,
  sourceIds: string[],
): WednesdayAftermathOutput["congestion"] {
  const playersByPosition = new Map<string, PlayerSummary[]>();
  for (const player of context.my_team.all_players) {
    if (!player.position || player.player_id === "0") continue;
    const group = playersByPosition.get(player.position) ?? [];
    group.push(player);
    playersByPosition.set(player.position, group);
  }
  return [...playersByPosition.entries()]
    .filter(([position, players]) => {
      const exactStarters = context.league.roster_positions.filter(
        (slot) => slot === position,
      ).length;
      return players.length >= Math.max(5, exactStarters + 4);
    })
    .map(([position, players]) => ({
      position,
      headline: `${position} depth is consuming ${String(players.length)} roster spots`,
      rationale:
        "This is a portfolio-concentration flag based on roster construction, not a recommendation to drop useful depth blindly.",
      recommendation:
        "Compare the weakest player in this group with the best newly free cross-position option before adding more of the same profile.",
      playerIds: players.map((player) => player.player_id),
      confidence: "medium" as const,
      sourceIds,
    }));
}

function sleeperLedgerSource(
  context: WeeklyContextData,
  fetchedAt: string,
): EvidenceSource {
  return {
    evidenceId: `sleeper:transactions:${context.key.league_id}:${String(context.key.week)}`,
    title: "Sleeper weekly transaction ledger",
    url: `https://api.sleeper.app/v1/league/${context.key.league_id}/transactions/${String(context.key.week)}`,
    claim:
      "Processed, pending, and failed league transactions supplied by Sleeper for this week.",
    sourceType: "sleeper",
    fetchedAt,
  };
}

function sourceIds(sources: EvidenceSource[]): Set<string> {
  const ids = new Set<string>();
  for (const source of sources) {
    if (!source.evidenceId)
      throw new Error("Every weekly-phase source needs an evidence ID");
    if (ids.has(source.evidenceId))
      throw new Error(
        `The phase brief returned a duplicate source ${source.evidenceId}`,
      );
    if (source.sourceType !== "sleeper" && source.url === null)
      throw new Error(`${source.sourceType} sources need an inspectable URL`);
    ids.add(source.evidenceId);
  }
  return ids;
}

function assertSources(ids: string[], known: ReadonlySet<string>) {
  assertKnownIds(ids, known, "source");
}

function assertMaterialSources(
  ids: string[],
  known: ReadonlySet<string>,
  label: string,
) {
  if (ids.length === 0)
    throw new Error(`Every ${label} needs at least one inspectable source`);
  assertSources(ids, known);
}

function assertKnownIds(
  ids: string[],
  known: ReadonlySet<string>,
  label: string,
) {
  for (const id of ids)
    if (!known.has(id)) throw new Error(`Unknown ${label} ${id}`);
}

function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`The phase brief returned a duplicate ${label}`);
}

function eligibleForSlot(player: PlayerSummary, slot: string): boolean {
  const positions = new Set(
    [player.position, ...player.fantasy_positions]
      .filter((position): position is string => Boolean(position))
      .map((position) => position.toUpperCase()),
  );
  const normalized = slot.toUpperCase().replaceAll("-", "_");
  if (positions.has(normalized)) return true;
  if (["FLEX", "W/R/T", "WR/RB/TE"].includes(normalized))
    return ["RB", "WR", "TE"].some((position) => positions.has(position));
  if (["SUPER_FLEX", "SUPERFLEX", "Q/W/R/T"].includes(normalized))
    return ["QB", "RB", "WR", "TE"].some((position) => positions.has(position));
  if (["REC_FLEX", "W/T", "WR/TE"].includes(normalized))
    return ["WR", "TE"].some((position) => positions.has(position));
  if (["WRRB_FLEX", "W/R", "WR/RB"].includes(normalized))
    return ["WR", "RB"].some((position) => positions.has(position));
  if (normalized === "IDP_FLEX")
    return ["DL", "DE", "DT", "LB", "DB", "CB", "S", "IDP"].some((position) =>
      positions.has(position),
    );
  if (normalized === "DEF") return positions.has("DST");
  return false;
}

function observedKind(type: string) {
  if (type === "waiver") return "waiver_claim" as const;
  if (type === "free_agent") return "free_agent_add" as const;
  if (type === "trade") return "trade" as const;
  return "roster_move" as const;
}

function observedOutcome(status: string) {
  if (["complete", "completed", "success"].includes(status))
    return "completed" as const;
  if (["failed", "failure"].includes(status)) return "failed" as const;
  if (status === "withdrawn") return "withdrawn" as const;
  return "unknown" as const;
}

function transactionDescription(
  type: string,
  status: string,
  adds: string[],
  drops: string[],
) {
  const parts = [
    adds.length > 0 ? `added ${adds.join(", ")}` : null,
    drops.length > 0 ? `dropped ${drops.join(", ")}` : null,
  ].filter(Boolean);
  return `${titleCase(type)} ${status}: ${parts.join(" and ") || "no player movement exposed"}.`;
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 20);
}
