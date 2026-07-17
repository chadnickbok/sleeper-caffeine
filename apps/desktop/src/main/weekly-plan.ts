import { createHash, randomUUID } from "node:crypto";
import type {
  EvidenceClaim,
  LeagueWeekKey,
  SleeperEvent,
  TuesdayPlanOutput,
  WeeklyAction,
  WeeklyChange,
  WeeklyPhase,
  WeeklyPlan,
  WeeklyPlanPlayer,
  WeeklyPlanRoster,
  WeeklyPlanSummary,
  WatchlistEntry,
} from "@sleeper-caffeine/ipc-contract";
import type { PlayerSummary, WeeklyContextData } from "@sleeper-caffeine/core";

const WEEKLY_RESEARCH_TTL_MS = 12 * 60 * 60 * 1_000;
const TUESDAY_RESEARCH_COHORT_LIMIT = 15;
export const WEEKLY_PLAN_PROMPT_VERSION = "tuesday-plan-1";
export const WEEKLY_PLAN_SCHEMA_VERSION = "1";

export type BuiltWeeklyPlan = {
  plan: WeeklyPlan;
  actions: WeeklyAction[];
  evidence: EvidenceClaim[];
};

export type WeeklyPlanEditorialSummary = Pick<
  WeeklyPlanSummary,
  "headline" | "summary"
>;

/**
 * Keep factual card metadata tied to the validated plan. Codex edits the two
 * prose fields only; it cannot accidentally relabel the team's competitive
 * lane or invent action/source counts during the condensation turn.
 */
export function deriveWeeklyPlanSummary(
  output: TuesdayPlanOutput,
  editorial: WeeklyPlanEditorialSummary,
): WeeklyPlanSummary {
  return {
    ...editorial,
    competitiveLane: output.competitiveLane.lane,
    pendingActionCount: output.actions.length,
    sourceCount: output.sources.length,
  };
}

export function weeklyPhaseForDate(date = new Date()): WeeklyPhase {
  switch (date.getDay()) {
    case 2:
      return "tuesday";
    case 3:
      return "wednesday";
    case 4:
      return "thursday";
    case 0:
    case 1:
    case 5:
    case 6:
      return "weekend";
    default:
      return "tuesday";
  }
}

export function weeklyContextHash(context: WeeklyContextData): string {
  return shortHash(materialWeeklyContext(context));
}

export function weeklyEvidenceHash(output: TuesdayPlanOutput): string {
  return shortHash(
    output.sources.map((source) => ({
      id: source.evidenceId,
      title: source.title,
      url: source.url,
      claim: source.claim,
      sourceType: source.sourceType,
      fetchedAt: source.fetchedAt,
    })),
  );
}

export function selectTuesdayResearchCohort(
  context: WeeklyContextData,
  watchlist: readonly WatchlistEntry[],
  limit = TUESDAY_RESEARCH_COHORT_LIMIT,
): WeeklyContextData["available_candidate_pool"]["players"] {
  if (!Number.isInteger(limit) || limit <= 0)
    throw new Error("The Tuesday research cohort limit must be positive");
  const candidates = [
    ...new Map(
      context.available_candidate_pool.players.map((player) => [
        player.player_id,
        player,
      ]),
    ).values(),
  ];
  const activeWatchIds = new Set(
    watchlist
      .filter(
        (entry) => entry.state === "active" || entry.state === "triggered",
      )
      .map((entry) => entry.playerId),
  );
  const watchedCandidates = candidates.filter((player) =>
    activeWatchIds.has(player.player_id),
  );
  if (watchedCandidates.length > limit)
    throw new Error(
      `The active watchlist has ${String(watchedCandidates.length)} available players, exceeding the ${String(limit)}-player Tuesday research limit`,
    );

  const selectedIds = new Set(
    candidates.slice(0, limit).map((player) => player.player_id),
  );
  for (const watched of watchedCandidates) {
    if (selectedIds.has(watched.player_id)) continue;
    const displaced = candidates
      .slice(0, limit)
      .reverse()
      .find(
        (player) =>
          selectedIds.has(player.player_id) &&
          !activeWatchIds.has(player.player_id),
      );
    if (!displaced)
      throw new Error("Unable to reserve a Tuesday research slot for Watch");
    selectedIds.delete(displaced.player_id);
    selectedIds.add(watched.player_id);
  }
  return candidates.filter((player) => selectedIds.has(player.player_id));
}

