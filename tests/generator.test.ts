import { describe, expect, it } from "vitest";
import { createState } from "@/engine/level";
import { parseLevel } from "@/levels/parse";
import { solve } from "@/solver";
import { generate } from "../tools/generate";
import { SPECIAL_LEVELS, specFor, TIMED_LEVELS } from "../tools/generate-levels";
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
    for (const [id, special] of Object.entries(SPECIAL_LEVELS)) {
      const level = candidate(Number(id), 11);
      if (!level) continue;
      const specials = level.arrows.filter((arrow) => arrow.special);
      expect(
        specials.map((arrow) => arrow.special),
        `level ${id}`,
      ).toEqual([special]);
    }
  });

  it("marks the timed levels and nothing else", () => {
    for (const id of [36, ...TIMED_LEVELS]) {
      const raw = generate({ ...specFor(id), seed: 5 });
      if (!raw) continue;
      expect(raw.type, `level ${id}`).toBe(
        TIMED_LEVELS.includes(id) ? "timed" : undefined,
      );
    }
  });
});
