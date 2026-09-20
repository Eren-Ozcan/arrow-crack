import { blockForArrow, buildOccupancy, neighbourBlocks } from "./level";
import { isBlocked } from "./rays";
import type { Arrow, Block, FireResult, GameState } from "./types";

/**
 * A mistake: one heart, one mistake counted, board untouched (DESIGN.md 1.5).
 * On a forgiving tutorial level the mistake is shown and not charged.
 */
function spendHeart(state: GameState): GameState {
  if (state.level.forgiving) return state;

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
 * Whether the arrow may peel the block's top layer. Joker and Bomb break the
 * colour rule; everything else has to match (DESIGN.md 1.11).
 */
function matches(arrow: Arrow, block: Block): boolean {
  if (arrow.special === "joker" || arrow.special === "bomb") return true;
  return block.layers[0] === arrow.color;
}

/**
 * The blocks one shot peels. An ordinary shot peels its target; a bomb also
 * peels each immediately adjacent block, ignoring colour (DESIGN.md 1.11).
 */
function peelTargets(state: GameState, arrow: Arrow, target: Block): Block[] {
  if (arrow.special !== "bomb") return [target];
  return [target, ...neighbourBlocks(state.level, state.blocks, target)];
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

  // Only another arrow blocks the shot: the body follows the route the head
  // traced, so a long tangled body is never its own obstacle (DESIGN.md 1.4).
  // A Ghost is never blocked at all; `blockersOf` knows that.
  if (isBlocked(state, arrow)) {
    return { state: spendHeart(state), event: "blocked", peels: 0, destroyed: 0 };
  }

  const target = blockForArrow(state.blocks, arrow);

  // An open lane, or a lane whose block is already destroyed: the arrow flies
  // off and is gone for good. Free, and irreversible (DESIGN.md 1.4 step 2).
  if (!target) {
    const arrows = withoutArrow(state, arrow.id);
    return {
      state: { ...state, arrows, occupancy: buildOccupancy(arrows) },
      event: "flewOff",
      peels: 0,
      destroyed: 0,
    };
  }

  if (!matches(arrow, target)) {
    // The arrow slides back into exactly the shape it started from, so the
    // board is unchanged and only the heart is spent.
    return { state: spendHeart(state), event: "bounced", peels: 0, destroyed: 0 };
  }

  const peeled = new Set(peelTargets(state, arrow, target).map((block) => block.id));
  const arrows = withoutArrow(state, arrow.id);
  const blocks: Block[] = [];
  let destroyed = 0;

  for (const block of state.blocks) {
    if (!peeled.has(block.id)) {
      blocks.push(block);
      continue;
    }
    const layers = block.layers.slice(1);
    if (layers.length === 0) destroyed += 1;
    else blocks.push({ ...block, layers });
  }

  return {
    state: {
      ...state,
      arrows,
      blocks,
      occupancy: buildOccupancy(arrows),
      status: blocks.length === 0 ? "won" : state.status,
    },
    event: destroyed > 0 ? "destroyed" : "peeled",
    peels: peeled.size,
    destroyed,
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
