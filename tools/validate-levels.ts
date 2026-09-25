#!/usr/bin/env tsx
/**
 * CLI wrapper around the level gate (CI.md section 2.2). The per-level checks
 * live in ./validate.ts so tests can run them without running the process;
 * what is here is everything that needs the whole bundle at once — the id
 * sequence, the manifest, the spacing between the two special level types,
 * the shape of the difficulty curve, the solver-cost baseline and the
 * fingerprint of every generated board.
 *
 *   npm run levels:validate
 *   npm run levels:validate -- --update-costs   record new cost and fingerprint baselines
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createState } from "../src/engine/level";
import type { LevelDef } from "../src/engine/types";
import { solve } from "../src/solver";
import { tierOf } from "../src/generator/spec";
import type { Tier } from "../src/generator/spec";
import { FIRST_GENERATED_LEVEL, measure } from "./difficulty";
import { render } from "./generate-manifest";
import { loadAll, loadLevels } from "./levels";
import type { LoadedLevel } from "./levels";
import { validate } from "./validate";

const COSTS = join(process.cwd(), "tests", "fixtures", "level-costs.json");
const PRINTS = join(process.cwd(), "tests", "fixtures", "level-prints.json");
const SOLVER_BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000 };
/** Levels either side of the window the curve is judged over. */
const CURVE_WINDOW = 10;
/**
 * How far the rolling mean may slip before it counts as a dip. The curve
 * saturates (`src/generator/spec.ts`), so past a few hundred levels it is a
 * plateau, and a plateau measured board by board is noise around a line.
 */
const CURVE_TOLERANCE = 0.02;

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

/** Levels per block the tier order is judged over. */
const TIER_BLOCK = 100;
const TIER_ORDER: Tier[] = ["breather", "normal", "hard", "very-hard"];

/**
 * The last-digit rhythm has to hold everywhere, not just where it was tuned:
 * in every block of a hundred levels, as far as the level count goes, the mean
 * score of the very hard levels beats the hard ones, which beat the normal
 * ones, which beat the breathers (DESIGN.md 2). Judged on means, because any
 * single level sits somewhere inside a band that overlaps its neighbours'.
 */
export function checkTiers(scores: Map<number, number>): string[] {
  const blocks = new Map<number, Map<Tier, number[]>>();
  for (const [id, score] of scores) {
    const block = Math.floor((id - 1) / TIER_BLOCK);
    const tiers = blocks.get(block) ?? new Map<Tier, number[]>();
    const list = tiers.get(tierOf(id)) ?? [];
    list.push(score);
    tiers.set(tierOf(id), list);
    blocks.set(block, tiers);
  }

  const problems: string[] = [];
  for (const [block, tiers] of [...blocks].sort((a, b) => a[0] - b[0])) {
    const means = TIER_ORDER.map((tier) => {
      const list = tiers.get(tier) ?? [];
      return list.length === 0 ? null : list.reduce((sum, x) => sum + x, 0) / list.length;
    });
    for (let index = 1; index < TIER_ORDER.length; index += 1) {
      const lower = means[index - 1];
      const upper = means[index];
      if (lower === null || lower === undefined || upper === null || upper === undefined)
        continue;
      if (upper <= lower) {
        const from = block * TIER_BLOCK + 1;
        problems.push(
          `levels ${from}-${from + TIER_BLOCK - 1}: ${TIER_ORDER[index]} levels average ` +
            `${upper.toFixed(3)}, not above the ${TIER_ORDER[index - 1]} ones at ${lower.toFixed(3)}`,
        );
      }
    }
  }
  return problems;
}

/**
 * The curve has to climb. Level to level it may not, so the check is on the
 * rolling mean over a ten-level window — the scale at which a player
 * experiences the ramp at all. A window holds one level of each last digit,
 * so the tier steps (DESIGN.md 2) cancel out of it.
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
    if (current.mean < previous.mean - CURVE_TOLERANCE) {
      problems.push(
        `the difficulty curve dips at level ${current.id}: ` +
          `${current.mean.toFixed(3)} against ${previous.mean.toFixed(3)} the window before`,
      );
    }
  }
  return problems;
}

async function readRecord<T>(path: string): Promise<Record<string, T>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, T>;
  } catch {
    return {};
  }
}

/**
 * A short FNV-1a hash of a level. A generated level is only a seed on disk,
 * so a change to the generator or to `specFor` would swap the board under
 * every player without a single file in the level data changing; the
 * fingerprint is what makes that visible.
 */
export function fingerprint(level: LevelDef): string {
  const text = JSON.stringify(level);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function main(): Promise<void> {
  const updateCosts = process.argv.includes("--update-costs");
  const levels = await loadAll();
  const baseline = await readRecord<number>(COSTS);
  const printBaseline = await readRecord<string>(PRINTS);
  const costs: Record<string, number> = {};
  const prints: Record<string, string> = {};
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

    if (file.startsWith("generated.json")) {
      const print = fingerprint(level);
      prints[String(level.id)] = print;
      const recorded = printBaseline[String(level.id)];
      if (!updateCosts && recorded !== undefined && recorded !== print) {
        problems.push(
          `the board rebuilt from its seed has changed (${recorded} to ${print}); ` +
            "a generator or spec change moved a shipped level",
        );
      }
    }

    if (level.id >= FIRST_GENERATED_LEVEL) {
      const metrics = measure(level);
      if (metrics) scores.set(level.id, metrics.score);
    }

    report(file, problems);
  }

  report("<bundle>", checkIds(levels));
  report("<bundle>", checkSpacing(levels.map((entry) => entry.level)));
  report("<bundle>", checkCurve(scores));
  report("<bundle>", checkTiers(scores));

  const manifest = await readFile(
    join(process.cwd(), "src", "levels", "manifest.ts"),
    "utf8",
  )
    .then((text) => text.replace(/\r\n/g, "\n"))
    .catch(() => "");
  const authored = await loadLevels();
  if (manifest !== render(authored.map((entry) => entry.file))) {
    report("<bundle>", ["the manifest is stale; run `npm run levels:manifest`"]);
  }

  if (updateCosts) {
    await writeFile(COSTS, `${JSON.stringify(costs, null, 2)}\n`, "utf8");
    await writeFile(PRINTS, `${JSON.stringify(prints, null, 2)}\n`, "utf8");
    console.log(
      `levels:validate — recorded solver cost and fingerprints for ${levels.length} level(s)`,
    );
  }

  console.log(`levels:validate — ${levels.length} level(s), ${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1]?.endsWith("validate-levels.ts")) await main();
