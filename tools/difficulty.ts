/**
 * The difficulty model (DESIGN.md 4.3).
 *
 * Since hearts replaced the move limit, difficulty is not "how long is the
 * solution" — it is **how easy it is to make a mistake**. Every axis here is
 * measured against the shipped engine and the one solver, so the generator
 * that proposes a level and the gate that ships it read the same numbers.
 *
 * The bands below are guesses until real players hit them; the analytics fail
 * rate per level is what recalibrates them (ROADMAP.md, after launch).
 */
import { fire } from "../src/engine/fire";
import { blockForArrow, createState } from "../src/engine/level";
import { blockersOf, isBlocked } from "../src/engine/rays";
import type { Arrow, Block, GameState, LevelDef } from "../src/engine/types";
import {
  effortAt,
  FIRST_GENERATED_LEVEL,
  HAND_AUTHORED_LEVELS,
} from "../src/generator/spec";
import { solve } from "../src/solver";

export { FIRST_GENERATED_LEVEL };

/**
 * The widest fan-out the model still distinguishes. Counting distinct optimal
 * solutions, as DESIGN.md 4.3 first framed this axis, turns out to measure
 * nothing on a real board: every ordering of independent peels is its own
 * solution, so any board past a handful of arrows saturates whatever cap it is
 * given. What forgiveness actually means here is how many free moves a state
 * offers — `par` is not a star threshold, so a move that is free but not
 * optimal costs the player nothing.
 */
export const MAX_FAN_OUT = 6;

/** How far past a fatal move the probe keeps walking. */
const LOOKAHEAD_MAX = 3;
/** States sampled along the optimal solution for the lookahead probe. */
const LOOKAHEAD_SAMPLES = 5;

const MEASURE_BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000 };

/** The probe asks "is this board still alive", which is a much smaller search. */
const PROBE_BUDGET = { maxNodes: 500_000, timeBudgetMs: 2_000 };

export interface DifficultyMetrics {
  /** Primary: mean share of available taps that cost a heart (DESIGN.md 4.3). */
  trapRatio: number;
  /** Longest chain of "B cannot fire until A has fired". */
  forcedOrderDepth: number;
  /** How far past a fatal tap the board stays playable before it dies. */
  lookahead: number;
  /** Mean free moves per state along the optimal solution: how forgiving it is. */
  fanOut: number;
  /** Body length, bends and grid fill, as one 0..1 figure. */
  tangleDensity: number;
  /** Arrow count, layer count and wide blocks — a tiebreaker, not a cause. */
  boardLoad: number;
  /** The weighted score the bands are expressed in. */
  score: number;
  par: number;
}

/** Whether this arrow may peel the block's top layer; `fire()` decides the same way. */
function matches(arrow: Arrow, block: Block): boolean {
  if (arrow.special === "joker" || arrow.special === "bomb") return true;
  return block.layers[0] === arrow.color;
}

/**
 * The taps on offer that cost a heart: an arrow whose ray is obstructed, and
 * an arrow with a clear ray whose colour does not match what it would hit.
 * An arrow firing into an open or emptied lane is free, so it is never a trap.
 */
function trapsAt(state: GameState): { traps: number; taps: number } {
  let traps = 0;
  for (const arrow of state.arrows) {
    if (isBlocked(state, arrow)) {
      traps += 1;
      continue;
    }
    const target = blockForArrow(state.blocks, arrow);
    if (target && !matches(arrow, target)) traps += 1;
  }
  return { traps, taps: state.arrows.length };
}

/**
 * The dependency graph: an edge A -> B means B cannot fire until A has. Two
 * sources feed it — A standing on B's ray, and A having to clear the layer
 * above the one B is there to peel. The longest path through it is what makes
 * a level a puzzle rather than a lookup.
 */
