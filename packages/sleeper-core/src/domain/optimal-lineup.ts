/**
 * A scored player that can be considered for a legal fantasy lineup.
 *
 * This contract is intentionally independent of Sleeper's player model so the
 * optimizer can also be used with other deterministic score sources.
 */
export type ScoredLineupPlayer = {
  player_id: string;
  points: number;
  positions: readonly string[];
};

export type OptimalLineupAssignment = {
  slot: string;
  canonical_slot: string;
  slot_index: number;
  player_id: string;
  points: number;
  positions: string[];
};

export type OptimalLineup = {
  points: number;
  assignments: OptimalLineupAssignment[];
};

export type LegalLineupInput = {
  /** Starting slots only. Bench, reserve, taxi, and IR are not lineup slots. */
  slots: readonly string[];
  players: readonly ScoredLineupPlayer[];
};

const NON_STARTING_SLOTS = new Set([
  "BN",
  "BENCH",
  "IR",
  "INJURED_RESERVE",
  "NA",
  "RESERVE",
  "TAXI",
]);

const DIRECT_SLOTS = new Set([
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "P",
  "DEF",
  "DL",
  "DE",
  "DT",
  "LB",
  "ILB",
  "OLB",
  "DB",
  "CB",
  "S",
  "FS",
  "SS",
]);

const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);
const WRRB_FLEX_POSITIONS = new Set(["RB", "WR"]);
const REC_FLEX_POSITIONS = new Set(["WR", "TE"]);
const SUPER_FLEX_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
const IDP_POSITIONS = new Set([
  "DL",
  "DE",
  "DT",
  "LB",
  "ILB",
  "OLB",
  "DB",
  "CB",
  "S",
  "FS",
  "SS",
]);

const SLOT_ALIASES: Readonly<Record<string, string>> = {
  DST: "DEF",
  D_ST: "DEF",
  DEFENSE: "DEF",
  TEAM_DEF: "DEF",
  TEAM_DEFENSE: "DEF",
  W_R_T: "FLEX",
  RB_WR_TE: "FLEX",
  WR_RB_TE: "FLEX",
  W_R: "WRRB_FLEX",
  RB_WR: "WRRB_FLEX",
  WR_RB: "WRRB_FLEX",
  W_T: "REC_FLEX",
  WR_TE: "REC_FLEX",
  OP: "SUPER_FLEX",
  SUPERFLEX: "SUPER_FLEX",
  Q_W_R_T: "SUPER_FLEX",
  QB_RB_WR_TE: "SUPER_FLEX",
  IDP: "IDP_FLEX",
};

/** Return starting slots while preserving the league's slot order. */
export function startingLineupSlots(
  rosterPositions: readonly string[],
): string[] {
  return rosterPositions.filter(
    (slot) => !NON_STARTING_SLOTS.has(normalizeToken(slot)),
  );
}

/**
 * Calculate the maximum legal score for an explicit set of lineup slots.
 *
 * `null` means the calculation is not supportable: a score or position is
 * missing, a slot is unknown, player IDs are duplicated, or the supplied pool
 * cannot fill every slot. Equal-scoring results are stable regardless of input
 * player order and prefer lexicographically earlier player IDs by slot order.
 */
