/**
 * The level validation gate (CI.md section 2.2) — the check that matters.
 *
 * One solver, three callers: this gate, the generator, and the device's
 * override check. Everything here runs against the shipped engine, so a level
 * that passes is a level the game can actually finish.
 *
 * Still to come, with the milestones that make them meaningful:
 * - difficulty band metrics (DESIGN.md 4.3), with the generator in milestone 5
 * - solver-cost regression per level, once generated levels have baselines
 */
import { fire } from "../src/engine/fire";
import { createState, laneCount, validateLevel } from "../src/engine/level";
import type { GameState, LevelDef, Side } from "../src/engine/types";
import { solve } from "../src/solver";

const SOLVER_BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000 };
const SIDES: Side[] = ["top", "bottom", "left", "right"];

/** Specials are introduced one at a time and never before this level (DESIGN.md 1.11). */
const FIRST_SPECIAL_LEVEL = 35;
/** The levels that teach what costs a heart demonstrate it instead (DESIGN.md 2). */
const FORGIVING_LEVELS = 3;

/** Hearts by level index (DESIGN.md 2); a designated level may grant 1. */
function expectedHearts(id: number): number {
  return id >= 50 ? 3 : 4;
}

function replay(state: GameState, witness: string[]): string | null {
  let current = state;
  for (const arrowId of witness) {
    const { state: next, event } = fire(current, arrowId);
    if (event === "blocked" || event === "bounced") {
      return `witness move ${arrowId} was a mistake (${event})`;
    }
    current = next;
  }
  if (current.status !== "won") return "witness replay does not win the level";
  if (current.heartsLeft !== state.heartsLeft) return "witness replay spends a life";
  return null;
}

/** A block nothing can hit is an unsolvable level (DESIGN.md 1.10). */
function unhittableBlocks(level: LevelDef): string[] {
  const reachable = new Set<string>();
  for (const arrow of level.arrows) {
    const head = arrow.path[arrow.path.length - 1]!;
    const side =
      arrow.dir === "up"
        ? "top"
        : arrow.dir === "down"
          ? "bottom"
          : arrow.dir === "left"
            ? "left"
            : "right";
    const lane = arrow.dir === "left" || arrow.dir === "right" ? head.row : head.col;
    reachable.add(`${side}:${lane}`);
  }

  return level.blocks
    .filter((block) => {
      for (let lane = block.start; lane < block.start + block.span; lane += 1) {
        if (reachable.has(`${block.side}:${lane}`)) return false;
      }
      return true;
    })
    .map((block) => `block ${block.id} sits on a lane no arrow can reach`);
}

/**
 * Scarcity, not power, is what keeps a special a puzzle piece: at most one
 * from the designer, and only once the base rules are automatic
 * (DESIGN.md 1.11). The second special a board may carry is earned from a
 * combo at runtime, never authored.
 */
function checkSpecials(level: LevelDef): string[] {
  const specials = level.arrows.filter((arrow) => arrow.special);
  if (specials.length === 0) return [];

  const problems: string[] = [];
  if (specials.length > 1) {
    problems.push(
      `level carries ${specials.length} special arrows; a designer may place one`,
    );
  }
  if (level.id < FIRST_SPECIAL_LEVEL) {
    problems.push(
      `level ${level.id} carries a special; the first one belongs at level ${FIRST_SPECIAL_LEVEL}`,
    );
  }
  return problems;
}

/** Only the three levels that teach the heart rules may forgive it. */
function checkForgiving(level: LevelDef): string[] {
  const shouldForgive = level.id <= FORGIVING_LEVELS;
  if ((level.forgiving ?? false) === shouldForgive) return [];
  return shouldForgive
    ? [`level ${level.id} teaches a heart rule, so it must be forgiving`]
    : [`level ${level.id} is forgiving; only levels 1-${FORGIVING_LEVELS} are`];
}

function checkLanes(level: LevelDef): string[] {
  return SIDES.flatMap((side) =>
    level.blocks
      .filter((block) => block.side === side)
      .filter((block) => block.start + block.span > laneCount(level, side))
      .map((block) => `block ${block.id} runs past the ${side} side`),
  );
}

export function validate(level: LevelDef): string[] {
  const problems = [
    ...validateLevel(level),
    ...checkLanes(level),
    ...unhittableBlocks(level),
    ...checkSpecials(level),
    ...checkForgiving(level),
  ];

  // Hearts: the band default, or 1 on a designated one-heart level.
  const hearts = expectedHearts(level.id);
  if (level.hearts !== hearts && level.hearts !== 1) {
    problems.push(
      `hearts is ${level.hearts}; level ${level.id} wants ${hearts}, or 1 for a one-heart level`,
    );
  }

  // A timed level's clock has to fit its optimal solution (PROGRESSION.md 3).
  if (level.type === "timed" && level.timeLimitMs !== undefined) {
    if (level.timeLimitMs < level.par * 1000) {
      problems.push(
        `timed level allows ${level.timeLimitMs} ms for a par of ${level.par}`,
      );
    }
  }

  // Anything past here needs a board the engine will accept.
  if (problems.length > 0) return problems;

  const state = createState(level);
  const result = solve(state, { ...SOLVER_BUDGET, countSolutionsUpTo: 2 });

  if (!result.exhausted) {
    problems.push("solver ran out of budget; the level cannot be certified");
    return problems;
  }
  if (!result.solvable) {
    problems.push("no solution exists");
    return problems;
  }
  if (result.par !== level.par) {
    problems.push(`stored par is ${level.par}; the solver says ${result.par}`);
  }

  const replayProblem = replay(state, result.witness ?? []);
  if (replayProblem) problems.push(replayProblem);

  return problems;
}
