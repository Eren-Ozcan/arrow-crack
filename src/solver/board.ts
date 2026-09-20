import {
  blockCoversLane,
  cellKey,
  headOf,
  laneOf,
  neighbourBlocks,
  sideOf,
  step,
} from "@/engine/level";
import type { GameState, Special } from "@/engine/types";

/** Packed special codes; 0 is an ordinary arrow. */
export const NONE = 0;
export const JOKER = 1;
export const GHOST = 2;
export const BOMB = 3;

const SPECIAL_CODE: Record<Special, number> = { joker: JOKER, ghost: GHOST, bomb: BOMB };

/** The most layers one move can remove: a bomb hits its target and two neighbours. */
export const BOMB_PEELS = 3;

/**
 * The packed board the search runs on (TELEMETRY.md 4.3): small typed arrays
 * and bitmasks instead of the object graph the UI renders from. Everything
 * here is static for the duration of a search; only `SearchState` changes.
 */
export interface PackedBoard {
  /** Arrow ids in packed order, so a witness can be reported in engine terms. */
  arrowIds: string[];
  arrowCount: number;
  blockCount: number;
  /** Words per alive-mask; arrows are addressed as (word, bit). */
  words: number;
  /** Arrow colour, as an index into the level palette. */
  colorOf: Uint8Array;
  /** Special code per arrow (DESIGN.md 1.11); 0 is an ordinary arrow. */
  specialOf: Uint8Array;
  /** Block an arrow exits into, or -1 for an open or already destroyed lane. */
  targetOf: Int16Array;
  /**
   * Arrows that sit on this arrow's exit ray, as a bitmask. The shot is
   * blocked exactly when one of them is still alive, which makes the ray
   * check a single AND per move.
   */
  blockerWords: Uint32Array;
  /** Layer colours per block, top first, as palette indices. */
  layersOf: Uint8Array[];
  /**
   * The two blocks either side of each block along the frame, as block
   * indices, or -1 where the frame has a gap. Two entries per block; this is
   * the bomb's area effect.
   */
  neighboursOf: Int16Array;
  /** Bomb arrows on the board, which is what bounds the heuristic. */
  bombCount: number;
  /** Total layers left across every block at the start of the search. */
  totalLayers: number;
}

export interface SearchState {
  alive: Uint32Array;
  /** Layers already peeled from each block. */
  peeled: Uint8Array;
  remainingLayers: number;
  destroyedBlocks: number;
  /** Bombs still on the board, for the heuristic. */
  bombsLeft: number;
}

export function packBoard(state: GameState): PackedBoard {
  const { level } = state;
  const arrows = state.arrows;
  const blocks = state.blocks;
  const arrowCount = arrows.length;
  const words = Math.max(1, Math.ceil(arrowCount / 32));

  const indexOfArrow = new Map<string, number>();
  arrows.forEach((arrow, index) => indexOfArrow.set(arrow.id, index));

  const colorIndex = new Map<string, number>();
  level.palette.forEach((color, index) => colorIndex.set(color, index));

  const owner = new Map<string, number>();
  arrows.forEach((arrow, index) => {
    for (const cell of arrow.path) owner.set(cellKey(cell), index);
  });

  const colorOf = new Uint8Array(arrowCount);
  const specialOf = new Uint8Array(arrowCount);
  const targetOf = new Int16Array(arrowCount);
  const blockerWords = new Uint32Array(arrowCount * words);

  arrows.forEach((arrow, index) => {
    // validateLevel() has already rejected colours outside the palette.
    colorOf[index] = colorIndex.get(arrow.color)!;
    specialOf[index] = arrow.special ? SPECIAL_CODE[arrow.special] : NONE;

    const side = sideOf(arrow.dir);
    const lane = laneOf(arrow);
    targetOf[index] = blocks.findIndex(
      (block) => block.side === side && blockCoversLane(block, lane),
    );

    let cell = step(headOf(arrow), arrow.dir);
    while (
      cell.col >= 0 &&
      cell.col < level.cols &&
      cell.row >= 0 &&
      cell.row < level.rows
    ) {
      const blocker = owner.get(cellKey(cell));
      // An arrow's own body follows the route its head traced, so it never
      // blocks itself even when the path spirals onto its own ray. A Ghost
      // passes through every arrow, so it records no blockers at all.
      if (blocker !== undefined && blocker !== index && arrow.special !== "ghost") {
        blockerWords[index * words + (blocker >>> 5)]! |= 1 << (blocker & 31);
      }
      cell = step(cell, arrow.dir);
    }
  });

  const layersOf = blocks.map(
    (block) => new Uint8Array(block.layers.map((color) => colorIndex.get(color)!)),
  );
  const totalLayers = layersOf.reduce((sum, layers) => sum + layers.length, 0);

  const blockIndex = new Map<string, number>();
  blocks.forEach((block, index) => blockIndex.set(block.id, index));
  const neighboursOf = new Int16Array(blocks.length * 2).fill(-1);
  blocks.forEach((block, index) => {
    neighbourBlocks(level, blocks, block).forEach((neighbour, slot) => {
      neighboursOf[index * 2 + slot] = blockIndex.get(neighbour.id)!;
    });
  });

  return {
    arrowIds: arrows.map((arrow) => arrow.id),
    arrowCount,
    blockCount: blocks.length,
    words,
    colorOf,
    specialOf,
    targetOf,
    blockerWords,
    layersOf,
    neighboursOf,
    bombCount: arrows.filter((arrow) => arrow.special === "bomb").length,
    totalLayers,
  };
}