export function optimizeLegalLineup(
  input: LegalLineupInput,
): OptimalLineup | null {
  if (input.slots.length === 0 || input.players.length < input.slots.length) {
    return null;
  }

  const slots = input.slots.map((slot, slotIndex) => {
    const canonicalSlot = canonicalSlotName(slot);
    return canonicalSlot === null ? null : { slot, canonicalSlot, slotIndex };
  });
  if (slots.some((slot) => slot === null)) {
    return null;
  }

  const seenPlayerIds = new Set<string>();
  const players = [...input.players]
    .sort((a, b) => a.player_id.localeCompare(b.player_id))
    .map((player) => {
      if (
        player.player_id.length === 0 ||
        seenPlayerIds.has(player.player_id) ||
        !Number.isFinite(player.points) ||
        player.positions.length === 0
      ) {
        return null;
      }
      seenPlayerIds.add(player.player_id);
      const positions = uniqueSortedPositions(player.positions);
      return positions.length === 0 ? null : { ...player, positions };
    });
  if (players.some((player) => player === null)) {
    return null;
  }

  const concreteSlots = slots.filter((slot) => slot !== null);
  const concretePlayers = players.filter((player) => player !== null);
  const source = 0;
  const firstPlayerNode = 1;
  const firstSlotNode = firstPlayerNode + concretePlayers.length;
  const sink = firstSlotNode + concreteSlots.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const assignmentEdges: AssignmentEdge[] = [];
  const tieBase = BigInt(concretePlayers.length + 1);

  for (const [playerIndex, player] of concretePlayers.entries()) {
    addFlowEdge(graph, source, firstPlayerNode + playerIndex, 1, ZERO_COST);
    for (const slot of concreteSlots) {
      if (!isEligible(slot.canonicalSlot, player.positions)) {
        continue;
      }
      const slotTieWeight =
        tieBase ** BigInt(concreteSlots.length - slot.slotIndex - 1);
      const edge = addFlowEdge(
        graph,
        firstPlayerNode + playerIndex,
        firstSlotNode + slot.slotIndex,
        1,
        {
          primary: -player.points,
          tie: BigInt(playerIndex) * slotTieWeight,
        },
      );
      assignmentEdges.push({ edge, player, slot });
    }
  }

  for (const slot of concreteSlots) {
    addFlowEdge(graph, firstSlotNode + slot.slotIndex, sink, 1, ZERO_COST);
  }

  for (let flow = 0; flow < concreteSlots.length; flow += 1) {
    const path = shortestAugmentingPath(graph, source, sink);
    if (path === null) {
      return null;
    }
    for (const { from, edgeIndex } of path) {
      const edge = graph[from]?.[edgeIndex];
      if (edge === undefined) {
        return null;
      }
      edge.capacity -= 1;
      const reverse = graph[edge.to]?.[edge.reverse];
      if (reverse === undefined) {
        return null;
      }
      reverse.capacity += 1;
    }
  }

  const assignments = assignmentEdges
    .filter(({ edge }) => edge.capacity === 0)
    .map(({ player, slot }) => ({
      slot: slot.slot,
      canonical_slot: slot.canonicalSlot,
      slot_index: slot.slotIndex,
      player_id: player.player_id,
      points: player.points,
      positions: [...player.positions],
    }))
    .sort((a, b) => a.slot_index - b.slot_index);

  if (assignments.length !== concreteSlots.length) {
    return null;
  }

  return {
    points: cleanNumber(
      assignments.reduce((total, assignment) => total + assignment.points, 0),
    ),
    assignments,
  };
}

type ConcreteSlot = {
  slot: string;
  canonicalSlot: string;
  slotIndex: number;
};

type ConcretePlayer = ScoredLineupPlayer & { positions: string[] };

type FlowCost = { primary: number; tie: bigint };

type FlowEdge = {
  to: number;
  reverse: number;
  capacity: number;
  cost: FlowCost;
};

type AssignmentEdge = {
  edge: FlowEdge;
  player: ConcretePlayer;
  slot: ConcreteSlot;
};

const ZERO_COST: FlowCost = { primary: 0, tie: 0n };
const SCORE_EPSILON = 1e-9;

function addFlowEdge(
  graph: FlowEdge[][],
  from: number,
  to: number,
  capacity: number,
  cost: FlowCost,
): FlowEdge {
  const fromEdges = graph[from];
  const toEdges = graph[to];
  if (fromEdges === undefined || toEdges === undefined) {
    throw new Error("Lineup optimizer graph contained an invalid node.");
  }
  const forward: FlowEdge = {
    to,
    reverse: toEdges.length,
    capacity,
    cost,
  };
  const reverse: FlowEdge = {
    to: from,
    reverse: fromEdges.length,
    capacity: 0,
    cost: { primary: -cost.primary, tie: -cost.tie },
  };
  fromEdges.push(forward);
  toEdges.push(reverse);
  return forward;
}