function forcedOrderDepth(level: LevelDef): number {
  const edges = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string): void => {
    if (from === to) return;
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };

  const state = createState(level);
  for (const arrow of state.arrows) {
    for (const blocker of blockersOf(state, arrow)) addEdge(blocker, arrow.id);
  }

  // Layer ordering: whoever can serve layer i waits on whoever serves i - 1.
  for (const block of level.blocks) {
    const servers = block.layers.map((layer) =>
      level.arrows
        .filter((arrow) => blockForArrow([block], arrow)?.id === block.id)
        .filter((arrow) =>
          arrow.special === "joker" || arrow.special === "bomb"
            ? true
            : arrow.color === layer,
        )
        .map((arrow) => arrow.id),
    );
    for (let layer = 1; layer < servers.length; layer += 1) {
      for (const above of servers[layer - 1]!) {
        for (const below of servers[layer]!) addEdge(above, below);
      }
    }
  }

  // Longest path, cycle safe: a cycle is a mutual wait, which contributes no
  // depth rather than an infinite one.
  const depth = new Map<string, number>();
  const onStack = new Set<string>();

  const walk = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (onStack.has(id)) return 0;

    onStack.add(id);
    let longest = 1;
    for (const next of edges.get(id) ?? []) longest = Math.max(longest, 1 + walk(next));
    onStack.delete(id);

    depth.set(id, longest);
    return longest;
  };

  let deepest = 0;
  for (const arrow of level.arrows) deepest = Math.max(deepest, walk(arrow.id));
  return deepest;
}

/** The free moves available from here — the ones that do not cost a heart. */
function freeMoves(state: GameState): string[] {
  return state.arrows
    .filter((arrow) => !isBlocked(state, arrow))
    .filter((arrow) => {
      const target = blockForArrow(state.blocks, arrow);
      return !target || matches(arrow, target);
    })
    .map((arrow) => arrow.id);
}

/** How many more free moves a dead board still offers before it stops. */
function survivalDepth(state: GameState, budget: number): number {
  if (budget <= 0 || state.status !== "playing") return 0;

  let longest = 0;
  for (const arrowId of freeMoves(state)) {
    const next = fire(state, arrowId).state;
    longest = Math.max(longest, 1 + survivalDepth(next, budget - 1));
  }
  return longest;
}

/**
 * Lookahead distance: how many moves ahead of the current board the player has
 * to see for a tap to be provably correct. A tap that kills the level and is
 * punished on the next move is fair; one that leaves three playable moves
 * before the stuck panel is what separates level 70 from level 40.
 */