export function initialSearchState(board: PackedBoard): SearchState {
  const alive = new Uint32Array(board.words);
  for (let index = 0; index < board.arrowCount; index += 1) {
    alive[index >>> 5]! |= 1 << (index & 31);
  }
  return {
    alive,
    peeled: new Uint8Array(board.blockCount),
    remainingLayers: board.totalLayers,
    destroyedBlocks: 0,
    bombsLeft: board.bombCount,
  };
}

export function isAlive(state: SearchState, arrow: number): boolean {
  return (state.alive[arrow >>> 5]! & (1 << (arrow & 31))) !== 0;
}

export function rayIsBlocked(
  board: PackedBoard,
  state: SearchState,
  arrow: number,
): boolean {
  const base = arrow * board.words;
  for (let word = 0; word < board.words; word += 1) {
    if ((board.blockerWords[base + word]! & state.alive[word]!) !== 0) return true;
  }
  return false;
}

/** What firing an arrow does, once the ray is known to be clear. */
export type MoveKind = "peel" | "flyOff" | "illegal";

/**
 * A bouncing tap changes nothing and costs a life, so it is never part of a
 * solution and the solver prunes it outright (DESIGN.md 4.1).
 */
export function moveKind(
  board: PackedBoard,
  state: SearchState,
  arrow: number,
): MoveKind {
  const target = board.targetOf[arrow]!;
  if (target < 0) return "flyOff";

  const layers = board.layersOf[target]!;
  const peeled = state.peeled[target]!;
  if (peeled >= layers.length) return "flyOff";

  // Joker and Bomb break the colour rule (DESIGN.md 1.11).
  const special = board.specialOf[arrow]!;
  if (special === JOKER || special === BOMB) return "peel";

  return layers[peeled] === board.colorOf[arrow] ? "peel" : "illegal";
}

export function legalMoves(board: PackedBoard, state: SearchState): number[] {
  const moves: number[] = [];
  for (let arrow = 0; arrow < board.arrowCount; arrow += 1) {
    if (!isAlive(state, arrow)) continue;
    if (rayIsBlocked(board, state, arrow)) continue;
    if (moveKind(board, state, arrow) !== "illegal") moves.push(arrow);
  }
  return moves;
}

export function isSolved(board: PackedBoard, state: SearchState): boolean {
  return state.destroyedBlocks === board.blockCount;
}

/**
 * Moves still needed, never overestimated — which is what makes the length
 * IDA* returns the true optimum. Every move peels at least one layer, and only
 * a bomb peels more: at most three, so each bomb still on the board can save
 * at most two moves.
 */
export function heuristic(state: SearchState): number {
  const saved = state.bombsLeft * (BOMB_PEELS - 1);
  return Math.max(0, state.remainingLayers - saved);
}

/** The blocks a shot peels: its target, plus a bomb's live neighbours. */
export function peelTargets(
  board: PackedBoard,
  state: SearchState,
  arrow: number,
): number[] {
  const target = board.targetOf[arrow]!;
  if (board.specialOf[arrow] !== BOMB) return [target];

  const targets = [target];
  for (const slot of [0, 1]) {
    const neighbour = board.neighboursOf[target * 2 + slot]!;
    // A destroyed neighbour absorbs nothing, and the effect is not passed on.
    if (neighbour < 0) continue;
    if (state.peeled[neighbour]! >= board.layersOf[neighbour]!.length) continue;
    if (!targets.includes(neighbour)) targets.push(neighbour);
  }
  return targets;
}
