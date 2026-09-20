import { describe, expect, it } from "vitest";
import { fire } from "@/engine/fire";
import { createState, neighbourBlocks, perimeter } from "@/engine/level";
import { blockersOf, clearRay } from "@/engine/rays";
import type { Arrow, Block, LevelDef } from "@/engine/types";
import { solve } from "@/solver";

/**
 * Each special breaks exactly one of the two rules and obeys the other
 * (DESIGN.md 1.11), so every test here names the rule it is checking.
 */

function level(parts: Partial<LevelDef> & Pick<LevelDef, "arrows" | "blocks">): LevelDef {
  return {
    id: 40,
    cols: 3,
    rows: 3,
    palette: ["r", "b", "g"],
    hearts: 4,
    par: 1,
    ...parts,
  };
}

/** An arrow that stands in another one's ray at (1,1). */
const wall: Arrow = { id: "wall", color: "r", dir: "left", path: [{ col: 1, row: 1 }] };

function shooter(special: Arrow["special"], color: string): Arrow {
  return { id: "shot", color, special, dir: "up", path: [{ col: 1, row: 2 }] };
}

function topBlock(lane: number, layers: string[]): Block {
  return { id: `t${lane}`, side: "top", start: lane, span: 1, layers };
}

describe("Joker — breaks the colour rule, obeys the ray", () => {
  it("peels a layer its own colour does not match", () => {
    const state = createState(
      level({ arrows: [shooter("joker", "r")], blocks: [topBlock(1, ["b"])] }),
    );
    const { state: after, event, peels } = fire(state, "shot");

    expect(event).toBe("destroyed");
    expect(peels).toBe(1);
    expect(after.status).toBe("won");
    expect(after.heartsLeft).toBe(state.heartsLeft);
  });

  it("still costs a heart when its ray is blocked", () => {
    const state = createState(
      level({ arrows: [shooter("joker", "r"), wall], blocks: [topBlock(1, ["b"])] }),
    );
    const { state: after, event } = fire(state, "shot");

    expect(event).toBe("blocked");
    expect(after.heartsLeft).toBe(state.heartsLeft - 1);
  });
});

describe("Ghost — breaks the ray rule, obeys the colour", () => {
  it("fires straight through another arrow", () => {
    const state = createState(
      level({ arrows: [shooter("ghost", "b"), wall], blocks: [topBlock(1, ["b"])] }),
    );
    const ghost = state.arrows[0]!;

    expect(blockersOf(state, ghost)).toEqual([]);
    // The guide draws through every obstruction to the frame (ART.md 3.2).
    expect(clearRay(state, ghost)).toHaveLength(2);

    const { state: after, event } = fire(state, "shot");
    expect(event).toBe("destroyed");
    expect(after.heartsLeft).toBe(state.heartsLeft);
  });

  it("is the only arrow whose guide does not stop at an obstruction", () => {
    const state = createState(
      level({ arrows: [shooter(undefined, "b"), wall], blocks: [topBlock(1, ["b"])] }),
    );
    // The same board, an ordinary arrow: the guide stops before the wall.
    expect(clearRay(state, state.arrows[0]!)).toEqual([]);

    // With the wall gone it runs all the way to the frame.
    const clear = createState(
      level({ arrows: [shooter(undefined, "b")], blocks: [topBlock(1, ["b"])] }),
    );
    expect(clearRay(clear, clear.arrows[0]!)).toHaveLength(2);
  });

  it("still bounces and costs a heart on the wrong colour", () => {
    const state = createState(
      level({ arrows: [shooter("ghost", "r"), wall], blocks: [topBlock(1, ["b"])] }),
    );
    const { state: after, event } = fire(state, "shot");

    expect(event).toBe("bounced");
    expect(after.heartsLeft).toBe(state.heartsLeft - 1);
    expect(after.arrows).toEqual(state.arrows);
  });
});

describe("Bomb — three colour-free peels at most", () => {
  it("peels its target and both neighbours, ignoring colour", () => {
    const state = createState(
      level({
        arrows: [shooter("bomb", "r")],
        blocks: [topBlock(0, ["b"]), topBlock(1, ["g"]), topBlock(2, ["r", "b"])],
      }),
    );
    const { state: after, event, peels, destroyed } = fire(state, "shot");

    expect(event).toBe("destroyed");
    expect(peels).toBe(3);
    expect(destroyed).toBe(2);
    // A three-layer stack still needs three hits: one bomb is never a finisher.
    expect(after.blocks).toHaveLength(1);
    expect(after.blocks[0]!.layers).toEqual(["b"]);
  });

  it("reaches a neighbour around the corner", () => {
    const state = createState(
      level({
        arrows: [{ ...shooter("bomb", "r"), path: [{ col: 0, row: 2 }] }],
        blocks: [
          topBlock(0, ["b"]),
          { id: "l0", side: "left", start: 0, span: 1, layers: ["g", "r"] },
        ],
      }),
    );
    const { state: after } = fire(state, "shot");

    expect(after.blocks).toHaveLength(1);
    expect(after.blocks[0]!.layers).toEqual(["r"]);
  });

  it("passes nothing further along when a neighbouring lane is open", () => {
    const state = createState(
      level({
        cols: 4,
        arrows: [shooter("bomb", "r")],
        // Lanes 0 and 2 are open, so the blast stops at them: a gap absorbs
        // nothing and the effect is not carried on to lane 3.
        blocks: [topBlock(1, ["g"]), topBlock(3, ["b"])],
      }),
    );
    const { peels, destroyed } = fire(state, "shot");

    expect(peels).toBe(1);
    expect(destroyed).toBe(1);
  });

  it("flies off an open lane like any other arrow", () => {
    const state = createState(
      level({ arrows: [shooter("bomb", "r")], blocks: [topBlock(0, ["b"])] }),
    );
    const { state: after, event, peels } = fire(state, "shot");

    expect(event).toBe("flewOff");
    expect(peels).toBe(0);
    // Gone for good, and the frame is untouched: no blast without an impact.
    expect(after.arrows).toHaveLength(0);
    expect(after.blocks).toEqual(state.blocks);
  });
});

