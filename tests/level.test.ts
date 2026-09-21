import { describe, expect, it } from "vitest";
import {
  blockForArrow,
  cellKey,
  createState,
  headOf,
  laneOf,
  sideOf,
  step,
  validateLevel,
} from "@/engine/level";
import type { Arrow, LevelDef } from "@/engine/types";
import { ordered, singleShot, wideAndBent } from "./fixtures/levels";

function level(overrides: Partial<LevelDef> = {}): LevelDef {
  return { ...structuredClone(singleShot.level), ...overrides };
}

describe("lane resolution", () => {
  it("uses the head's column when the arrow faces up or down", () => {
    const arrow: Arrow = {
      id: "a",
      color: "v",
      dir: "up",
      path: [
        { col: 3, row: 3 },
        { col: 2, row: 3 },
        { col: 2, row: 2 },
      ],
    };
    expect(laneOf(arrow)).toBe(2);
    expect(sideOf(arrow.dir)).toBe("top");
  });

  it("uses the head's row when the arrow faces left or right", () => {
    const arrow: Arrow = {
      id: "a",
      color: "v",
      dir: "right",
      path: [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ],
    };
    expect(laneOf(arrow)).toBe(1);
    expect(sideOf(arrow.dir)).toBe("right");
  });

  it("steps one cell in every direction", () => {
    const cell = { col: 2, row: 2 };
    expect(step(cell, "up")).toEqual({ col: 2, row: 1 });
    expect(step(cell, "down")).toEqual({ col: 2, row: 3 });
    expect(step(cell, "left")).toEqual({ col: 1, row: 2 });
    expect(step(cell, "right")).toEqual({ col: 3, row: 2 });
  });

  it("maps every head direction to its frame side", () => {
    expect(sideOf("up")).toBe("top");
    expect(sideOf("down")).toBe("bottom");
    expect(sideOf("left")).toBe("left");
    expect(sideOf("right")).toBe("right");
  });

  it("targets a wide block from every lane it covers", () => {
    const blocks = wideAndBent.level.blocks;
    const laneZero: Arrow = {
      id: "z",
      color: "g",
      dir: "up",
      path: [{ col: 0, row: 3 }],
    };
    const laneOne: Arrow = { id: "o", color: "g", dir: "up", path: [{ col: 1, row: 3 }] };
    const laneTwo: Arrow = { id: "t", color: "g", dir: "up", path: [{ col: 2, row: 3 }] };

    expect(blockForArrow(blocks, laneZero)?.id).toBe("wide");
    expect(blockForArrow(blocks, laneOne)?.id).toBe("wide");
    expect(blockForArrow(blocks, laneTwo)).toBeUndefined();
  });
});

