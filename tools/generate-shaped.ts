#!/usr/bin/env tsx
/**
 * The shaped beats (DESIGN.md 1.10): 20, 40, 60 and 80.
 *
 *   npx tsx tools/generate-shaped.ts            report, writes nothing
 *   npx tsx tools/generate-shaped.ts --write    rewrite the four level files
 *
 * The silhouettes are drawn here by hand; the boards inside them come from the
 * generator, searched against the same band as every other level. Every one
 * of these ends in 0, so the band is the very hard one (DESIGN.md 2), and the
 * picture gets no discount for being a picture.
 *
 * Unlike the rest of the range these ship as JSON rather than as seeds: the
 * silhouette is authored content, and a hand edit to one should never depend
 * on the generator staying byte-for-byte the same.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createState } from "../src/engine/level";
import type { RawLevel } from "../src/levels/parse";
import { parseLevel, parseMask } from "../src/levels/parse";
import { generate } from "../src/generator/generate";
import { specFor } from "../src/generator/spec";
import { solve } from "../src/solver";
import { checkBand, measure, targetScore } from "./difficulty";
import { LEVELS_DIR } from "./levels";
import { validate } from "./validate";

const SOLVER_BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000 };
const SEEDS = 999;
const EXTRA_ARROWS = 3;
const SHORTFALL = 2;

/** `#` is a playable cell. Eight columns: the widest a phone reads (REFERENCE.md 4). */
export const SILHOUETTES: Record<number, { name: string; rows: string[] }> = {
  20: {
    name: "heart",
    rows: [
      ".##..##.",
      "########",
      "########",
      "########",
      ".######.",
      "..####..",
      "...##...",
    ],
  },
  40: {
    name: "anchor",
    rows: [
      "..####..",
      "..#..#..",
      "..####..",
      "########",
      "...##...",
      "...##...",
      "#..##..#",
      "##.##.##",
      ".######.",
    ],
  },
  60: {
    name: "trophy",
    rows: [
      "########",
      "########",
      "########",
      ".######.",
      "..####..",
      "...##...",
      "..####..",
      ".######.",
      ".######.",
    ],
  },
  80: {
    name: "butterfly",
    rows: [
      "##....##",
      "###..###",
      "########",
      ".######.",
      "..####..",
      ".######.",
      "########",
      "###..###",
      "##....##",
    ],
  },
};

interface Found {
  raw: RawLevel;
  seed: number;
  score: number;
}

export function findShaped(id: number): Found | null {
  const silhouette = SILHOUETTES[id];
  if (!silhouette) throw new Error(`level ${id} has no silhouette`);

  const cols = silhouette.rows[0]!.length;
  const rows = silhouette.rows.length;
  const mask = parseMask(silhouette.rows, cols, rows);
  const base = specFor(id);
  // The spec's arrow count assumes a full rectangle; a silhouette only offers
  // its own cells. Scaled down to them, the boards came out thinner than their
  // rectangular neighbours, so the count is pushed back up and allowed to
  // fall two short.
  const arrows = Math.max(
    6,
    Math.round((base.arrows * mask.length) / (base.cols * base.rows)) + EXTRA_ARROWS,
  );
  const spec = { ...base, cols, rows, arrows, mask };
  const target = targetScore(id);
  let best: Found | null = null;

  for (let offset = 1; offset <= SEEDS; offset += 1) {
    const seed = id * 1_000 + offset;
    const raw = generate({ ...spec, seed });
    if (!raw || raw.arrows.length < arrows - SHORTFALL) continue;
    raw.maskRows = silhouette.rows;

    const { type: _type, ...plain } = parseLevel(raw);
    const solution = solve(createState({ ...plain, par: 0 }), SOLVER_BUDGET);
    if (!solution.solvable || solution.par === null) continue;
    raw.par = solution.par;

    const level = parseLevel(raw);
    const metrics = measure(level);
    if (!metrics || checkBand(level, metrics).length > 0) continue;
    if (validate(level).length > 0) continue;

    if (!best || Math.abs(metrics.score - target) < Math.abs(best.score - target)) {
      best = { raw, seed, score: metrics.score };
    }
  }
  return best;
}

/** The same key order as the other level files, mask last. */
function serialize(level: RawLevel): string {
  const { id, cols, rows, palette, hearts, par, arrows, blocks, maskRows } = level;
  return `${JSON.stringify(
    { id, cols, rows, palette, hearts, par, arrows, blocks, maskRows },
    null,
    2,
  )}\n`;
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  let missing = 0;

  for (const id of Object.keys(SILHOUETTES).map(Number)) {
    const found = findShaped(id);
    if (!found) {
      missing += 1;
      console.error(
        `${id}: no ${SILHOUETTES[id]!.name} inside the band after ${SEEDS} seeds`,
      );
      continue;
    }
    if (write) {
      const file = join(LEVELS_DIR, `${String(id).padStart(3, "0")}.json`);
      await writeFile(file, serialize(found.raw), "utf8");
    }
    console.log(
      `${id}: ${SILHOUETTES[id]!.name}, seed ${found.seed}, ` +
        `${found.raw.arrows.length} arrows, par ${found.raw.par}, score ${found.score.toFixed(2)}`,
    );
  }

  if (missing > 0) process.exit(1);
}

if (process.argv[1]?.endsWith("generate-shaped.ts")) await main();
