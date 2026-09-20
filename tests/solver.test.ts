import { describe, expect, it } from "vitest";
import { fire } from "@/engine/fire";
import { createState } from "@/engine/level";
import type { GameState, LevelDef } from "@/engine/types";
import { BUDGETS, isSolvable, nextMove, solve } from "@/solver";
import { legalMoves, packBoard, initialSearchState } from "@/solver/board";
import { buildLevel } from "./fixtures/build";
import { fixtures, ordered, singleShot, wideAndBent } from "./fixtures/levels";

function play(state: GameState, ...arrowIds: string[]): GameState {
  return arrowIds.reduce((current, id) => fire(current, id).state, state);
}

describe("legal moves", () => {
  it("offers only shots that are possible and correct", () => {
    const board = packBoard(createState(ordered.level));
    const moves = legalMoves(board, initialSearchState(board));

    // "blue" is blocked by "red", so it is not a move at all; a bouncing tap
    // would change nothing and cost a life, so it is never one either.
    expect(moves.map((arrow) => board.arrowIds[arrow])).toEqual(["red"]);
  });

  it("treats an arrow with no block on its lane as a legal free move", () => {
    const board = packBoard(createState(wideAndBent.level));
    const moves = legalMoves(board, initialSearchState(board));

    expect(moves.map((arrow) => board.arrowIds[arrow]).sort()).toEqual(["bent", "loose"]);
  });
});

describe("solve", () => {
  it("returns the fixtures' par and a witness that wins", () => {
    for (const fixture of fixtures) {
      const start = createState(fixture.level);
      const result = solve(start, { countSolutionsUpTo: 100 });

      expect(result.solvable, `level ${fixture.level.id}`).toBe(true);
      expect(result.exhausted).toBe(true);
      expect(result.par).toBe(fixture.level.par);
      expect(result.solutionCount).toBeGreaterThan(0);

      const won = play(start, ...(result.witness ?? []));
      expect(won.status).toBe("won");
      expect(won.mistakes).toBe(0);
    }
  });

  it("finds the shortest solution, not the first one", () => {
    // "waste" flies off a lane with no block: legal, free, and never useful.
    const detour: LevelDef = {
      id: 20,
      cols: 3,
      rows: 3,
      palette: ["r"],
      hearts: 4,
      par: 1,
      arrows: [
        { id: "hit", color: "r", dir: "up", path: [{ col: 1, row: 1 }] },
        { id: "waste", color: "r", dir: "down", path: [{ col: 2, row: 2 }] },
      ],
      blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["r"] }],
    };

    const result = solve(createState(detour));
    expect(result.par).toBe(1);
    expect(result.witness).toEqual(["hit"]);
  });

  it("orders moves around a layer stack", () => {
    const result = solve(createState(ordered.level));
    expect(result.witness).toEqual(["red", "blue"]);
  });

  it("counts distinct optimal solutions", () => {
    // Two interchangeable arrows for a two-layer block: both orders work.
    const twoWays: LevelDef = {
      id: 21,
      cols: 3,
      rows: 3,
      palette: ["r"],
      hearts: 4,
      par: 2,
      arrows: [
        { id: "left", color: "r", dir: "up", path: [{ col: 0, row: 2 }] },
        { id: "right", color: "r", dir: "up", path: [{ col: 2, row: 2 }] },
      ],
      blocks: [{ id: "wide", side: "top", start: 0, span: 3, layers: ["r", "r"] }],
    };

    const result = solve(createState(twoWays), { countSolutionsUpTo: 100 });
    expect(result.par).toBe(2);
    expect(result.solutionCount).toBe(2);
  });

  it("does not count a solution that wastes a move", () => {
    // "loose" flies off a lane with no block: legal, but it can never be part
    // of an optimal solution, so the count stays at the single real one.
    const result = solve(createState(wideAndBent.level), { countSolutionsUpTo: 100 });
    expect(result.par).toBe(1);
    expect(result.solutionCount).toBe(1);
  });

  it("stops counting solutions at the cap", () => {
    const result = solve(createState(ordered.level), { countSolutionsUpTo: 0 });
    expect(result.solutionCount).toBe(0);
  });

  it("reports an unsolvable board", () => {
    const unreachable: LevelDef = {
      id: 22,
      cols: 3,
      rows: 3,
      palette: ["r", "b"],
      hearts: 4,
      par: 1,
      arrows: [{ id: "a1", color: "r", dir: "up", path: [{ col: 1, row: 1 }] }],
      blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["b"] }],
    };

    const result = solve(createState(unreachable));
    expect(result.solvable).toBe(false);
    expect(result.par).toBeNull();
    expect(result.witness).toBeNull();
    expect(result.exhausted).toBe(true);
  });

  it("keeps a board solvable when an arrow is spent on its own block", () => {
    // Both arrows are red; each serves the block on its own side.
    const twoLayers: LevelDef = {
      id: 23,
      cols: 3,
      rows: 3,
      palette: ["r"],
      hearts: 4,
      par: 2,
      arrows: [
        { id: "north", color: "r", dir: "up", path: [{ col: 1, row: 0 }] },
        { id: "south", color: "r", dir: "down", path: [{ col: 1, row: 2 }] },
      ],
      blocks: [
        { id: "top", side: "top", start: 1, span: 1, layers: ["r"] },
        { id: "bottom", side: "bottom", start: 1, span: 1, layers: ["r"] },
      ],
    };

    const start = createState(twoLayers);
    expect(solve(start).par).toBe(2);

    // An arrow can only ever reach the block on its own lane, so spending one
    // cannot strand another: the rest of the board is still solvable.
    const half = play(start, "north");
    expect(solve(half).par).toBe(1);
  });
});

