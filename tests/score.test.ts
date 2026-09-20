import { describe, expect, it } from "vitest";
import {
  BASE_SHOT_SCORE,
  CLEAN_BONUS,
  createScore,
  HOT_WINDOW_MS,
  levelScore,
  multiplierFor,
  registerShot,
} from "@/game/score";
import type { ScoreState } from "@/game/score";
import type { FireEvent, FireResult } from "@/engine/types";

/** A resolved shot as the engine reports it (DESIGN.md 3). */
function shot(
  event: FireEvent,
  peels = 1,
  destroyed = 0,
): Pick<FireResult, "event" | "peels" | "destroyed"> {
  const scoring = event === "peeled" || event === "destroyed";
  return { event, peels: scoring ? peels : 0, destroyed };
}

function chain(shots: number, gapMs: number): ScoreState {
  let state = createScore();
  for (let index = 0; index < shots; index += 1) {
    state = registerShot(state, shot("peeled"), index * gapMs).state;
  }
  return state;
}

describe("combo multiplier", () => {
  it("climbs on the documented chain lengths", () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(2)).toBe(1);
    expect(multiplierFor(3)).toBe(2);
    expect(multiplierFor(5)).toBe(3);
    expect(multiplierFor(8)).toBe(4);
    expect(multiplierFor(12)).toBe(5);
    expect(multiplierFor(40)).toBe(5);
  });

  it("advances by two inside the hot window and one outside it", () => {
    const hot = chain(3, HOT_WINDOW_MS - 1);
    const cold = chain(3, HOT_WINDOW_MS + 1);

    expect(hot.chain).toBe(5);
    expect(cold.chain).toBe(3);
  });

  it("resets to x1 on a mistake, and only on a mistake", () => {
    const hot = chain(6, 100);
    expect(hot.multiplier).toBeGreaterThan(1);

    for (const mistake of ["blocked", "bounced"] as const) {
      const after = registerShot(hot, shot(mistake), 1000).state;
      expect(after.chain).toBe(0);
      expect(after.multiplier).toBe(1);
      expect(after.score).toBe(hot.score);
    }
  });

  it("neither scores nor breaks the chain when an arrow flies off", () => {
    const hot = chain(4, 100);
    const after = registerShot(hot, shot("flewOff"), 500);

    expect(after.gained).toBe(0);
    expect(after.state.chain).toBe(hot.chain);
    expect(after.state.multiplier).toBe(hot.multiplier);
  });
});

describe("score", () => {
  it("pays the base rate on the first shot", () => {
    const first = registerShot(createScore(), shot("peeled"), 0);
    expect(first.gained).toBe(BASE_SHOT_SCORE);
    expect(first.steppedUp).toBe(false);
  });

  it("pays more for the layer that destroys a block", () => {
    const peel = registerShot(createScore(), shot("peeled"), 0);
    const destroy = registerShot(createScore(), shot("destroyed", 1, 1), 0);
    expect(destroy.gained).toBe(peel.gained * 1.5);
  });

  it("reports the shot that steps the multiplier up", () => {
    let state = createScore();
    state = registerShot(state, shot("peeled"), 0).state;
    state = registerShot(state, shot("peeled"), 100).state;

    // The third correct shot in the hot window puts the chain past 3.
    expect(state.multiplier).toBe(2);
    expect(registerShot(state, shot("peeled"), 200).steppedUp).toBe(true);
  });

  it("earns one special at the cap, once per attempt", () => {
    let state = createScore();
    let earned = 0;

    for (let index = 0; index < 12; index += 1) {
      const result = registerShot(state, shot("peeled"), index * 100);
      state = result.state;
      if (result.earnedSpecial) earned += 1;
    }

    expect(state.multiplier).toBe(5);
    expect(earned).toBe(1);
  });

  it("adds the clean bonus only for a level finished without a mistake", () => {
    const state = chain(3, 100);
    expect(levelScore(state, 0)).toBe(state.score + CLEAN_BONUS);
    expect(levelScore(state, 1)).toBe(state.score);
    expect(levelScore(state, 0, 250)).toBe(state.score + CLEAN_BONUS + 250);
  });
});
