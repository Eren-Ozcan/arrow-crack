import type { PackedBoard, SearchState } from "./board";
import {
  BOMB,
  heuristic,
  initialSearchState,
  isSolved,
  legalMoves,
  moveKind,
  peelTargets,
} from "./board";

/** Deterministic PRNG: the same board must always produce the same search. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Zobrist keys, kept as two independent 32-bit halves. The visited set nests
 * one half inside the other, so lookups stay numeric and exact - a hash
 * collision would make the solver miss a solution and call a live board dead.
 */
interface Zobrist {
  arrowHigh: Uint32Array;
  arrowLow: Uint32Array;
  peelHigh: Uint32Array[];
  peelLow: Uint32Array[];
}

function buildZobrist(board: PackedBoard): Zobrist {
  const random = mulberry32(0x9e3779b9);
  const word = (): number => (random() * 4294967296) >>> 0;

  const arrowHigh = new Uint32Array(board.arrowCount);
  const arrowLow = new Uint32Array(board.arrowCount);
  for (let index = 0; index < board.arrowCount; index += 1) {
    arrowHigh[index] = word();
    arrowLow[index] = word();
  }

  const peelHigh: Uint32Array[] = [];
  const peelLow: Uint32Array[] = [];
  for (let block = 0; block < board.blockCount; block += 1) {
    const steps = board.layersOf[block]!.length + 1;
    const high = new Uint32Array(steps);
    const low = new Uint32Array(steps);
    for (let peeled = 0; peeled < steps; peeled += 1) {
      high[peeled] = word();
      low[peeled] = word();
    }
    peelHigh.push(high);
    peelLow.push(low);
  }

  return { arrowHigh, arrowLow, peelHigh, peelLow };
}

interface Hash {
  high: number;
  low: number;
}

function initialHash(board: PackedBoard, keys: Zobrist): Hash {
  let high = 0;
  let low = 0;
  for (let arrow = 0; arrow < board.arrowCount; arrow += 1) {
    high ^= keys.arrowHigh[arrow]!;
    low ^= keys.arrowLow[arrow]!;
  }
  for (let block = 0; block < board.blockCount; block += 1) {
    high ^= keys.peelHigh[block]![0]!;
    low ^= keys.peelLow[block]![0]!;
  }
  return { high: high >>> 0, low: low >>> 0 };
}

interface Applied {
  arrow: number;
  /** Blocks this move peeled, in the order they were peeled. */
  peeled: number[];
  /** How many of them were emptied. */
  destroyed: number;
  wasBomb: boolean;
}

function applyMove(
  board: PackedBoard,
  state: SearchState,
  hash: Hash,
  keys: Zobrist,
  arrow: number,
): Applied {
  const kind = moveKind(board, state, arrow);
  const wasBomb = board.specialOf[arrow] === BOMB;

  state.alive[arrow >>> 5]! &= ~(1 << (arrow & 31));
  hash.high = (hash.high ^ keys.arrowHigh[arrow]!) >>> 0;
  hash.low = (hash.low ^ keys.arrowLow[arrow]!) >>> 0;
  if (wasBomb) state.bombsLeft -= 1;

  if (kind !== "peel") return { arrow, peeled: [], destroyed: 0, wasBomb };

  // A bomb peels its target and each live neighbour, ignoring colour.
  const peeled = peelTargets(board, state, arrow);
  let destroyed = 0;

  for (const block of peeled) {
    const before = state.peeled[block]!;
    const after = before + 1;
    state.peeled[block] = after;
    state.remainingLayers -= 1;
    hash.high =
      (hash.high ^ keys.peelHigh[block]![before]! ^ keys.peelHigh[block]![after]!) >>> 0;
    hash.low =
      (hash.low ^ keys.peelLow[block]![before]! ^ keys.peelLow[block]![after]!) >>> 0;

    if (after === board.layersOf[block]!.length) {
      destroyed += 1;
      state.destroyedBlocks += 1;
    }
  }

  return { arrow, peeled, destroyed, wasBomb };
}

function undoMove(state: SearchState, hash: Hash, keys: Zobrist, applied: Applied): void {
  const { arrow } = applied;

  state.alive[arrow >>> 5]! |= 1 << (arrow & 31);
  hash.high = (hash.high ^ keys.arrowHigh[arrow]!) >>> 0;
  hash.low = (hash.low ^ keys.arrowLow[arrow]!) >>> 0;
  if (applied.wasBomb) state.bombsLeft += 1;

  for (const block of applied.peeled) {
    const after = state.peeled[block]!;
    const before = after - 1;
    state.peeled[block] = before;
    state.remainingLayers += 1;
    hash.high =
      (hash.high ^ keys.peelHigh[block]![after]! ^ keys.peelHigh[block]![before]!) >>> 0;
    hash.low =
      (hash.low ^ keys.peelLow[block]![after]! ^ keys.peelLow[block]![before]!) >>> 0;
  }

  state.destroyedBlocks -= applied.destroyed;
}

