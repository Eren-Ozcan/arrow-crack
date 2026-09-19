import { blockCoversLane, cellKey, headOf, laneOf, sideOf, step } from "@/engine/level";
import type { GameState } from "@/engine/types";

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
  /** Total layers left across every block at the start of the search. */
  totalLayers: number;
}

export interface SearchState {
  alive: Uint32Array;
  /** Layers already peeled from each block. */
  peeled: Uint8Array;
  remainingLayers: number;
  destroyedBlocks: number;
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
  const targetOf = new Int16Array(arrowCount);
  const blockerWords = new Uint32Array(arrowCount * words);

  arrows.forEach((arrow, index) => {
    // validateLevel() has already rejected colours outside the palette.
    colorOf[index] = colorIndex.get(arrow.color)!;

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
      // blocks itself even when the path spirals onto its own ray.
      if (blocker !== undefined && blocker !== index) {
        blockerWords[index * words + (blocker >>> 5)]! |= 1 << (blocker & 31);
      }
      cell = step(cell, arrow.dir);
    }
  });

  const layersOf = blocks.map(
    (block) => new Uint8Array(block.layers.map((color) => colorIndex.get(color)!)),
  );
  const totalLayers = layersOf.reduce((sum, layers) => sum + layers.length, 0);

  return {
    arrowIds: arrows.map((arrow) => arrow.id),
    arrowCount,
    blockCount: blocks.length,
    words,
    colorOf,
    targetOf,
    blockerWords,
    layersOf,
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
