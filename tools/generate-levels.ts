#!/usr/bin/env tsx
/**
 * The generator CLI (DESIGN.md 4.2).
 *
 *   npx tsx tools/generate-levels.ts                   report, writes nothing
 *   npx tsx tools/generate-levels.ts --write           rewrite the seed table
 *   npx tsx tools/generate-levels.ts --only 35,42      a few ids only
 *   npx tsx tools/generate-levels.ts --from 81 --to 400
 *   npx tsx tools/generate-levels.ts --only 53 --seeds 900   a wider search
 *
 * For each level index it walks seeds until one candidate passes the shipped
 * gate (`tools/validate.ts`) *and* lands inside its difficulty band
 * (`tools/difficulty.ts`). A board that fails either is discarded, not tuned:
 * the seed is cheap and a hand-nudged board is a board nothing verified.
 *
 * What it writes is not a board but a row — the seed and the certified par —
 * into `src/levels/generated.json`; the app rebuilds the board from it. The
 * hand-authored levels (the tutorial and the shaped beats) are left alone.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createState } from "../src/engine/level";
import { generate } from "../src/generator/generate";
import {
  clockFor,
  FIRST_GENERATED_LEVEL,
  HAND_AUTHORED_LEVELS,
  isTimed,
  LAST_LEVEL,
  specFor,
} from "../src/generator/spec";
import { parseLevel } from "../src/levels/parse";
import type { RawLevel } from "../src/levels/parse";
import { solve } from "../src/solver";
import { checkBand, measure, targetScore } from "./difficulty";
import { validate } from "./validate";

export const TABLE = join(process.cwd(), "src", "levels", "generated.json");

const SOLVER_BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000 };
const MAX_SEEDS = 120;
/** Every seed a level owns: its ids run from `id * 1000 + 1`. */
const FULL_BLOCK = 999;
/** Free moves a timed board has to offer, on average, to earn its clock. */
const TIMED_MIN_FAN_OUT = 3.5;

export interface Candidate {
  level: RawLevel;
  seed: number;
  score: number;
  trapRatio: number;
  fanOut: number;
}

/**
 * Walks seeds and keeps the board that lands nearest the middle of the level's
 * band. Taking the first board that merely qualifies would leave the curve
 * jagged — a level scraping the bottom of its band followed by one at the top
 * of the next is a difficulty spike the model can see and the player feels.
 */
export function findLevel(id: number, maxSeeds = MAX_SEEDS): Candidate | null {
  const spec = specFor(id);
  const target = targetScore(id, spec.hearts);
  let best: Candidate | null = null;

  // Each level searches its own seed range, so two neighbouring indices with
  // the same knobs cannot converge on the same board.
  const base = id * 1_000;

  for (let offset = 1; offset <= maxSeeds; offset += 1) {
    const seed = base + offset;
    const raw = generate({ ...spec, seed });
    if (!raw) continue;
    // The generator may fall a few arrows short of its count when the grid
    // runs out of room. The band alone would then prefer those thin boards
    // for the gentle levels, since fewer arrows is the cheapest way to a low
    // score, so a board is held to its count less one: the curve has to come
    // from what the arrows ask, not from how many of them there are.
    if (raw.arrows.length < spec.arrows + spec.decoys - 1) continue;

    let parsed;
    try {
      parsed = parseLevel(raw);
    } catch {
      continue;
    }

    // The clock is derived from `par`, so the board is solved without it: a
    // timed level with no `timeLimitMs` yet is not a level the engine accepts.
    const { type: _type, timeLimitMs: _clock, ...plain } = parsed;
    const solution = solve(createState({ ...plain, par: 0 }), SOLVER_BUDGET);
    if (!solution.solvable || solution.par === null) continue;

    raw.par = solution.par;
    if (raw.type === "timed") raw.timeLimitMs = clockFor(solution.par);

    const level = parseLevel(raw);
    const metrics = measure(level);
    if (!metrics) continue;
    if (checkBand(level, metrics).length > 0) continue;
    // A timed board that only one line of play survives is a coin flip
    // (PROGRESSION.md 3), so a clock is only put on a forgiving one.
    if (raw.type === "timed" && metrics.fanOut < TIMED_MIN_FAN_OUT) continue;
    if (validate(level).length > 0) continue;

    const candidate: Candidate = {
      level: raw,
      seed,
      score: metrics.score,
      trapRatio: metrics.trapRatio,
      fanOut: metrics.fanOut,
    };
    if (!best || Math.abs(candidate.score - target) < Math.abs(best.score - target)) {
      best = candidate;
    }
  }

  return best;
}

type Row = [id: number, seed: number, par: number];

export async function readTable(): Promise<Map<number, Row>> {
  try {
    const table = JSON.parse(await readFile(TABLE, "utf8")) as { levels: Row[] };
    return new Map(table.levels.map((row) => [row[0], row]));
  } catch {
    return new Map();
  }
}

/** One row per line: a diff of the table reads as a list of changed levels. */
export function renderTable(rows: Row[]): string {
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const lines = sorted.map((row) => `    ${JSON.stringify(row)}`).join(",\n");
  return `{\n  "levels": [\n${lines}\n  ]\n}\n`;
}

function numberArg(args: string[], name: string): number | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) ? value : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const onlyIndex = args.indexOf("--only");
  const only =
    onlyIndex === -1
      ? null
      : new Set(
          (args[onlyIndex + 1] ?? "")
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value)),
        );
  const from = numberArg(args, "--from") ?? FIRST_GENERATED_LEVEL;
  const to = numberArg(args, "--to") ?? LAST_LEVEL;
  // A level's seeds live in its own block of a thousand, so the search can
  // widen up to there without overlapping its neighbour's.
  const seeds = Math.min(FULL_BLOCK, numberArg(args, "--seeds") ?? MAX_SEEDS);

  const table = await readTable();
  let missing = 0;
  let written = 0;

  for (let id = from; id <= to; id += 1) {
    if (only && !only.has(id)) continue;
    if (HAND_AUTHORED_LEVELS.includes(id)) continue;

    const started = performance.now();
    // A clock only goes on a forgiving board, and few seeds are forgiving
    // enough, so a timed level always gets the whole block. Any other level
    // that comes up empty widens to the whole block too, so a rerun of the
    // same spec always lands on the same seeds.
    const found = isTimed(id)
      ? findLevel(id, FULL_BLOCK)
      : (findLevel(id, seeds) ?? findLevel(id, FULL_BLOCK));
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);

    if (!found) {
      missing += 1;
      console.error(`${id}: no candidate inside the band after ${FULL_BLOCK} seeds`);
      continue;
    }

    table.set(id, [id, found.seed, found.level.par]);
    written += 1;
    console.log(
      `${id}: seed ${found.seed}, ${found.level.arrows.length} arrows, ` +
        `par ${found.level.par}, score ${found.score.toFixed(2)}, ` +
        `traps ${found.trapRatio.toFixed(2)}, fan-out ${found.fanOut.toFixed(1)}, ${elapsed}s`,
    );

    // Long runs write as they go, so an interrupted run keeps its work.
    if (write && written % 50 === 0) {
      await writeFile(TABLE, renderTable([...table.values()]), "utf8");
    }
  }

  if (write) await writeFile(TABLE, renderTable([...table.values()]), "utf8");
  if (missing > 0) process.exit(1);
}

if (process.argv[1]?.endsWith("generate-levels.ts")) await main();
