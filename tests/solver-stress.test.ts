import { describe, expect, it } from "vitest";
import { fire } from "@/engine/fire";
import { createState, validateLevel } from "@/engine/level";
import { solve } from "@/solver";
import { buildLevel } from "./fixtures/build";
import baseline from "./fixtures/solver-baseline.json";

const PALETTE = ["r", "g", "b", "y", "p"];

/**
 * The milestone target: a 6x6 board over five colours, solved well inside a
 * second. `baseline.worstCaseNodes` is the recorded ceiling — a solver change
 * that searches more than this has regressed and fails CI (CI.md 2.2).
 */
describe("solver stress", () => {
  const boards = Array.from({ length: 24 }, (_, index) =>
    buildLevel(100 + index, {
      seed: 1000 + index,
      cols: 6,
      rows: 6,
      palette: PALETTE,
      arrows: 14,
      maxBodyLength: 4,
    }),
  );

  it("builds valid boards", () => {
    for (const level of boards) {
      expect(validateLevel(level), `level ${level.id}`).toEqual([]);
    }
  });

  it("solves every board, with a witness the engine accepts", () => {
    for (const level of boards) {
      const start = createState(level);
      const result = solve(start, { countSolutionsUpTo: 200 });

      expect(result.solvable, `level ${level.id}`).toBe(true);
      expect(result.solutionCount).toBeGreaterThan(0);
      expect(result.exhausted).toBe(true);
      expect(result.par).toBe(level.par);

      const won = (result.witness ?? []).reduce(
        (state, arrowId) => fire(state, arrowId).state,
        start,
      );
      expect(won.status, `level ${level.id}`).toBe("won");
      expect(won.mistakes).toBe(0);
    }
  });

  it("stays inside the recorded node and time ceilings", () => {
    let worstNodes = 0;
    let worstMs = 0;

    for (const level of boards) {
      const state = createState(level);
      const started = performance.now();
      const result = solve(state, { countSolutionsUpTo: 200 });
      const elapsed = performance.now() - started;

      worstNodes = Math.max(worstNodes, result.nodes);
      worstMs = Math.max(worstMs, elapsed);
    }

    expect(worstNodes).toBeLessThanOrEqual(baseline.worstCaseNodes);
    expect(worstMs).toBeLessThan(1000);
  });
});