describe("validateLevel", () => {
  it("accepts the fixtures", () => {
    for (const fixture of [singleShot, ordered, wideAndBent]) {
      expect(validateLevel(fixture.level)).toEqual([]);
    }
  });

  it("rejects a disconnected path", () => {
    const broken = level({
      arrows: [
        {
          id: "a1",
          color: "v",
          dir: "up",
          path: [
            { col: 0, row: 2 },
            { col: 1, row: 1 },
          ],
        },
      ],
    });
    expect(validateLevel(broken).join()).toMatch(/disconnected/);
  });

  it("rejects a self-crossing path", () => {
    const crossing = level({
      cols: 3,
      rows: 3,
      arrows: [
        {
          id: "a1",
          color: "v",
          dir: "up",
          path: [
            { col: 1, row: 1 },
            { col: 1, row: 2 },
            { col: 1, row: 1 },
          ],
        },
      ],
    });
    expect(validateLevel(crossing).join()).toMatch(/crosses itself/);
  });

  it("reports every direction a final segment can run", () => {
    const facing = (
      dir: "up" | "down" | "left" | "right",
      tail: { col: number; row: number },
    ) =>
      validateLevel(
        level({
          arrows: [{ id: "a1", color: "v", dir, path: [tail, { col: 1, row: 1 }] }],
        }),
      ).join();

    expect(facing("left", { col: 1, row: 2 })).toMatch(/final segment runs up/);
    expect(facing("left", { col: 1, row: 0 })).toMatch(/final segment runs down/);
    expect(facing("up", { col: 2, row: 1 })).toMatch(/final segment runs left/);
    expect(facing("up", { col: 0, row: 1 })).toMatch(/final segment runs right/);
  });

  it("rejects a level with no blocks", () => {
    expect(validateLevel(level({ blocks: [] })).join()).toMatch(/level has no blocks/);
  });

  it("rejects a head direction that disagrees with the final segment", () => {
    const wrongHead = level({
      arrows: [
        {
          id: "a1",
          color: "v",
          dir: "left",
          path: [
            { col: 1, row: 2 },
            { col: 1, row: 1 },
          ],
        },
      ],
    });
    expect(validateLevel(wrongHead).join()).toMatch(/final segment runs up/);
  });

  it("rejects overlapping arrows and off-board cells", () => {
    const overlapping = level({
      arrows: [
        { id: "a1", color: "v", dir: "up", path: [{ col: 1, row: 1 }] },
        { id: "a2", color: "v", dir: "up", path: [{ col: 1, row: 1 }] },
      ],
    });
    expect(overlapping.arrows).toHaveLength(2);
    expect(validateLevel(overlapping).join()).toMatch(/overlap/);

    const offBoard = level({
      arrows: [{ id: "a1", color: "v", dir: "up", path: [{ col: 9, row: 1 }] }],
    });
    expect(validateLevel(offBoard).join()).toMatch(/leaves the board/);
  });

  it("rejects an arrow outside the mask", () => {
    const masked = level({
      mask: [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
      ],
    });
    expect(validateLevel(masked).join()).toMatch(/outside the mask/);
  });

  it("accepts an arrow inside the mask", () => {
    const masked = level({
      mask: [
        { col: 1, row: 1 },
        { col: 1, row: 2 },
      ],
    });
    expect(validateLevel(masked)).toEqual([]);
  });

  it("rejects blocks that leave the side or share a lane", () => {
    const offSide = level({
      blocks: [{ id: "b1", side: "top", start: 2, span: 2, layers: ["v"] }],
    });
    expect(validateLevel(offSide).join()).toMatch(/outside the top side/);

    const shared = level({
      blocks: [
        { id: "b1", side: "top", start: 0, span: 2, layers: ["v"] },
        { id: "b2", side: "top", start: 1, span: 1, layers: ["v"] },
      ],
    });
    expect(validateLevel(shared).join()).toMatch(/both cover top:1/);
  });

  it("rejects a mask cell off the board", () => {
    const masked = level({
      mask: [
        { col: 1, row: 1 },
        { col: 1, row: 2 },
        { col: 9, row: 9 },
      ],
    });
    expect(validateLevel(masked).join()).toMatch(/mask cell 9,9 is off the board/);
  });

  it("rejects duplicate ids, a span below 1, and a board with no cells", () => {
    const duplicateArrows = level({
      arrows: [
        { id: "a1", color: "v", dir: "up", path: [{ col: 0, row: 0 }] },
        { id: "a1", color: "v", dir: "up", path: [{ col: 2, row: 2 }] },
      ],
    });
    expect(validateLevel(duplicateArrows).join()).toMatch(/duplicate arrow id a1/);

    const duplicateBlocks = level({
      blocks: [
        { id: "b1", side: "top", start: 0, span: 1, layers: ["v"] },
        { id: "b1", side: "top", start: 1, span: 1, layers: ["v"] },
      ],
    });
    expect(validateLevel(duplicateBlocks).join()).toMatch(/duplicate block id b1/);

    const noSpan = level({
      blocks: [{ id: "b1", side: "top", start: 1, span: 0, layers: ["v"] }],
    });
    expect(validateLevel(noSpan).join()).toMatch(/span below 1/);

    const empty = level({ cols: 0, rows: 0, arrows: [] });
    expect(validateLevel(empty).join()).toMatch(/at least 1x1/);
  });

  it("rejects no hearts and an empty palette", () => {
    expect(validateLevel(level({ hearts: 0 })).join()).toMatch(
      /hearts must be at least 1/,
    );
    expect(validateLevel(level({ palette: [] })).join()).toMatch(/palette is empty/);
  });

  it("rejects an empty path without also reporting its shape", () => {
    const errors = validateLevel(
      level({ arrows: [{ id: "a1", color: "v", dir: "up", path: [] }] }),
    );
    expect(errors).toEqual(["arrow a1 has an empty path"]);
  });

  it("rejects colours outside the palette and empty layer stacks", () => {
    const offPalette = level({
      arrows: [{ id: "a1", color: "x", dir: "up", path: [{ col: 1, row: 1 }] }],
    });
    expect(validateLevel(offPalette).join()).toMatch(/not in the palette/);

    const noLayers = level({
      blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: [] }],
    });
    expect(validateLevel(noLayers).join()).toMatch(/no layers/);

    const offPaletteLayer = level({
      blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["x"] }],
    });
    expect(validateLevel(offPaletteLayer).join()).toMatch(/layer x, not in the palette/);
  });

  it("rejects a timed level with no clock, and a clock on an untimed level", () => {
    expect(validateLevel(level({ type: "timed" })).join()).toMatch(/no timeLimitMs/);
    expect(validateLevel(level({ timeLimitMs: 1000 })).join()).toMatch(
      /non-timed level has a timeLimitMs/,
    );
  });
});

describe("headOf", () => {
  it("refuses an arrow with no cells", () => {
    expect(() => headOf({ id: "a1", color: "v", dir: "up", path: [] })).toThrow(
      /empty path/,
    );
  });
});

describe("createState", () => {
  it("fills hearts and indexes every occupied cell", () => {
    const state = createState(ordered.level);
    expect(state.heartsLeft).toBe(ordered.level.hearts);
    expect(state.mistakes).toBe(0);
    expect(state.status).toBe("playing");
    expect(state.occupancy.get(cellKey({ col: 1, row: 0 }))).toBe("red");
    expect(state.occupancy.get(cellKey({ col: 1, row: 2 }))).toBe("blue");
    expect(state.occupancy.size).toBe(3);
  });

  it("throws on an invalid level", () => {
    const broken = level({
      arrows: [{ id: "a1", color: "v", dir: "up", path: [] }],
    });
    expect(() => createState(broken)).toThrow(/invalid/);
  });
});
