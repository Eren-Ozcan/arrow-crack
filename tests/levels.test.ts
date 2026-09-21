import { describe, expect, it } from "vitest";
import { validateLevel } from "@/engine/level";
import { LEVELS, levelById, nextLevelId } from "@/levels";
import { parseLevel, parseMask } from "@/levels/parse";

describe("the bundled levels", () => {
  it("runs from 1 with no gaps", () => {
    expect(LEVELS.map((level) => level.id)).toEqual(
      Array.from({ length: LEVELS.length }, (_, index) => index + 1),
    );
    expect(nextLevelId(1)).toBe(2);
    expect(nextLevelId(LEVELS.length)).toBeNull();
    expect(levelById(20)?.hearts).toBe(1);
  });

  it("is structurally valid before the solver is asked anything", () => {
    for (const level of LEVELS) {
      expect(validateLevel(level), `level ${level.id}`).toEqual([]);
    }
  });
});

describe("the mask authoring format", () => {
  it("expands a character grid into playable cells", () => {
    expect(parseMask([".#", "##"], 2, 2)).toEqual([
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ]);
  });

  it("refuses a grid that does not describe the board", () => {
    expect(() => parseMask(["##"], 2, 2)).toThrow(/mask has 1 rows/);
    expect(() => parseMask(["###", "###"], 2, 2)).toThrow(/mask row 0 has 3 cells/);
    expect(() => parseMask(["..", ".."], 2, 2)).toThrow(/no playable cells/);
  });

  it("leaves a rectangular level alone", () => {
    const level = parseLevel({
      id: 40,
      cols: 1,
      rows: 1,
      palette: ["r"],
      hearts: 4,
      par: 1,
      arrows: [],
      blocks: [],
    });
    expect(level.mask).toBeUndefined();
  });

  it("carries the shaped level's silhouette onto the board", () => {
    const shaped = levelById(20)!;
    expect(shaped.mask).toBeDefined();
    // Every arrow lives inside the silhouette; the validator enforces it too.
    const inside = new Set(shaped.mask!.map((cell) => `${cell.col},${cell.row}`));
    for (const arrow of shaped.arrows) {
      for (const cell of arrow.path)
        expect(inside.has(`${cell.col},${cell.row}`)).toBe(true);
    }
  });
});
