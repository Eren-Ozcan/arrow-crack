#!/usr/bin/env tsx
/**
 * CLI wrapper around the level gate (CI.md section 2.2). The per-level checks
 * live in ./validate.ts so tests can run them without running the process;
 * what is here is everything that needs the whole bundle at once — the id
 * sequence, the manifest, the spacing between the two special level types,
 * the shape of the difficulty curve and the solver-cost baseline.
 *
 *   npm run levels:validate
 *   npm run levels:validate -- --update-costs   record a new cost baseline
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createState } from "../src/engine/level";
import type { LevelDef } from "../src/engine/types";
import { solve } from "../src/solver";
import { FIRST_GENERATED_LEVEL, measure } from "./difficulty";
import { render } from "./generate-manifest";
import { loadLevels } from "./levels";
import type { LoadedLevel } from "./levels";
import { validate } from "./validate";

const COSTS = join(process.cwd(), "tests", "fixtures", "level-costs.json");
const SOLVER_BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000 };
/** Levels either side of the window the curve is judged over. */
const CURVE_WINDOW = 10;

/** Duplicate ids, and gaps in the sequence: both break the level path. */
export function checkIds(levels: LoadedLevel[]): string[] {
  const problems: string[] = [];
  const seen = new Map<number, string>();

  for (const { file, level } of levels) {
    const duplicate = seen.get(level.id);
    if (duplicate) problems.push(`level id ${level.id} is also used by ${duplicate}`);
    else seen.set(level.id, file);
  }

  const ids = [...seen.keys()].sort((a, b) => a - b);
  ids.forEach((id, index) => {
    if (id !== index + 1) problems.push(`level ${id} leaves a gap at ${index + 1}`);
  });

  return problems;
}

/**
 * The two special level types are both spikes; back to back they read as a
 * difficulty wall rather than as variety (PROGRESSION.md 3).
 */
export function checkSpacing(levels: LevelDef[]): string[] {
  const byId = new Map(levels.map((level) => [level.id, level]));

  return levels
    .filter((level) => level.type === "timed")
    .flatMap((level) =>
      [level.id - 1, level.id + 1]
        .filter((id) => byId.get(id)?.hearts === 1)
        .map((id) => `timed level ${level.id} sits next to one-heart level ${id}`),
    );
}

/**
 * The curve has to climb. Level to level it may not, so the check is on the
 * rolling mean over a ten-level window — the scale at which a player
 * experiences the ramp at all. One-heart levels are left out of it entirely:
 * they are the game's punctuation and are built gentler on purpose
 * (DESIGN.md 1.5), so counting them would read a deliberate pause as a dip.
 */
export function checkCurve(scores: Map<number, number>): string[] {
  const ids = [...scores.keys()].sort((a, b) => a - b);
  const means: { id: number; mean: number }[] = [];

  for (let start = 0; start + CURVE_WINDOW <= ids.length; start += 1) {
    const window = ids.slice(start, start + CURVE_WINDOW);
    const mean =
      window.reduce((sum, id) => sum + (scores.get(id) ?? 0), 0) / window.length;
    means.push({ id: window[0]!, mean });
  }

  const problems: string[] = [];
  for (let index = 1; index < means.length; index += 1) {
    const previous = means[index - 1]!;
    const current = means[index]!;
    if (current.mean < previous.mean) {
      problems.push(
        `the difficulty curve dips at level ${current.id}: ` +
          `${current.mean.toFixed(3)} against ${previous.mean.toFixed(3)} the window before`,
      );
    }
  }
  return problems;
}

async function readCosts(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(COSTS, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const updateCosts = process.argv.includes("--update-costs");
  const levels = await loadLevels();
  const baseline = await readCosts();
  const costs: Record<string, number> = {};
  const scores = new Map<number, number>();

  let failures = 0;
  const report = (file: string, problems: string[]): void => {
    for (const problem of problems) console.error(`FAIL ${file}: ${problem}`);
    if (problems.length > 0) failures += 1;
  };

  for (const { file, level } of levels) {
    const problems = validate(level);

    // The search is deterministic, so the node count is a number, not a
    // sample: a solver change that searches further has regressed (CI.md 2.2).
    const nodes = solve(createState(level), SOLVER_BUDGET).nodes;
    costs[String(level.id)] = nodes;
    const recorded = baseline[String(level.id)];
    if (!updateCosts && recorded !== undefined && nodes > recorded) {
      problems.push(`solver cost ${nodes} nodes, above the baseline of ${recorded}`);
    }

    if (level.id >= FIRST_GENERATED_LEVEL && level.hearts !== 1) {
      const metrics = measure(level);
      if (metrics) scores.set(level.id, metrics.score);
    }

    report(file, problems);
  }

  report("<bundle>", checkIds(levels));
  report("<bundle>", checkSpacing(levels.map((entry) => entry.level)));
  report("<bundle>", checkCurve(scores));

  const manifest = await readFile(
    join(process.cwd(), "src", "levels", "manifest.ts"),
    "utf8",
  )
    .then((text) => text.replace(/\r\n/g, "\n"))
    .catch(() => "");
  if (manifest !== render(levels.map((entry) => entry.file))) {
    report("<bundle>", ["the manifest is stale; run `npm run levels:manifest`"]);
  }

  if (updateCosts) {
    await writeFile(COSTS, `${JSON.stringify(costs, null, 2)}\n`, "utf8");
    console.log(`levels:validate — recorded solver cost for ${levels.length} level(s)`);
  }

  console.log(`levels:validate — ${levels.length} level(s), ${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1]?.endsWith("validate-levels.ts")) await main();