export function buildTuesdayWatchlistEntries(input: {
  key: LeagueWeekKey;
  output: TuesdayPlanOutput;
  generatedAt: string;
}): WatchlistEntry[] {
  return input.output.watch.map((recommendation) => ({
    id: `weekly-watch-${shortHash({
      namespace: "tuesday-watch-v1",
      leagueId: input.key.leagueId,
      playerId: recommendation.playerId,
    })}`,
    leagueId: input.key.leagueId,
    playerId: recommendation.playerId,
    hypothesis: `${recommendation.headline} — ${recommendation.rationale}`,
    trigger: recommendation.trigger,
    state: "active",
    createdSeason: input.key.season,
    createdWeek: input.key.week,
    expiresSeason: input.key.season,
    expiresWeek: input.key.week + 1,
    createdAt: input.generatedAt,
    updatedAt: input.generatedAt,
  }));
}

export function buildWeeklyPlan(input: {
  key: LeagueWeekKey;
  context: WeeklyContextData;
  output: TuesdayPlanOutput;
  snapshotId: string;
  inputHash: string;
  version: number;
  model: string;
  reasoningEffort: string;
  generatedAt?: string;
}): BuiltWeeklyPlan {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const myPlayerIds = new Set(
    input.context.my_team.all_players.map((player) => player.player_id),
  );
  const availableIds = new Set(
    input.context.available_candidate_pool.players.map(
      (player) => player.player_id,
    ),
  );
  const playerCatalog = weeklyPlayerCatalog(input.context);
  const allPlayerIds = new Set(playerCatalog.map((player) => player.playerId));
  const rosterCatalog = weeklyRosterCatalog(input.context);
  const rosterIds = new Set(rosterCatalog.map((roster) => roster.rosterId));
  const sourceIds = validateSourceCatalog(input.output.sources);

  assertUnique(
    input.output.actions.map((action) => action.actionKey),
    "weekly action key",
  );
  for (const action of input.output.actions) {
    assertKnownIds(action.playerIds, allPlayerIds, "action player");
    assertKnownNumbers(action.rosterIds, rosterIds, "action roster");
    assertMaterialSourceIds(action.sourceIds, sourceIds, "weekly action");
  }

  const claims = [...input.output.waiverClaims].sort(
    (left, right) => left.priority - right.priority,
  );
  assertUnique(
    claims.map((claim) => claim.addPlayerId),
    "waiver add target",
  );
  assertConsistentWaiverContingencies(claims);
  claims.forEach((claim, index) => {
    if (claim.priority !== index + 1)
      throw new Error("Waiver priorities must be consecutive and start at one");
    if (!availableIds.has(claim.addPlayerId))
      throw new Error(
        `Waiver target ${claim.addPlayerId} is not available in the frozen context`,
      );
    if (claim.dropPlayerId !== null && !myPlayerIds.has(claim.dropPlayerId))
      throw new Error(
        `Drop candidate ${claim.dropPlayerId} is not on the selected roster`,
      );
    assertFaabRange(claim, isFaabLeague(input.context));
    assertMaterialSourceIds(claim.sourceIds, sourceIds, "waiver claim");
  });

  for (const recommendation of [
    ...input.output.addNow,
    ...input.output.watch,
  ]) {
    if (!availableIds.has(recommendation.playerId))
      throw new Error(
        `Recommended add ${recommendation.playerId} is not available in the frozen context`,
      );
    assertMaterialSourceIds(
      recommendation.sourceIds,
      sourceIds,
      "available-player recommendation",
    );
  }
  assertUnique(
    input.output.exit.map((player) => player.playerId),
    "exit player",
  );
  assertUnique(
    input.output.exit.map((player) => String(player.dropRank)),
    "exit rank",
  );
  const exitRanks = input.output.exit
    .map((player) => player.dropRank)
    .sort((left, right) => left - right);
  exitRanks.forEach((dropRank, index) => {
    if (dropRank !== index + 1)
      throw new Error("Exit ranks must be consecutive and start at one");
  });
  for (const recommendation of input.output.exit) {
    if (!myPlayerIds.has(recommendation.playerId))
      throw new Error(
        `Exit candidate ${recommendation.playerId} is not on the selected roster`,
      );
    assertMaterialSourceIds(
      recommendation.sourceIds,
      sourceIds,
      "exit recommendation",
    );
  }
  assertUnique(
    input.output.rosterAudit.map((assessment) => assessment.playerId),
    "roster audit player",
  );
  for (const assessment of input.output.rosterAudit)
    if (!myPlayerIds.has(assessment.playerId))
      throw new Error(
        `Roster audit player ${assessment.playerId} is not on the selected roster`,
      );
  const auditedPlayerIds = new Set(
    input.output.rosterAudit.map((assessment) => assessment.playerId),
  );
  const missingAuditPlayerIds = [...myPlayerIds].filter(
    (playerId) => !auditedPlayerIds.has(playerId),
  );
  if (missingAuditPlayerIds.length > 0)
    throw new Error(
      `Roster audit is missing current roster player${missingAuditPlayerIds.length === 1 ? "" : "s"}: ${missingAuditPlayerIds.join(", ")}`,
    );
  assertKnownNumbers(
    input.output.marketObservation.partnerRosterIds,
    rosterIds,
    "trade partner roster",
  );
  if (
    input.output.marketObservation.partnerRosterIds.includes(
      input.context.my_team.roster_id,
    )
  )
    throw new Error("The selected roster cannot be its own trade partner");
  if (input.output.marketObservation.partnerRosterIds.length > 0)
    assertMaterialSourceIds(
      input.output.marketObservation.sourceIds,
      sourceIds,
      "trade-market recommendation",
    );
  else assertSourceIds(input.output.marketObservation.sourceIds, sourceIds);
  for (const alternative of input.output.alternatives) {
    assertKnownIds(alternative.playerIds, allPlayerIds, "alternative player");
    assertMaterialSourceIds(
      alternative.sourceIds,
      sourceIds,
      "plan alternative",
    );
  }

  const id = randomUUID();
  const plan: WeeklyPlan = {
    ...input.key,
    id,
    version: input.version,
    sourceSnapshotId: input.snapshotId,
    inputHash: input.inputHash,
    evidenceHash: weeklyEvidenceHash(input.output),
    generatedAt,
    researchFreshThrough: new Date(
      Date.parse(generatedAt) + WEEKLY_RESEARCH_TTL_MS,
    ).toISOString(),
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    promptVersion: WEEKLY_PLAN_PROMPT_VERSION,
    schemaVersion: WEEKLY_PLAN_SCHEMA_VERSION,
    status: "current",
    statusReason: null,
    output: input.output,
    players: playerCatalog,
    rosters: rosterCatalog,
    microSummary: null,
  };
  const actions: WeeklyAction[] = input.output.actions.map((action) => ({
    ...input.key,
    id: randomUUID(),
    planId: id,
    actionKey: action.actionKey,
    kind: action.kind,
    status: "pending",
    title: action.title,
    description: action.description,
    priority: action.priority,
    playerIds: action.playerIds,
    rosterIds: action.rosterIds,
    dispositionNote: null,
    observedEventId: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    resolvedAt: null,
  }));
  const evidence: EvidenceClaim[] = input.output.sources.map(
    (source, index) => ({
      id:
        source.evidenceId ??
        `weekly:${input.key.leagueId}:${input.key.season}:${String(input.key.week)}:${shortHash({ source, index })}`,
      leagueId: input.key.leagueId,
      playerId: null,
      category: "market",
      claim: source.claim,
      metricName: null,
      metricValue: null,
      sourceTitle: source.title,
      sourceUrl: source.url,
      sourceType: source.sourceType,
      fetchedAt: source.fetchedAt,
      effectiveWeek: input.key.week,
      expiresAt: plan.researchFreshThrough,
    }),
  );
  return { plan, actions, evidence };
}

