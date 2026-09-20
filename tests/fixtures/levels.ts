import type { LevelDef } from "@/engine/types";

/**
 * Hand-written fixtures. Each is solvable by a scripted tap sequence with no
 * mistakes; `solves` is that sequence.
 */
export interface Fixture {
  level: LevelDef;
  solves: string[];
}

/** One arrow, one block: the first teaching beat. */
export const singleShot: Fixture = {
  level: {
    id: 11,
    cols: 3,
    rows: 3,
    palette: ["r"],
    hearts: 4,
    par: 1,
    arrows: [
      {
        id: "a1",
        color: "r",
        dir: "up",
        path: [
          { col: 1, row: 2 },
          { col: 1, row: 1 },
        ],
      },
    ],
    blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["r"] }],
  },
  solves: ["a1"],
};

/** Two layers on one block, and an arrow that is blocked until the other leaves. */
export const ordered: Fixture = {
  level: {
    id: 12,
    cols: 3,
    rows: 3,
    palette: ["r", "b"],
    hearts: 4,
    par: 2,
    arrows: [
      {
        id: "red",
        color: "r",
        dir: "up",
        path: [
          { col: 1, row: 1 },
          { col: 1, row: 0 },
        ],
      },
      { id: "blue", color: "b", dir: "up", path: [{ col: 1, row: 2 }] },
    ],
    blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["r", "b"] }],
  },
  solves: ["red", "blue"],
};

/** A wide block, a bent body, and an arrow with no block on its lane. */
export const wideAndBent: Fixture = {
  level: {
    id: 13,
    cols: 4,
    rows: 4,
    palette: ["g", "r"],
    hearts: 4,
    par: 1,
    arrows: [
      {
        id: "bent",
        color: "g",
        dir: "up",
        path: [
          { col: 2, row: 2 },
          { col: 1, row: 2 },
          { col: 1, row: 1 },
        ],
      },
      { id: "loose", color: "r", dir: "right", path: [{ col: 3, row: 3 }] },
    ],
    blocks: [{ id: "wide", side: "top", start: 0, span: 2, layers: ["g"] }],
  },
  solves: ["bent"],
};

export const fixtures: Fixture[] = [singleShot, ordered, wideAndBent];