describe("device callers", () => {
  it("fails open when the stuck check runs out of budget", () => {
    const unreachable: LevelDef = {
      id: 24,
      cols: 3,
      rows: 3,
      palette: ["r", "b"],
      hearts: 4,
      par: 1,
      arrows: [{ id: "a1", color: "r", dir: "up", path: [{ col: 1, row: 1 }] }],
      blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["b"] }],
    };
    const state = createState(unreachable);

    expect(isSolvable(state)).toBe(false);
    // A search that cannot finish must never call a board dead.
    expect(isSolvable(state, { maxNodes: 0 })).toBe(true);
  });

  it("hints the first move of an optimal solution", () => {
    expect(nextMove(createState(ordered.level))).toBe("red");
    expect(nextMove(createState(singleShot.level))).toBe("a1");
  });

  it("returns no hint when nothing can be found inside the budget", () => {
    expect(nextMove(createState(ordered.level), { maxNodes: 0 })).toBeNull();
  });

  it("uses the budgets from the telemetry document", () => {
    expect(BUDGETS.stuckCheck.timeBudgetMs).toBe(8);
    expect(BUDGETS.hint.timeBudgetMs).toBe(250);
    expect(BUDGETS.override.timeBudgetMs).toBe(1000);
  });

  it("respects a wall-clock budget on a board large enough to need one", () => {
    const level = buildLevel(401, {
      seed: 99,
      cols: 6,
      rows: 6,
      palette: ["r", "g", "b", "y", "p"],
      arrows: 16,
      maxBodyLength: 4,
    });

    const result = solve(createState(level), {
      timeBudgetMs: 0,
      countSolutionsUpTo: 1_000_000,
    });

    expect(result.exhausted).toBe(false);
    // The clock is checked every 1024 nodes, so that is where it stops.
    expect(result.nodes).toBe(1024);
  });
});

describe("solvability under the base rules", () => {
  /**
   * A legal move either peels the layer some solution had to peel anyway, or
   * removes an arrow that can never contribute (its lane is open or already
   * destroyed). Neither can take a solution away, and removing an arrow only
   * ever frees rays — so a board that starts solvable stays solvable, and the
   * stuck panel (DESIGN.md 1.7) cannot fire until bombs land (DESIGN.md 1.11).
   */
  it("is never lost by playing a legal move", () => {
    for (let index = 0; index < 20; index += 1) {
      const level = buildLevel(300 + index, {
        seed: 7000 + index,
        cols: 5,
        rows: 5,
        palette: ["r", "g", "b", "y", "p"],
        arrows: 10,
        maxBodyLength: 3,
      });

      let state = createState(level);
      expect(isSolvable(state, { maxNodes: 200_000 })).toBe(true);

      for (;;) {
        const board = packBoard(state);
        const moves = legalMoves(board, initialSearchState(board));
        if (moves.length === 0 || state.status !== "playing") break;

        state = fire(state, board.arrowIds[moves[index % moves.length]!]!).state;
        if (state.status !== "playing") break;

        expect(isSolvable(state, { maxNodes: 200_000 }), `level ${level.id}`).toBe(true);
      }
    }
  });

  it("answers the stuck check well inside its 8 ms budget", () => {
    const level = buildLevel(400, {
      seed: 4242,
      cols: 6,
      rows: 6,
      palette: ["r", "g", "b", "y", "p"],
      arrows: 16,
      maxBodyLength: 4,
    });
    const state = createState(level);

    const started = performance.now();
    const answer = isSolvable(state);
    const elapsed = performance.now() - started;

    expect(answer).toBe(true);
    expect(elapsed).toBeLessThan(8);
  });
});

describe("search bookkeeping", () => {
  /**
   * Firing A then B lands on the same board as B then A, so an exhaustive
   * search revisits states constantly; the Zobrist visited set is what stops
   * it re-expanding them. This board has no solution, which forces that
   * search to run to the end.
   */
  it("prunes revisited states and spends arrows on a destroyed lane", () => {
    const deadEnd: LevelDef = {
      id: 25,
      cols: 5,
      rows: 5,
      palette: ["r", "b"],
      hearts: 4,
      par: 3,
      arrows: [
        // Three independent reds, one per column: every firing order reaches
        // the same board, which is what makes the visited set earn its keep.
        { id: "a0", color: "r", dir: "up", path: [{ col: 0, row: 0 }] },
        { id: "a1", color: "r", dir: "up", path: [{ col: 1, row: 0 }] },
        { id: "a2", color: "r", dir: "up", path: [{ col: 2, row: 0 }] },
        // A spare in column 0, which can only ever fly off.
        { id: "spare", color: "r", dir: "up", path: [{ col: 0, row: 1 }] },
      ],
      blocks: [
        { id: "t0", side: "top", start: 0, span: 1, layers: ["r"] },
        { id: "t1", side: "top", start: 1, span: 1, layers: ["r"] },
        { id: "t2", side: "top", start: 2, span: 1, layers: ["r"] },
        // Nothing on the board is blue, and nothing faces down.
        { id: "bottom", side: "bottom", start: 4, span: 1, layers: ["b"] },
      ],
    };

    const result = solve(createState(deadEnd));

    expect(result.solvable).toBe(false);
    expect(result.exhausted).toBe(true);
    // Every permutation of the three reds, plus the spare's free flight, has
    // to be walked before the board can be called dead.
    expect(result.nodes).toBeGreaterThan(8);
  });
});
