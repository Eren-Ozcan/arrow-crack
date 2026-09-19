import type { GameState } from "./types";

/**
 * Stars come from mistakes alone, counted across the whole attempt including
 * continues: 0 mistakes is 3 stars, 1 is 2 stars, 2 or more is 1 star
 * (DESIGN.md 1.6). `par` is not a star threshold.
 */
export function starsForMistakes(mistakes: number): 1 | 2 | 3 {
  if (mistakes === 0) return 3;
  if (mistakes === 1) return 2;
  return 1;
}

/** Stars earned for a finished attempt; an unwon level scores none. */
export function starsFor(state: GameState): 0 | 1 | 2 | 3 {
  return state.status === "won" ? starsForMistakes(state.mistakes) : 0;
}
