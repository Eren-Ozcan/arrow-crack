import { blockForArrow, buildOccupancy, cellKey, headOf, step } from "./level";
import type { Arrow, Block, Cell, FireResult, GameState } from "./types";

function isOnBoard(cell: Cell, state: GameState): boolean {
  const { cols, rows } = state.level;
  return cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows;
}

/**
 * Walk the straight ray ahead of the head. Only cells belonging to *another*
 * arrow block the shot: the body follows the route the head traced, so a long
 * tangled body is never its own obstacle (DESIGN.md 1.4).
 */
function rayIsClear(state: GameState, arrow: Arrow): boolean {
  let cell = step(headOf(arrow), arrow.dir);
  while (isOnBoard(cell, state)) {
    const occupant = state.occupancy.get(cellKey(cell));
    if (occupant !== undefined && occupant !== arrow.id) return false;
    cell = step(cell, arrow.dir);
  }
  return true;
}

/** A mistake: one heart, one mistake counted, board untouched (DESIGN.md 1.5). */
function spendHeart(state: GameState): GameState {
  const heartsLeft = state.heartsLeft - 1;
  return {
    ...state,
    heartsLeft,
    mistakes: state.mistakes + 1,
    status: heartsLeft <= 0 ? "lost" : state.status,
  };
}

function withoutArrow(state: GameState, arrowId: string): Arrow[] {
  return state.arrows.filter((arrow) => arrow.id !== arrowId);
}

/**
 * Resolve a tap. Pure and synchronous: the dead-state check (DESIGN.md 1.7)
 * runs the solver outside the reducer and sets `stuck` itself.
 */
export function fire(state: GameState, arrowId: string): FireResult {
  if (state.status !== "playing") {
    throw new Error(`cannot fire while the level is ${state.status}`);
  }

  const arrow = state.arrows.find((candidate) => candidate.id === arrowId);
  if (!arrow) throw new Error(`no arrow ${arrowId} on the board`);

  if (!rayIsClear(state, arrow)) {
    return { state: spendHeart(state), event: "blocked" };
  }

  const target = blockForArrow(state.blocks, arrow);

  // An open lane, or a lane whose block is already destroyed: the arrow flies
  // off and is gone for good. Free, and irreversible (DESIGN.md 1.4 step 2).
  if (!target) {
    const arrows = withoutArrow(state, arrow.id);
    return {
      state: { ...state, arrows, occupancy: buildOccupancy(arrows) },
      event: "flewOff",
    };
  }

  const topLayer = target.layers[0];
  if (topLayer !== arrow.color) {
    // The arrow slides back into exactly the shape it started from, so the
    // board is unchanged and only the heart is spent.
    return { state: spendHeart(state), event: "bounced" };
  }

  const arrows = withoutArrow(state, arrow.id);
  const remainingLayers = target.layers.slice(1);
  const destroyed = remainingLayers.length === 0;

  const blocks: Block[] = destroyed
    ? state.blocks.filter((block) => block.id !== target.id)
    : state.blocks.map((block) =>
        block.id === target.id ? { ...block, layers: remainingLayers } : block,
      );

  return {
    state: {
      ...state,
      arrows,
      blocks,
      occupancy: buildOccupancy(arrows),
      status: blocks.length === 0 ? "won" : state.status,
    },
    event: destroyed ? "destroyed" : "peeled",
  };
}

/** After a rewarded ad: +1 heart, board untouched (DESIGN.md 1.5). */
export function grantContinue(state: GameState): GameState {
  if (state.status !== "lost") {
    throw new Error(`cannot continue while the level is ${state.status}`);
  }
  return {
    ...state,
    heartsLeft: state.heartsLeft + 1,
    continuesUsed: state.continuesUsed + 1,
    status: "playing",
  };
}

/** Set by the UI when the solver reports no solution from here (DESIGN.md 1.7). */
export function markStuck(state: GameState): GameState {
  if (state.status !== "playing") return state;
  return { ...state, status: "stuck" };
}