export function reconcileWeeklyPlan(input: {
  plan: WeeklyPlan;
  contextHash: string;
  changes: WeeklyChange[];
  now?: number;
}): WeeklyPlan {
  const now = input.now ?? Date.now();
  if (input.contextHash !== input.plan.inputHash)
    return {
      ...input.plan,
      status: "data_changed",
      statusReason:
        input.changes.length > 0
          ? `${String(input.changes.length)} material ${input.changes.length === 1 ? "change" : "changes"} detected since this plan was built`
          : "Material league inputs changed since this plan was built",
    };
  if (now > Date.parse(input.plan.researchFreshThrough))
    return {
      ...input.plan,
      status: "research_stale",
      statusReason:
        "The plan is intact, but its player research is over 12 hours old",
    };
  return { ...input.plan, status: "current", statusReason: null };
}

export function deriveWeeklyChanges(
  previous: WeeklyContextData | null,
  current: WeeklyContextData,
  detectedAt = new Date().toISOString(),
): WeeklyChange[] {
  if (!previous) return [];
  const changes: WeeklyChange[] = [];
  const previousPlayers = playerIndex(previous);
  const currentPlayers = playerIndex(current);
  const previousMine = new Set(
    previous.my_team.all_players.map((player) => player.player_id),
  );
  const currentMine = new Set(
    current.my_team.all_players.map((player) => player.player_id),
  );
  for (const playerId of [
    ...new Set([...previousMine, ...currentMine]),
  ].sort()) {
    if (previousMine.has(playerId) === currentMine.has(playerId)) continue;
    const player =
      currentPlayers.get(playerId) ?? previousPlayers.get(playerId);
    const added = currentMine.has(playerId);
    changes.push({
      id: `roster:${playerId}:${added ? "added" : "dropped"}`,
      kind: "roster",
      headline: `${player?.name ?? playerId} ${added ? "joined" : "left"} your roster`,
      description: added
        ? "Sleeper now lists this player on your roster."
        : "Sleeper no longer lists this player on your roster.",
      entityType: "player",
      entityId: playerId,
      occurredAt: detectedAt,
      detectedAt,
      material: true,
      sourceEventId: null,
    });
  }

  const previousTransactions = new Set(
    previous.current_week_transactions.events.map((event) => event.event_id),
  );
  for (const event of current.current_week_transactions.events) {
    if (previousTransactions.has(event.event_id)) continue;
    const names = event.player_ids
      .map((playerId) => currentPlayers.get(playerId)?.name ?? playerId)
      .slice(0, 3)
      .join(", ");
    changes.push({
      id: event.event_id,
      kind: event.transaction_type === "waiver" ? "waiver" : "transaction",
      headline: `${titleCase(event.transaction_type)} transaction processed`,
      description: names || "The league transaction ledger changed.",
      entityType: "transaction",
      entityId: event.transaction.transaction_id,
      occurredAt: epochToIso(event.occurred_at) ?? detectedAt,
      detectedAt,
      material: true,
      sourceEventId: event.event_id,
    });
  }

  const relevantIds = new Set([
    ...currentMine,
    ...current.available_candidate_pool.players
      .slice(0, 20)
      .map((player) => player.player_id),
  ]);
  for (const playerId of relevantIds) {
    const before = previousPlayers.get(playerId);
    const after = currentPlayers.get(playerId);
    if (!before || !after) continue;
    if (
      before.injury_status === after.injury_status &&
      before.status === after.status &&
      before.depth_chart_order === after.depth_chart_order
    )
      continue;
    changes.push({
      id: `status:${playerId}:${shortHash({ status: after.status, injury: after.injury_status, depth: after.depth_chart_order })}`,
      kind:
        before.depth_chart_order === after.depth_chart_order
          ? "player_status"
          : "depth_chart",
      headline: `${after.name}'s status changed`,
      description: statusDescription(before, after),
      entityType: "player",
      entityId: playerId,
      occurredAt: detectedAt,
      detectedAt,
      material: true,
      sourceEventId: null,
    });
  }

  const beforeStanding = previous.my_team.standings;
  const afterStanding = current.my_team.standings;
  if (
    beforeStanding &&
    afterStanding &&
    (beforeStanding.wins !== afterStanding.wins ||
      beforeStanding.losses !== afterStanding.losses ||
      beforeStanding.ties !== afterStanding.ties ||
      beforeStanding.record_rank !== afterStanding.record_rank ||
      beforeStanding.points_rank !== afterStanding.points_rank)
  )
    changes.push({
      id: `standings:${current.key.season}:${String(current.key.week)}:${shortHash(afterStanding)}`,
      kind: "matchup",
      headline: "Your competitive position changed",
      description: `You are now ${ordinal(afterStanding.record_rank)} by record${afterStanding.points_rank ? ` and ${ordinal(afterStanding.points_rank)} in points` : ""}.`,
      entityType: "roster",
      entityId: String(current.my_team.roster_id),
      occurredAt: detectedAt,
      detectedAt,
      material: true,
      sourceEventId: null,
    });

  return dedupeChanges(changes);
}

