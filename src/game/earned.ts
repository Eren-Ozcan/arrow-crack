import type { GameState } from "@/engine/types";

/**
 * The combo reward (PROGRESSION.md 1.4): reaching the x5 cap upgrades one
 * arrow still on the board to a Joker, once per level attempt.
 *
 * Deliberately not random. The arrow chosen is the one whose colour currently
 * matches nothing on the frame — the piece the player was most stuck with.
 * Joker only: the weakest special does the least damage to a difficulty band,
 * and a Ghost would hand over the one piece that cancels the tangle.
 *
 * Pure, because it is the one thing in the game that is not solver-verified:
 * every level is proven solvable without it (CI.md 2.2), so an earned piece
 * may only ever make a board easier, and this is where that is decided.
 */
export function earnedJokerTarget(state: GameState): string | null {
  // Two specials on the board at once is the ceiling (DESIGN.md 1.11), and the
  // designed one is already there.
  const plain = state.arrows.filter((arrow) => !arrow.special);
  if (plain.length === 0) return null;

  const tops = new Set(state.blocks.map((block) => block.layers[0]));
  const stranded = plain.find((arrow) => !tops.has(arrow.color));
  return (stranded ?? plain[0]!).id;
}

/** The board with that arrow upgraded; the occupancy is unchanged. */
export function grantEarnedJoker(state: GameState, arrowId: string): GameState {
  return {
    ...state,
    arrows: state.arrows.map((arrow) =>
      arrow.id === arrowId ? { ...arrow, special: "joker" as const } : arrow,
    ),
  };
}
