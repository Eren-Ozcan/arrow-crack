import { describe, expect, it } from "vitest";
import { fire } from "@/engine/fire";
import { createState } from "@/engine/level";
import type { GameState } from "@/engine/types";
import { BEATS, beatFor } from "@/game/tutorial";
import type { Beat } from "@/game/tutorial";
import { LEVELS, levelById } from "@/levels";
import { t } from "@/ui/strings";

describe("the tutorial beats", () => {
  it("teaches one idea at a time, on the levels DESIGN.md names", () => {
    expect(BEATS.map((beat) => beat.level)).toEqual([
      1, 2, 5, 8, 20, 31, 32, 35, 38, 42, 50, 55,
    ]);
    // Every beat names a string that exists and is a single line; a text
    // wall is what these replace.
    for (const beat of BEATS) {
      expect(t(beat.key), beat.key).not.toBe(beat.key);
      expect(t(beat.key)).not.toMatch(/\n/);
    }
  });

  it("answers the mistake it teaches, not the level opening", () => {
    expect(beatFor(2, "start")).toBeNull();
    expect(line(beatFor(2, "blocked"))).toMatch(/costs a heart/);
    expect(line(beatFor(32, "bounced"))).toMatch(/bounced/);
  });

  it("teaches each mistake on a level where the player can make it", () => {
    // A beat that answers a mistake is dead content unless that mistake is
    // reachable on its own level. The colour mismatch was taught at level 3
    // for a while, where it is impossible: a block fed by one lane peels in
    // the order its arrows already stand in, so the only wrong tap there is
    // a blocked one.
    for (const beat of BEATS) {
      if (beat.when === "start") continue;
      const level = levelById(beat.level);
      expect(level, `level ${beat.level}`).toBeDefined();
      expect(reachable(createState(level!), beat.when, 4), beat.key).toBe(true);
    }
  });

  it("keeps the colour mismatch out of reach of the single-lane levels", () => {
    // The fact the beat placement rests on, asserted where it is cheap: a
    // mismatch needs a stack more than one lane feeds (DESIGN.md 2).
    for (const id of [1, 2, 3, 4, 5, 20, 30]) {
      expect(reachable(createState(levelById(id)!), "bounced", 4), `level ${id}`).toBe(
        false,
      );
    }
  });

  it("only charges for a mistake once the tutorial has taught it", () => {
    for (const level of LEVELS) {
      expect(level.forgiving ?? false, `level ${level.id}`).toBe(level.id <= 3);
    }
  });

  it("warns before every one-heart level, and there are some", () => {
    const oneHeart = LEVELS.filter((level) => level.hearts === 1);
    // Roughly every tenth level from 20 on (DESIGN.md 1.5).
    expect(oneHeart.map((level) => level.id)).toEqual([20, 30, 40, 50, 60, 70, 80]);
    // Level 20 is the first, and it is announced by its own beat.
    expect(line(beatFor(20, "start"))).toMatch(/One heart/);
  });
});

function line(beat: Beat | null): string {
  return beat === null ? "" : t(beat.key);
}

/** Whether a given fire event can happen at all within a few taps. */
function reachable(start: GameState, event: string, depth: number): boolean {
  const queue: { state: GameState; depth: number }[] = [{ state: start, depth: 0 }];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const { state, depth: taken } = queue.shift()!;
    for (const arrow of state.arrows) {
      const result = fire(state, arrow.id);
      if (result.event === event) return true;
      if (taken + 1 >= depth || result.event === "blocked") continue;

      const key = result.state.blocks
        .map((block) => `${block.id}:${block.layers.join("")}`)
        .join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      if (result.state.status === "playing") {
        queue.push({ state: result.state, depth: taken + 1 });
      }
    }
  }
  return false;
}
