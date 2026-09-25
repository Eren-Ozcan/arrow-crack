import { describe, expect, it } from "vitest";
import type { LevelDef } from "@/engine/types";
import { allLevels } from "@/levels";
import { bandFor, checkBand, FIRST_GENERATED_LEVEL, measure } from "../tools/difficulty";
import { checkCurve, checkIds, checkSpacing } from "../tools/validate-levels";
import { ordered, singleShot } from "./fixtures/levels";

const LEVELS = allLevels();

describe("the difficulty model", () => {
  it("reads the forced order off the board", () => {
    // `ordered` is two layers on one block, and the arrow that peels the lower
    // one is blocked until the other has left: a chain of two.
    const metrics = measure(ordered.level)!;
    expect(metrics.forcedOrderDepth).toBe(2);
    expect(metrics.par).toBe(2);
  });

  it("counts a tap that costs a heart, and only that", () => {
    // One arrow, one matching block, nothing in the way: no trap anywhere.
    expect(measure(singleShot.level)!.trapRatio).toBe(0);

    // In `ordered` the blocked arrow is a trap on the opening board.
    const metrics = measure(ordered.level)!;
    expect(metrics.trapRatio).toBeGreaterThan(0);
    expect(metrics.trapRatio).toBeLessThanOrEqual(1);
  });

  it("aims a higher band at a later level", () => {
    const early = bandFor(FIRST_GENERATED_LEVEL);
    const late = bandFor(80);
    expect(late.score.min).toBeGreaterThan(early.score.min);
    expect(late.trapRatio.min).toBeGreaterThan(early.trapRatio.min);
    expect(late.fanOut.max).toBeLessThan(early.fanOut.max);
  });

  it("reads the level's last digit: 0 very hard, 3 and 7 hard, 1 a breather", () => {
    // DESIGN.md 2: the rhythm a player learns to read.
    const at = (id: number): number => bandFor(id).score.min;
    for (const ten of [100, 500, 1500]) {
      expect(at(ten + 10), `${ten + 10}`).toBeGreaterThan(at(ten + 7));
      expect(at(ten + 7), `${ten + 7}`).toBeGreaterThan(at(ten + 5));
      expect(at(ten + 3), `${ten + 3}`).toBeGreaterThan(at(ten + 4));
      expect(at(ten + 1), `${ten + 1}`).toBeLessThan(at(ten + 2));
    }
  });

  it("leaves the hand-authored teaching curve alone", () => {
    const metrics = measure(singleShot.level)!;
    expect(checkBand(singleShot.level, metrics)).toEqual([]);
    expect(
      checkBand({ ...singleShot.level, id: 70 } as LevelDef, metrics).length,
    ).toBeGreaterThan(0);
  });
});

describe("the bundle checks", () => {
  it("passes the shipped bundle", () => {
    const files = LEVELS.map((level) => ({ file: `${level.id}.json`, level }));
    expect(checkIds(files)).toEqual([]);
    expect(checkSpacing(LEVELS)).toEqual([]);
  });

  it("catches a gap in the level sequence", () => {
    const files = [1, 2, 4].map((id) => ({
      file: `${id}.json`,
      level: { ...ordered.level, id },
    }));
    expect(checkIds(files).join()).toMatch(/leaves a gap/);
  });

  it("catches a timed level next to a one-heart level", () => {
    const levels: LevelDef[] = [
      { ...ordered.level, id: 40, hearts: 1 },
      { ...ordered.level, id: 41, type: "timed", timeLimitMs: 45_000 },
    ];
    expect(checkSpacing(levels).join()).toMatch(/sits next to one-heart level 40/);
  });

  it("catches a curve that dips over a ten-level window", () => {
    const rising = new Map<number, number>();
    for (let id = 31; id <= 50; id += 1) rising.set(id, id / 100);
    expect(checkCurve(rising)).toEqual([]);

    const dipping = new Map(rising);
    for (let id = 41; id <= 50; id += 1) dipping.set(id, 0.1);
    expect(checkCurve(dipping).join()).toMatch(/difficulty curve dips/);
  });
});
