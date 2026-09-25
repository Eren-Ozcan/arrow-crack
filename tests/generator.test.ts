import { describe, expect, it } from "vitest";
import { fire } from "@/engine/fire";
import { blockForArrow, createState } from "@/engine/level";
import { isBlocked } from "@/engine/rays";
import { parseLevel } from "@/levels/parse";
import { solve } from "@/solver";
import { generate } from "@/generator/generate";
import { isOneHeart, isTimed, specFor, specialFor } from "@/generator/spec";
import { validate } from "../tools/validate";

const BUDGET = { maxNodes: 500_000, timeBudgetMs: 5_000 };

/** The spec for a level index, minus the clock the solver has not earned yet. */
function candidate(id: number, seed: number) {
  const raw = generate({ ...specFor(id), seed });
  if (!raw) return null;
  const { type: _type, ...plain } = parseLevel(raw);
  return plain;
}

describe("the generator", () => {
  it("builds boards the engine accepts and the solver can finish", () => {
    // Backwards construction means solvability comes for free (DESIGN.md 4.2);
    // this is the test that says so out loud.
    let built = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const level = candidate(33, seed);
      if (!level) continue;
      built += 1;

      const result = solve(createState({ ...level, par: 0 }), BUDGET);
      expect(result.solvable, `seed ${seed}`).toBe(true);
      expect(result.par, `seed ${seed}`).toBeGreaterThan(0);
    }
    expect(built).toBeGreaterThan(0);
  });

  it("is deterministic: one seed is one board", () => {
    expect(candidate(45, 7)).toEqual(candidate(45, 7));
    expect(candidate(45, 7)).not.toEqual(candidate(45, 8));
  });

  it("keeps a level's layers in the order the arrows will peel them", () => {
    const level = candidate(31, 3);
    expect(level).not.toBeNull();
    // Every shipped board passes the gate; a generated one has to as well
    // before the difficulty model is ever consulted.
    const problems = validate({
      ...level!,
      par: solve(createState({ ...level!, par: 0 }), BUDGET).par ?? 0,
    });
    expect(problems.filter((problem) => !problem.includes("difficulty"))).toEqual([]);
  });

  it("places the designed special the band has reached, and only one", () => {
    const designed = Array.from({ length: 200 }, (_, index) => index + 1)
      .map((id) => [id, specialFor(id)] as const)
      .filter(([, special]) => special !== undefined);
    expect(designed.length).toBeGreaterThan(10);
    for (const [id, special] of designed) {
      const level = candidate(id, 11);
      if (!level) continue;
      const specials = level.arrows.filter((arrow) => arrow.special);
      expect(
        specials.map((arrow) => arrow.special),
        `level ${id}`,
      ).toEqual([special]);
    }
  });

  it("marks the timed levels and nothing else", () => {
    for (const id of [36, 45, 53, 65, 85, 1985]) {
      const raw = generate({ ...specFor(id), seed: 5 });
      if (!raw) continue;
      expect(raw.type, `level ${id}`).toBe(isTimed(id) ? "timed" : undefined);
    }
  });

  it("never puts a clock next to a single heart, all the way to 2000", () => {
    // Both are spikes; back to back they read as a wall (PROGRESSION.md 3).
    for (let id = 2; id < 2000; id += 1) {
      if (isTimed(id)) {
        expect(isOneHeart(id - 1) || isOneHeart(id + 1), `level ${id}`).toBe(false);
      }
    }
  });

  it("makes colour matter: a held arrow is in reach before its layer is", () => {
    // Without holds most traps are blocked rays, and the colours are close to
    // decoration (DESIGN.md 4.2). Walk each board's solution and count the
    // taps on offer that are clear but aimed at the wrong colour.
    const mismatchShare = (holdRate: number): number => {
      let mismatches = 0;
      let taps = 0;
      for (let seed = 1; seed <= 25; seed += 1) {
        const raw = generate({ ...specFor(1200), holdRate, seed });
        if (!raw) continue;
        const { type: _type, ...plain } = parseLevel(raw);
        let state = createState({ ...plain, par: 0 });
        const solution = solve(state, BUDGET);
        if (!solution.solvable) continue;
        for (const move of solution.witness ?? []) {
          for (const arrow of state.arrows) {
            taps += 1;
            if (isBlocked(state, arrow) || arrow.special) continue;
            const target = blockForArrow(state.blocks, arrow);
            if (target && target.layers[0] !== arrow.color) mismatches += 1;
          }
          state = fire(state, move).state;
          if (state.status !== "playing") break;
        }
      }
      return mismatches / taps;
    };
    expect(mismatchShare(0.9)).toBeGreaterThan(mismatchShare(0) * 1.5);
  });
});