function lookaheadAt(state: GameState): number {
  let worst = 0;
  for (const arrowId of freeMoves(state)) {
    const next = fire(state, arrowId).state;
    if (next.status === "won") continue;

    const verdict = solve(next, PROBE_BUDGET);
    // Fail open here too: an uncertified board is not counted as a trap.
    if (!verdict.exhausted || verdict.solvable) continue;

    worst = Math.max(worst, 1 + survivalDepth(next, LOOKAHEAD_MAX - 1));
  }
  return worst;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Mean body length, bends per arrow and grid fill, folded into one figure. */
function tangleDensity(level: LevelDef): number {
  const cells = level.mask ? level.mask.length : level.cols * level.rows;
  let bodyCells = 0;
  let bends = 0;

  for (const arrow of level.arrows) {
    bodyCells += arrow.path.length;
    for (let index = 2; index < arrow.path.length; index += 1) {
      const a = arrow.path[index - 2]!;
      const b = arrow.path[index - 1]!;
      const c = arrow.path[index]!;
      if (a.col - b.col !== b.col - c.col || a.row - b.row !== b.row - c.row) bends += 1;
    }
  }

  const arrows = Math.max(1, level.arrows.length);
  const meanLength = bodyCells / arrows;
  const meanBends = bends / arrows;

  return clamp01(
    (clamp01((meanLength - 1) / 4) +
      clamp01(meanBends / 2) +
      clamp01(bodyCells / cells)) /
      3,
  );
}

function boardLoad(level: LevelDef): number {
  const layers = level.blocks.reduce((sum, block) => sum + block.layers.length, 0);
  const wide = level.blocks.filter((block) => block.span > 1).length;
  return clamp01(
    (clamp01(level.arrows.length / 16) + clamp01(layers / 24) + clamp01(wide / 4)) / 3,
  );
}

/**
 * The single figure the bands are written in. Trap ratio carries the most
 * weight because it is the axis the heart rule actually charges for; board
 * load carries the least because it correlates with difficulty without
 * causing it.
 */
function scoreOf(metrics: Omit<DifficultyMetrics, "score">): number {
  const forced = clamp01((metrics.forcedOrderDepth - 1) / 7);
  const lookahead = clamp01(metrics.lookahead / LOOKAHEAD_MAX);
  const narrowness = clamp01(1 - (metrics.fanOut - 1) / (MAX_FAN_OUT - 1));

  return (
    0.35 * metrics.trapRatio +
    0.2 * forced +
    0.2 * lookahead +
    0.1 * narrowness +
    0.1 * metrics.tangleDensity +
    0.05 * metrics.boardLoad
  );
}

/**
 * Measure a level. Returns null when the solver cannot certify the board
 * inside its budget — an unrated level is never a passing one, but that is
 * the gate's verdict to give, not this function's.
 */
export function measure(level: LevelDef): DifficultyMetrics | null {
  const start = createState(level);
  const solution = solve(start, MEASURE_BUDGET);
  if (!solution.solvable || !solution.witness || solution.par === null) return null;

  const states: GameState[] = [start];
  let current = start;
  for (const arrowId of solution.witness) {
    current = fire(current, arrowId).state;
    if (current.status === "playing") states.push(current);
  }

  let traps = 0;
  let taps = 0;
  for (const state of states) {
    const counted = trapsAt(state);
    traps += counted.traps;
    taps += counted.taps;
  }

  // The probe is the expensive axis, so it samples the solution rather than
  // walking every state of it.
  const stride = Math.max(1, Math.ceil(states.length / LOOKAHEAD_SAMPLES));
  let lookahead = 0;
  for (let index = 0; index < states.length; index += stride) {
    lookahead = Math.max(lookahead, lookaheadAt(states[index]!));
  }

  const partial = {
    trapRatio: taps === 0 ? 0 : traps / taps,
    forcedOrderDepth: forcedOrderDepth(level),
    lookahead,
    fanOut:
      states.reduce((sum, state) => sum + freeMoves(state).length, 0) / states.length,
    tangleDensity: tangleDensity(level),
    boardLoad: boardLoad(level),
    par: solution.par,
  };

  return { ...partial, score: scoreOf(partial) };
}

export interface Band {
  score: { min: number; max: number };
  trapRatio: { min: number };
  fanOut: { max: number };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * The target band for a level index. It follows the same effort curve the
 * generator's knobs do (`src/generator/spec.ts`): a saturating climb from
 * "a board where a quarter of the taps on offer cost a heart" at 11 to "a
 * board where most of them do, with a forced order behind it" by level 700 or
 * so, with the ten-level wave riding on top.
 *
 * The centres are calibrated against what the generator actually produces —
 * a band the generator cannot reach would only mean hand-tuned levels, which
 * is the one thing the gate is there to prevent. The width is deliberately
 * generous: a tighter band would be pretending the model is calibrated
 * against players, and it is not yet (DESIGN.md 4.3).
 */
export function bandFor(id: number, hearts = 4): Band {
  const t = effortAt(id);
  const centre = lerp(0.24, 0.48, t);

  // A one-heart level is the game's punctuation, not a difficulty spike: it is
  // built to be readable and a little shorter, because the demand there is
  // precision (DESIGN.md 1.5). So it may sit below its neighbours' band — and
  // may never sit above it.
  if (hearts === 1) {
    return {
      score: { min: centre - 0.2, max: centre },
      trapRatio: { min: lerp(0.15, 0.3, t) / 2 },
      fanOut: { max: MAX_FAN_OUT },
    };
  }

  return {
    score: { min: centre - 0.08, max: centre + 0.08 },
    trapRatio: { min: lerp(0.15, 0.3, t) },
    fanOut: { max: lerp(MAX_FAN_OUT, 4, t) },
  };
}

/** The score the generator aims a candidate at for this level index. */
export function targetScore(id: number, hearts = 4): number {
  const band = bandFor(id, hearts);
  return (band.score.min + band.score.max) / 2;
}

/** Band violations for a generated level, empty when it sits inside its band. */
export function checkBand(level: LevelDef, metrics: DifficultyMetrics): string[] {
  // The bands describe what the generator is asked for. The tutorial and the
  // shaped beats are authored, and judged by being played instead.
  if (level.id < FIRST_GENERATED_LEVEL || HAND_AUTHORED_LEVELS.includes(level.id)) {
    return [];
  }

  const band = bandFor(level.id, level.hearts);
  const problems: string[] = [];
  const round = (value: number): string => value.toFixed(2);

  if (metrics.score < band.score.min || metrics.score > band.score.max) {
    problems.push(
      `difficulty score ${round(metrics.score)} is outside the band for level ${level.id} (${round(band.score.min)}-${round(band.score.max)})`,
    );
  }
  if (metrics.trapRatio < band.trapRatio.min) {
    problems.push(
      `trap ratio ${round(metrics.trapRatio)} is below ${round(band.trapRatio.min)} for level ${level.id}`,
    );
  }
  if (metrics.fanOut > band.fanOut.max) {
    problems.push(
      `${round(metrics.fanOut)} free moves per state; level ${level.id} allows ${round(band.fanOut.max)}`,
    );
  }

  return problems;
}
