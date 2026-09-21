import { describe, expect, it } from "vitest";
import { BEATS, beatFor } from "@/game/tutorial";
import type { Beat } from "@/game/tutorial";
import { LEVELS } from "@/levels";
import { t } from "@/ui/strings";

describe("the tutorial beats", () => {
  it("teaches one idea at a time, on the levels DESIGN.md names", () => {
    expect(BEATS.map((beat) => beat.level)).toEqual([
      1, 2, 3, 5, 8, 20, 31, 35, 38, 42, 50, 55,
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
    expect(line(beatFor(3, "bounced"))).toMatch(/bounces/);
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
