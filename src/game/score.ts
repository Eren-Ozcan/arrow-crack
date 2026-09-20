import type { FireResult } from "@/engine/types";

/**
 * Score and the combo multiplier (PROGRESSION.md 1). Stars gate progression
 * and come from mistakes; this is the separate performance ladder a league
 * would one day rank.
 *
 * The multiplier is driven by an unbroken chain of correct shots. Speed only
 * decides how fast the chain climbs, so haste without accuracy is punished
 * twice — a heart and the whole multiplier — and never rewarded.
 */
export const BASE_SHOT_SCORE = 100;
export const CLEAN_BONUS = 1000;
/** A correct shot inside this window advances the chain by 2 instead of 1. */
export const HOT_WINDOW_MS = 4000;
export const MAX_MULTIPLIER = 5;
/** The layer that destroys a block is worth more than an ordinary peel. */
export const DESTROY_BONUS = 1.5;

const CHAIN_STEPS: { chain: number; multiplier: number }[] = [
  { chain: 12, multiplier: 5 },
  { chain: 8, multiplier: 4 },
  { chain: 5, multiplier: 3 },
  { chain: 3, multiplier: 2 },
];

export function multiplierFor(chain: number): number {
  for (const step of CHAIN_STEPS) {
    if (chain >= step.chain) return step.multiplier;
  }
  return 1;
}

export interface ScoreState {
  score: number;
  /** Consecutive correct shots. */
  chain: number;
  multiplier: number;
  lastShotAt: number | null;
  /** Set once the chain first reaches the cap, for the earned Joker. */
  reachedCap: boolean;
}

export function createScore(): ScoreState {
  return { score: 0, chain: 0, multiplier: 1, lastShotAt: null, reachedCap: false };
}

export interface ShotResult {
  state: ScoreState;
  /** Points this shot earned, for the floating score. */
  gained: number;
  /** True when this shot pushed the multiplier up a step. */
  steppedUp: boolean;
  /** True on the shot that first reaches the cap (PROGRESSION.md 1.4). */
  earnedSpecial: boolean;
}

/**
 * A resolved tap. Only a colour match scores: an arrow that flies off through
 * an open or destroyed lane is a positioning move, not an achievement.
 *
 * A bomb scores as the three peels it makes at the current multiplier, and
 * advances the combo by one like any other correct shot (DESIGN.md 1.11).
 */
export function registerShot(
  state: ScoreState,
  shot: Pick<FireResult, "event" | "peels" | "destroyed">,
  now: number,
): ShotResult {
  const { event } = shot;
  if (event === "blocked" || event === "bounced") {
    return {
      state: { ...state, chain: 0, multiplier: 1, lastShotAt: now },
      gained: 0,
      steppedUp: false,
      earnedSpecial: false,
    };
  }

  if (event === "flewOff") {
    return {
      state: { ...state, lastShotAt: now },
      gained: 0,
      steppedUp: false,
      earnedSpecial: false,
    };
  }

  const hot =
    state.lastShotAt !== null && now - state.lastShotAt <= HOT_WINDOW_MS ? 2 : 1;
  const chain = state.chain + hot;
  const multiplier = multiplierFor(chain);
  const layerBonus = shot.destroyed * DESTROY_BONUS + (shot.peels - shot.destroyed);
  const gained = BASE_SHOT_SCORE * multiplier * layerBonus;

  return {
    state: {
      score: state.score + gained,
      chain,
      multiplier,
      lastShotAt: now,
      reachedCap: state.reachedCap || multiplier === MAX_MULTIPLIER,
    },
    gained,
    steppedUp: multiplier > state.multiplier,
    earnedSpecial: !state.reachedCap && multiplier === MAX_MULTIPLIER,
  };
}

/**
 * A continue does not break the chain: the player watched an ad, they did not
 * make a new mistake (PROGRESSION.md 1.3).
 */
export function levelScore(state: ScoreState, mistakes: number, timeBonus = 0): number {
  return state.score + (mistakes === 0 ? CLEAN_BONUS : 0) + timeBonus;
}