export function sleeperEventsFromContext(
  key: LeagueWeekKey,
  context: WeeklyContextData,
  detectedAt = new Date().toISOString(),
): SleeperEvent[] {
  return context.current_week_transactions.events.map((event) => ({
    id: randomUUID(),
    ...key,
    dedupeKey: event.event_id,
    eventType: transactionEventType(event.transaction_type),
    upstreamId: event.transaction.transaction_id,
    occurredAt: epochToIso(event.occurred_at) ?? detectedAt,
    detectedAt,
    rosterIds: event.roster_ids,
    playerIds: event.player_ids,
    payload: event.transaction,
  }));
}

function materialWeeklyContext(context: WeeklyContextData) {
  return {
    key: context.key,
    league: {
      status: context.league.status,
      settings: context.league.settings,
      scoring: context.league.scoring_settings,
      positions: context.league.roster_positions,
    },
    myTeam: {
      rosterId: context.my_team.roster_id,
      players: context.my_team.all_players.map(materialPlayer),
      standings: context.my_team.standings,
      faab: context.my_team.faab,
    },
    rosters: context.league_rosters.map((roster) => ({
      rosterId: roster.roster_id,
      players: roster.all_players.map((player) => player.player_id).sort(),
      standings: roster.standings,
      faab: roster.faab,
    })),
    matchups: context.recent_matchups,
    transactions: context.current_week_transactions.normalized,
    candidates: context.available_candidate_pool.players.map((player) => ({
      ...materialPlayer(player),
      rank: player.baseline_rank,
      score: player.baseline_score,
      adds: player.trending_add_count,
      drops: player.trending_drop_count,
    })),
  };
}