export interface SearchBudget {
  /** Hard iteration cap; the search stops and reports itself unfinished. */
  maxNodes?: number;
  /** Wall-clock budget in milliseconds, checked every 1024 nodes. */
  timeBudgetMs?: number;
  /** Stop counting distinct optimal solutions at this many. */
  countSolutionsUpTo?: number;
}

export interface SearchResult {
  solvable: boolean;
  /** Optimal solution length, or null when none was found. */
  par: number | null;
  /** Arrow ids, in firing order. */
  witness: string[] | null;
  /** Distinct optimal solutions, capped by countSolutionsUpTo. */
  solutionCount: number;
  nodes: number;
  /**
   * False when the budget ran out before the search finished. An unsolvable
   * verdict is only trustworthy when this is true - callers on the device
   * fail open (TELEMETRY.md 4.2).
   */
  exhausted: boolean;
}

const DEFAULT_MAX_NODES = 2_000_000;

class BudgetExceeded extends Error {}

/**
 * IDA* over the packed board. The heuristic is the number of layers still on
 * the frame, less what the bombs on the board could save: every move peels at
 * least one layer and only a bomb peels more, so it never overestimates, which
 * is what makes the returned length the true optimum (DESIGN.md 4.1).
 */
export function search(board: PackedBoard, budget: SearchBudget = {}): SearchResult {
  const maxNodes = budget.maxNodes ?? DEFAULT_MAX_NODES;
  const deadline =
    budget.timeBudgetMs === undefined ? Infinity : Date.now() + budget.timeBudgetMs;
  const solutionCap = budget.countSolutionsUpTo ?? 0;

  const keys = buildZobrist(board);
  const state = initialSearchState(board);
  const hash = initialHash(board, keys);

  let nodes = 0;
  let exhausted = true;
  let witness: number[] | null = null;
  let solutionCount = 0;
  const path: number[] = [];

  /** Visited states for the current iteration: high -> low -> cheapest depth. */
  let visited = new Map<number, Map<number, number>>();

  const seenAtOrBelow = (depth: number): boolean => {
    let byLow = visited.get(hash.high);
    if (byLow === undefined) {
      byLow = new Map<number, number>();
      visited.set(hash.high, byLow);
    }

    const previous = byLow.get(hash.low);
    if (previous !== undefined && previous <= depth) return true;

    byLow.set(hash.low, depth);
    return false;
  };

  const spend = (): void => {
    nodes += 1;
    if (nodes > maxNodes) throw new BudgetExceeded();
    if ((nodes & 1023) === 0 && Date.now() > deadline) throw new BudgetExceeded();
  };

  /** Returns the smallest f value that exceeded the bound, or null on success. */
  const dive = (depth: number, bound: number): number | null => {
    spend();

    const estimate = depth + heuristic(state);
    if (estimate > bound) return estimate;
    if (isSolved(board, state)) {
      witness = [...path];
      return null;
    }
    if (seenAtOrBelow(depth)) return Infinity;

    let nextBound = Infinity;
    for (const arrow of legalMoves(board, state)) {
      const applied = applyMove(board, state, hash, keys, arrow);
      path.push(arrow);

      const overshoot = dive(depth + 1, bound);

      path.pop();
      undoMove(state, hash, keys, applied);

      if (overshoot === null) return null;
      if (overshoot < nextBound) nextBound = overshoot;
    }
    return nextBound;
  };

  /** Counts distinct optimal solutions, stopping at the cap. */
  const countAt = (depth: number, par: number): void => {
    spend();

    if (isSolved(board, state)) {
      solutionCount += 1;
      return;
    }
    if (depth + heuristic(state) > par) return;

    for (const arrow of legalMoves(board, state)) {
      const applied = applyMove(board, state, hash, keys, arrow);
      countAt(depth + 1, par);
      undoMove(state, hash, keys, applied);
      if (solutionCount >= solutionCap) return;
    }
  };

  try {
    let bound = heuristic(state);
    while (bound !== Infinity) {
      visited = new Map();
      const overshoot = dive(0, bound);
      if (overshoot === null) break;
      bound = overshoot;
    }

    if (witness !== null && solutionCap > 0) {
      countAt(0, (witness as number[]).length);
    }
  } catch (error) {
    /* v8 ignore next -- any other error is a bug, not a search outcome */
    if (!(error instanceof BudgetExceeded)) throw error;
    exhausted = false;
  }

  const found = witness as number[] | null;
  return {
    solvable: found !== null,
    par: found === null ? null : found.length,
    witness: found === null ? null : found.map((arrow) => board.arrowIds[arrow]!),
    solutionCount,
    nodes,
    exhausted,
  };
}