function shortestAugmentingPath(
  graph: readonly FlowEdge[][],
  source: number,
  sink: number,
): Array<{ from: number; edgeIndex: number }> | null {
  const distances: Array<FlowCost | null> = graph.map(() => null);
  const previous: Array<{ from: number; edgeIndex: number } | null> = graph.map(
    () => null,
  );
  distances[source] = ZERO_COST;

  for (let pass = 0; pass < graph.length - 1; pass += 1) {
    let changed = false;
    for (const [from, edges] of graph.entries()) {
      const distance = distances[from];
      if (distance == null) {
        continue;
      }
      for (const [edgeIndex, edge] of edges.entries()) {
        if (edge.capacity === 0) {
          continue;
        }
        const candidate = addCost(distance, edge.cost);
        const current = distances[edge.to];
        if (current == null || compareCost(candidate, current) < 0) {
          distances[edge.to] = candidate;
          previous[edge.to] = { from, edgeIndex };
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }

  if (distances[sink] === null) {
    return null;
  }
  const reversedPath: Array<{ from: number; edgeIndex: number }> = [];
  let node = sink;
  while (node !== source) {
    const step = previous[node];
    if (step === null || step === undefined) {
      return null;
    }
    reversedPath.push(step);
    const edge = graph[step.from]?.[step.edgeIndex];
    if (edge === undefined || edge.to !== node) {
      return null;
    }
    node = step.from;
  }
  return reversedPath.reverse();
}

function addCost(left: FlowCost, right: FlowCost): FlowCost {
  return {
    primary: left.primary + right.primary,
    tie: left.tie + right.tie,
  };
}

function compareCost(left: FlowCost, right: FlowCost): number {
  const primaryDifference = left.primary - right.primary;
  if (Math.abs(primaryDifference) > SCORE_EPSILON) {
    return primaryDifference < 0 ? -1 : 1;
  }
  return left.tie < right.tie ? -1 : left.tie > right.tie ? 1 : 0;
}

function canonicalSlotName(slot: string): string | null {
  const normalized = normalizeToken(slot);
  if (NON_STARTING_SLOTS.has(normalized)) {
    return null;
  }
  const canonical = SLOT_ALIASES[normalized] ?? normalized;
  return DIRECT_SLOTS.has(canonical) ||
    canonical === "FLEX" ||
    canonical === "WRRB_FLEX" ||
    canonical === "REC_FLEX" ||
    canonical === "SUPER_FLEX" ||
    canonical === "IDP_FLEX"
    ? canonical
    : null;
}

function isEligible(slot: string, positions: readonly string[]): boolean {
  const positionSet = new Set(positions);
  if (slot === "FLEX") {
    return intersects(positionSet, FLEX_POSITIONS);
  }
  if (slot === "WRRB_FLEX") {
    return intersects(positionSet, WRRB_FLEX_POSITIONS);
  }
  if (slot === "REC_FLEX") {
    return intersects(positionSet, REC_FLEX_POSITIONS);
  }
  if (slot === "SUPER_FLEX") {
    return intersects(positionSet, SUPER_FLEX_POSITIONS);
  }
  if (slot === "IDP_FLEX") {
    return intersects(positionSet, IDP_POSITIONS);
  }
  if (slot === "DEF") {
    return positionSet.has("DEF");
  }
  if (slot === "DL") {
    return intersects(positionSet, new Set(["DL", "DE", "DT"]));
  }
  if (slot === "LB") {
    return intersects(positionSet, new Set(["LB", "ILB", "OLB"]));
  }
  if (slot === "DB") {
    return intersects(positionSet, new Set(["DB", "CB", "S", "FS", "SS"]));
  }
  return positionSet.has(slot);
}

function uniqueSortedPositions(positions: readonly string[]): string[] {
  return [...new Set(positions.map(canonicalPosition).filter(isPresent))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function canonicalPosition(position: string): string | null {
  const normalized = normalizeToken(position);
  const canonical = SLOT_ALIASES[normalized] ?? normalized;
  return canonical.length === 0 ? null : canonical;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function intersects(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return [...left].some((value) => right.has(value));
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function cleanNumber(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
