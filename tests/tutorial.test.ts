import { describe, expect, it } from "vitest";
import { BEATS, beatFor } from "@/game/tutorial";
import { LEVELS } from "@/levels";

describe("the tutorial beats", () => {
  it("teaches one idea at a time, on the levels DESIGN.md names", () => {
    expect(BEATS.map((beat) => beat.level)).toEqual([
      1, 2, 3, 5, 8, 20, 31, 35, 42, 50, 55,
    ]);
    // Every beat is a single line; a text wall is what these replace.
    for (const beat of BEATS) expect(beat.text).not.toMatch(/\n/);
  });

  it("answers the mistake it teaches, not the level opening", () => {
    expect(beatFor(2, "start")).toBeNull();
    expect(beatFor(2, "blocked")?.text).toMatch(/costs a heart/);
    expect(beatFor(3, "bounced")?.text).toMatch(/bounces/);
  });

  it("only charges for a mistake once the tutorial has taught it", () => {
    for (const level of LEVELS) {
      expect(level.forgiving ?? false, `level ${level.id}`).toBe(level.id <= 3);
    }
  });

  it("warns before every one-heart level, and there are some", () => {
    const oneHeart = LEVELS.filter((level) => level.hearts === 1);
    expect(oneHeart.map((level) => level.id)).toEqual([20, 30]);
    // Level 20 is the first, and it is announced by its own beat.
    expect(beatFor(20, "start")?.text).toMatch(/One heart/);
  });
});