function weeklyPlayerCatalog(context: WeeklyContextData): WeeklyPlanPlayer[] {
  const players = new Map<string, PlayerSummary>();
  for (const roster of context.league_rosters)
    for (const player of roster.all_players)
      players.set(player.player_id, player);
  for (const player of context.available_candidate_pool.players)
    players.set(player.player_id, player);
  return [...players.values()]
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

function weeklyRosterCatalog(context: WeeklyContextData): WeeklyPlanRoster[] {
  return context.league_rosters.map((roster) => ({
    rosterId: roster.roster_id,
    teamName:
      roster.team_name ??
      roster.display_name ??
      roster.username ??
      `Roster ${String(roster.roster_id)}`,
    avatar: null,
  }));
}

function playerIndex(context: WeeklyContextData): Map<string, PlayerSummary> {
  const result = new Map<string, PlayerSummary>();
  for (const roster of context.league_rosters)
    for (const player of roster.all_players)
      result.set(player.player_id, player);
  for (const player of context.available_candidate_pool.players)
    result.set(player.player_id, player);
  return result;
}

function materialPlayer(player: PlayerSummary) {
  return {
    id: player.player_id,
    status: player.status,
    injury: player.injury_status,
    depth: player.depth_chart_order,
    searchRank: player.search_rank,
  };
}

function assertFaabRange(
  claim: TuesdayPlanOutput["waiverClaims"][number],
  faabLeague: boolean,
): void {
  const values = [
    claim.faabPercentMin,
    claim.faabPercentTarget,
    claim.faabPercentMax,
  ];
  if (!faabLeague && values.some((value) => value !== null))
    throw new Error("Non-FAAB leagues must use null for every FAAB field");
  if (values.every((value) => value === null)) return;
  if (values.some((value) => value === null))
    throw new Error("A FAAB range must provide minimum, target, and maximum");
  const [minimum, target, maximum] = values as [number, number, number];
  if (minimum > target || target > maximum)
    throw new Error("FAAB ranges must be ordered minimum, target, maximum");
}

function isFaabLeague(context: WeeklyContextData): boolean {
  return context.league.waiver_type === 2 || context.league.waiver_type === "2";
}

function assertConsistentWaiverContingencies(
  claims: TuesdayPlanOutput["waiverClaims"],
): void {
  const groupByDrop = new Map<string, string>();
  const dropByGroup = new Map<string, string | null>();
  for (const claim of claims) {
    const group = claim.contingencyGroup.trim();
    if (group.length === 0)
      throw new Error("Every waiver claim needs a non-empty contingency group");

    const existingDrop = dropByGroup.get(group);
    if (dropByGroup.has(group) && existingDrop !== claim.dropPlayerId)
      throw new Error(
        `Waiver contingency group ${group} cannot span different drop slots`,
      );
    dropByGroup.set(group, claim.dropPlayerId);

    if (claim.dropPlayerId === null) continue;
    const existingGroup = groupByDrop.get(claim.dropPlayerId);
    if (existingGroup !== undefined && existingGroup !== group)
      throw new Error(
        `Waiver claims sharing drop ${claim.dropPlayerId} must use the same contingency group`,
      );
    groupByDrop.set(claim.dropPlayerId, group);
  }
}

function validateSourceCatalog(
  sources: TuesdayPlanOutput["sources"],
): Set<string> {
  const ids = sources.map((source) => {
    const id = source.evidenceId?.trim();
    if (!id) throw new Error("Every weekly-plan source needs an evidence ID");
    if (id !== source.evidenceId)
      throw new Error(
        "Weekly-plan evidence IDs cannot contain outer whitespace",
      );
    if (source.sourceType !== "sleeper" && source.url === null)
      throw new Error(
        `Weekly-plan ${source.sourceType} source ${id} needs an inspectable URL`,
      );
    return id;
  });
  assertUnique(ids, "source evidence ID");
  return new Set(ids);
}

function assertSourceIds(ids: string[], known: ReadonlySet<string>): void {
  assertKnownIds(ids, known, "source");
}

function assertMaterialSourceIds(
  ids: string[],
  known: ReadonlySet<string>,
  label: string,
): void {
  if (ids.length === 0)
    throw new Error(`Every ${label} needs at least one inspectable source`);
  assertUnique(ids, `${label} source`);
  assertSourceIds(ids, known);
}

function assertKnownIds(
  ids: string[],
  known: ReadonlySet<string>,
  label: string,
): void {
  for (const id of ids)
    if (!known.has(id)) throw new Error(`Unknown ${label} ${id}`);
}

function assertKnownNumbers(
  ids: number[],
  known: ReadonlySet<number>,
  label: string,
): void {
  for (const id of ids)
    if (!known.has(id)) throw new Error(`Unknown ${label} ${String(id)}`);
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`The plan returned a duplicate ${label}`);
}

function shortHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 20);
}

function dedupeChanges(changes: WeeklyChange[]): WeeklyChange[] {
  const seen = new Set<string>();
  return changes.filter((change) => {
    if (seen.has(change.id)) return false;
    seen.add(change.id);
    return true;
  });
}

function statusDescription(
  before: PlayerSummary,
  after: PlayerSummary,
): string {
  const pieces = [
    before.injury_status !== after.injury_status
      ? `injury ${before.injury_status ?? "clear"} → ${after.injury_status ?? "clear"}`
      : null,
    before.status !== after.status
      ? `status ${before.status ?? "unknown"} → ${after.status ?? "unknown"}`
      : null,
    before.depth_chart_order !== after.depth_chart_order
      ? `depth ${String(before.depth_chart_order ?? "?")} → ${String(after.depth_chart_order ?? "?")}`
      : null,
  ].filter(Boolean);
  return pieces.join(" · ");
}

function transactionEventType(type: string): SleeperEvent["eventType"] {
  if (type === "waiver") return "waiver";
  if (type === "free_agent") return "free_agent";
  if (type === "trade") return "trade";
  return "league";
}

function epochToIso(value: number | null): string | null {
  if (value === null) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : value % 10 === 1
        ? "st"
        : value % 10 === 2
          ? "nd"
          : value % 10 === 3
            ? "rd"
            : "th";
  return `${String(value)}${suffix}`;
}
