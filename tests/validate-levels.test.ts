import { describe, expect, it } from "vitest";
import type { LevelDef } from "@/engine/types";
import { validate } from "../tools/validate";
import { ordered, singleShot, wideAndBent } from "./fixtures/levels";

function level(overrides: Partial<LevelDef> = {}): LevelDef {
  return { ...structuredClone(ordered.level), ...overrides };
}

describe("the level gate", () => {
  it("passes the fixtures", () => {
    for (const fixture of [singleShot, ordered, wideAndBent]) {
      expect(validate(fixture.level), `level ${fixture.level.id}`).toEqual([]);
    }
  });

  it("rejects a level nobody can finish", () => {
    const unsolvable = level({
      blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["b", "r"] }],
    });
    expect(validate(unsolvable)).toContain("no solution exists");
  });

  it("rejects a stored par the solver disagrees with", () => {
    expect(validate(level({ par: 5 })).join()).toMatch(
      /stored par is 5; the solver says 2/,
    );
  });

  it("rejects a block on a lane no arrow can reach", () => {
    const unhittable = level({
      blocks: [
        { id: "b1", side: "top", start: 1, span: 1, layers: ["r", "b"] },
        { id: "b2", side: "left", start: 0, span: 1, layers: ["r"] },
      ],
    });
    expect(validate(unhittable).join()).toMatch(
      /block b2 sits on a lane no arrow can reach/,
    );
  });

  it("holds hearts to the band table, or to one", () => {
    expect(validate(level({ hearts: 2 })).join()).toMatch(/wants 4, or 1/);
    expect(validate(level({ hearts: 1 }))).toEqual([]);
    expect(validate(level({ id: 60, hearts: 4 })).join()).toMatch(/wants 3, or 1/);
    expect(validate(level({ id: 60, hearts: 3 }))).toEqual([]);
  });

  it("rejects a timed level whose clock is too short for its par", () => {
    expect(validate(level({ type: "timed", timeLimitMs: 1000 })).join()).toMatch(
      /allows 1000 ms for a par of 2/,
    );
    expect(validate(level({ type: "timed", timeLimitMs: 30_000 }))).toEqual([]);
  });

  it("reports structural problems without running the solver", () => {
    const broken = level({
      arrows: [{ id: "red", color: "r", dir: "up", path: [{ col: 9, row: 9 }] }],
    });
    const problems = validate(broken);

    expect(problems.join()).toMatch(/leaves the board/);
    expect(problems.join()).not.toMatch(/solution/);
  });
});
