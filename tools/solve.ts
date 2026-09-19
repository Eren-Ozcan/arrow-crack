#!/usr/bin/env tsx
/**
 * Solver CLI. Reports solvability, par, a capped solution count and the
 * witness path for one level file, or for every bundled level.
 *
 *   npx tsx tools/solve.ts                       every bundled level
 *   npx tsx tools/solve.ts src/levels/data/1.json
 *   npx tsx tools/solve.ts --json <file>
 */
import { readFile } from "node:fs/promises";
import { createState } from "../src/engine/level";
import type { LevelDef } from "../src/engine/types";
import { solve } from "../src/solver";
import { loadLevels } from "./levels";

const BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000, countSolutionsUpTo: 100 };

async function readLevels(paths: string[]): Promise<{ file: string; level: LevelDef }[]> {
  if (paths.length === 0) return loadLevels();

  const levels = [];
  for (const path of paths) {
    levels.push({
      file: path,
      level: JSON.parse(await readFile(path, "utf8")) as LevelDef,
    });
  }
  return levels;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const levels = await readLevels(args.filter((arg) => !arg.startsWith("--")));

  const report = levels.map(({ file, level }) => {
    const started = performance.now();
    const result = solve(createState(level), BUDGET);
    return { file, id: level.id, elapsedMs: performance.now() - started, ...result };
  });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  for (const entry of report) {
    const verdict = entry.solvable
      ? `par ${entry.par}, ${entry.solutionCount} optimal solution(s)`
      : entry.exhausted
        ? "UNSOLVABLE"
        : "UNKNOWN (budget exhausted)";
    console.log(
      `${entry.file} — ${verdict}, ${entry.nodes} nodes, ${entry.elapsedMs.toFixed(1)} ms`,
    );
    if (entry.witness) console.log(`  ${entry.witness.join(" -> ")}`);
  }

  if (report.length === 0) console.log("no levels found");
}

await main();