describe("the frame as the bomb sees it", () => {
  it("walks every lane once, cyclically, corners included", () => {
    const board = level({ cols: 2, rows: 2, arrows: [], blocks: [] });
    expect(perimeter(board)).toEqual([
      { side: "top", lane: 0 },
      { side: "top", lane: 1 },
      { side: "right", lane: 0 },
      { side: "right", lane: 1 },
      { side: "bottom", lane: 1 },
      { side: "bottom", lane: 0 },
      { side: "left", lane: 1 },
      { side: "left", lane: 0 },
    ]);
  });

  it("has no neighbours for a block that is not on the frame at all", () => {
    const off: Block = { id: "off", side: "top", start: 9, span: 1, layers: ["r"] };
    const board = level({ arrows: [], blocks: [off] });

    expect(neighbourBlocks(board, board.blocks, off)).toEqual([]);
  });

  it("gives a wide block the blocks either end of its span", () => {
    const wide: Block = { id: "wide", side: "top", start: 0, span: 3, layers: ["r"] };
    const right: Block = { id: "r0", side: "right", start: 0, span: 1, layers: ["r"] };
    const board = level({ arrows: [], blocks: [wide, right] });

    expect(neighbourBlocks(board, board.blocks, wide).map((block) => block.id)).toEqual([
      "r0",
    ]);
  });
});

describe("the solver plays the specials by the same rules", () => {
  it("lets a bomb blast into a lane whose block is already gone", () => {
    const board = level({
      arrows: [
        shooter("bomb", "r"),
        // Its body sits in the bomb's ray, so it has to fire first — and it
        // destroys the block on one of the bomb's two neighbouring lanes.
        {
          id: "blue",
          color: "b",
          dir: "up",
          path: [
            { col: 1, row: 1 },
            { col: 0, row: 1 },
            { col: 0, row: 0 },
          ],
        },
      ],
      blocks: [topBlock(0, ["b"]), topBlock(1, ["g"]), topBlock(2, ["r"])],
    });
    const result = solve(createState(board), { countSolutionsUpTo: 4 });

    expect(result.witness).toEqual(["blue", "shot"]);
    // The destroyed neighbour absorbs nothing; the live one still loses a layer.
    expect(result.solutionCount).toBe(1);
  });

  it("finds the bomb solution and reports its true par", () => {
    const board = level({
      arrows: [shooter("bomb", "r")],
      blocks: [topBlock(0, ["b"]), topBlock(1, ["g"]), topBlock(2, ["r"])],
    });
    const result = solve(createState(board), { countSolutionsUpTo: 4 });

    expect(result.solvable).toBe(true);
    expect(result.par).toBe(1);
    expect(result.witness).toEqual(["shot"]);
  });

  it("stops a bomb at a gap in the frame", () => {
    const board = level({
      cols: 4,
      arrows: [shooter("bomb", "r")],
      blocks: [topBlock(1, ["g"]), topBlock(3, ["b"])],
    });
    const result = solve(createState(board));

    // Lane 0 and lane 2 are open, so the bomb only ever reaches its own lane
    // and lane 3 is out of reach entirely.
    expect(result.solvable).toBe(false);
  });

  it("lets a Joker take any layer and a Ghost ignore the tangle", () => {
    const board = level({
      arrows: [shooter("joker", "r"), { ...wall, id: "ghost", special: "ghost" }],
      blocks: [
        topBlock(1, ["b"]),
        { id: "l1", side: "left", start: 1, span: 1, layers: ["r"] },
      ],
    });
    const result = solve(createState(board));

    expect(result.solvable).toBe(true);
    expect(result.par).toBe(2);
    // The Ghost never has to wait for the Joker to leave.
    expect(result.witness).toContain("ghost");
  });
});

describe("the forgiving tutorial levels", () => {
  it("shows the mistake without charging for it", () => {
    const board = level({
      id: 2,
      forgiving: true,
      arrows: [shooter(undefined, "r"), wall],
      blocks: [topBlock(1, ["r"])],
    });
    const state = createState(board);
    const { state: after, event } = fire(state, "shot");

    expect(event).toBe("blocked");
    expect(after.heartsLeft).toBe(state.heartsLeft);
    expect(after.mistakes).toBe(0);
  });
});
