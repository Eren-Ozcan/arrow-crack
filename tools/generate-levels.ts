#!/usr/bin/env tsx
/**
 * The generator CLI (DESIGN.md 4.2, ROADMAP milestone 5).
 *
 *   npx tsx tools/generate-levels.ts                 report, writes nothing
 *   npx tsx tools/generate-levels.ts --write         write the level files
 *   npx tsx tools/generate-levels.ts --only 35,42    a few ids only
 *
 * For each level index it walks seeds until one candidate passes the shipped
 * gate (`tools/validate.ts`) *and* lands inside its difficulty band
 * (`tools/difficulty.ts`). A board that fails either is discarded, not tuned:
 * the seed is cheap and a hand-nudged board is a board nothing verified.
 *
 * The shaped levels (40, 60, 80) are hand-authored — mask-aware generation is
 * a post-launch lever (DESIGN.md 1.10) — so this script leaves them alone.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createState } from "../src/engine/level";
import type { Special } from "../src/engine/types";
import { parseLevel } from "../src/levels/parse";
import type { RawLevel } from "../src/levels/parse";
import { solve } from "../src/solver";
import { checkBand, measure, targetScore } from "./difficulty";
import { generate } from "./generate";
import type { GenerateOptions } from "./generate";
import { LEVELS_DIR } from "./levels";
import { validate } from "./validate";

const SOLVER_BUDGET = { maxNodes: 5_000_000, timeBudgetMs: 30_000 };
const MAX_SEEDS = 120;
/** Free moves a timed board has to offer, on average, to earn its clock. */
const TIMED_MIN_FAN_OUT = 3.5;

/** Hand-authored shaped levels; the generator does not touch them. */
export const SHAPED_LEVELS = [40, 60, 80];
/** A single heart, roughly every tenth level from 20 (DESIGN.md 1.5). */
export const ONE_HEART_LEVELS = [40, 50, 60, 70, 80];
/**
 * Roughly every fifteenth level from 25 (PROGRESSION.md 3), and never next to
 * a one-heart level: both are spikes, and back to back they read as a wall.
 */
export const TIMED_LEVELS = [38, 53, 68];
/**
 * Specials are introduced one at a time, in this order, and never before 35
 * (DESIGN.md 1.11). Each one comes back once more, a band later.
 */
export const SPECIAL_LEVELS: Record<number, Special> = {
  35: "joker",
  42: "bomb",
  48: "joker",
  55: "ghost",
  63: "bomb",
  74: "ghost",
};

/** A timed level gets a clock with room to read the board, not just to tap. */
export function clockFor(par: number): number {
  return Math.max(45_000, Math.ceil((par * 5_000) / 5_000) * 5_000);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * The knobs per level index. The board grows, the palette widens once, and
 * the tangle knobs climb — but the axis that actually carries the curve is
 * the trap ratio the difficulty model measures afterwards.
 */
export function specFor(id: number): Omit<GenerateOptions, "seed"> {
  const t = Math.min(1, Math.max(0, (id - 31) / (80 - 31)));
  const size = id < 42 ? 6 : id < 66 ? 7 : 8;
  const palette = id < 50 ? ["v", "b", "g", "y"] : ["v", "b", "g", "y", "p"];
  // A timed level wants a short par and a forgiving board: time pressure over
  // a level that demands deep lookahead is a coin flip, not a challenge
  // (PROGRESSION.md 3). So it gets a smaller board than its index otherwise
  // would, and the search below holds it to a wide fan-out.
  const timed = TIMED_LEVELS.includes(id);

  return {
    id,
    cols: size,
    rows: size,
    palette,
    hearts: ONE_HEART_LEVELS.includes(id) ? 1 : id >= 50 ? 3 : 4,
    arrows: Math.round(lerp(9, 15, t)) - (timed ? 3 : 0),
    decoys: id < 36 ? 0 : id < 56 ? 1 : 2,
    maxLayers: id < 45 ? 2 : id < 65 ? 3 : 4,
    blocks: Math.round(lerp(6, 12, t)),
    wideRate: lerp(0.2, 0.45, t),
    bendRate: lerp(0.25, 0.45, t),
    pinRate: timed ? 0.2 : lerp(0.3, 0.85, t),
    minBody: 2,
    maxBody: Math.round(lerp(3, 4, t)),
    ...(timed ? { type: "timed" as const } : {}),
    ...(SPECIAL_LEVELS[id] ? { special: SPECIAL_LEVELS[id] } : {}),
  };
}

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

/** The key order a level file is written in, so a diff stays readable. */
function serialize(level: RawLevel): string {
  const ordered: Record<string, unknown> = {
    id: level.id,
    cols: level.cols,
    rows: level.rows,
    palette: level.palette,
    hearts: level.hearts,
  };
  if (level.type) ordered.type = level.type;
  if (level.timeLimitMs !== undefined) ordered.timeLimitMs = level.timeLimitMs;
  ordered.par = level.par;
  ordered.arrows = level.arrows;
  ordered.blocks = level.blocks;
  if (level.maskRows) ordered.maskRows = level.maskRows;

  return `${JSON.stringify(ordered, null, 2)}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const onlyArg = args.find((arg) => arg.startsWith("--only"));
  const only = onlyArg
    ? new Set(
        (onlyArg.split("=")[1] ?? args[args.indexOf(onlyArg) + 1] ?? "")
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value)),
      )
    : null;

  let missing = 0;

  for (let id = 31; id <= 80; id += 1) {
    if (only && !only.has(id)) continue;
    if (SHAPED_LEVELS.includes(id)) {
      console.log(`${id}: hand-authored shaped level, skipped`);
      continue;
    }

    const started = performance.now();
    const found = findLevel(id);
    const elapsed = ((performance.now() - started) / 1000).toFixed(1);

    if (!found) {
      missing += 1;
      console.error(`${id}: no candidate inside the band after ${MAX_SEEDS} seeds`);
      continue;
    }

    if (write) {
      const file = join(LEVELS_DIR, `${String(id).padStart(3, "0")}.json`);
      await writeFile(file, serialize(found.level), "utf8");
    }

    console.log(
      `${id}: seed ${found.seed}, ${found.level.arrows.length} arrows, ` +
        `par ${found.level.par}, score ${found.score.toFixed(2)}, ` +
        `traps ${found.trapRatio.toFixed(2)}, fan-out ${found.fanOut.toFixed(1)}, ${elapsed}s`,
    );
  }

  if (missing > 0) process.exit(1);
}

if (process.argv[1]?.endsWith("generate-levels.ts")) await main();
