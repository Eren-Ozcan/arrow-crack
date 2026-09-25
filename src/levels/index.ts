import type { LevelDef } from "@/engine/types";
import { generate } from "@/generator/generate";
import { clockFor, specFor } from "@/generator/spec";
import table from "./generated.json";
import { LEVEL_FILES } from "./manifest";
import { parseLevel } from "./parse";

/**
 * The levels, in play order (DESIGN.md 4). The tutorial and the shaped beats
 * are hand-authored JSON; every other level is a row in `generated.json` — a
 * seed and the par the solver certified — and is rebuilt on demand by the
 * same generator that proposed it. Two thousand boards as JSON would be
 * megabytes of bundle; as seeds they are a few kilobytes.
 *
 * Every level, authored or generated, passes the gate in
 * `tools/validate-levels.ts` before it ships, and the gate pins a fingerprint
 * of each generated board, so a generator change cannot silently swap one.
 */
export interface GeneratedEntry {
  id: number;
  seed: number;
  par: number;
}

/** `[id, seed, par]` rows, kept as arrays so the table stays small. */
export const GENERATED: GeneratedEntry[] = (table.levels as number[][]).map(
  ([id, seed, par]) => ({ id: id!, seed: seed!, par: par! }),
);

const AUTHORED = new Map(LEVEL_FILES.map((raw) => [raw.id, raw] as const));
const SEEDS = new Map(GENERATED.map((entry) => [entry.id, entry] as const));

/** Every level id, ascending. */
export const LEVEL_IDS: number[] = [
  ...new Set([...AUTHORED.keys(), ...SEEDS.keys()]),
].sort((a, b) => a - b);

export const LEVEL_COUNT = LEVEL_IDS.length;

/** Rebuilds a generated level from its row; throws if the seed no longer builds. */
export function buildGenerated(entry: GeneratedEntry): LevelDef {
  const raw = generate({ ...specFor(entry.id), seed: entry.seed });
  if (!raw) throw new Error(`level ${entry.id}: seed ${entry.seed} no longer builds`);
  raw.par = entry.par;
  if (raw.type === "timed") raw.timeLimitMs = clockFor(entry.par);
  return parseLevel(raw);
}

const cache = new Map<number, LevelDef>();

export function levelById(id: number): LevelDef | undefined {
  const cached = cache.get(id);
  if (cached) return cached;

  const authored = AUTHORED.get(id);
  const entry = SEEDS.get(id);
  const level = authored
    ? parseLevel(authored)
    : entry
      ? buildGenerated(entry)
      : undefined;
  if (level) cache.set(id, level);
  return level;
}

export function nextLevelId(id: number): number | null {
  const index = LEVEL_IDS.indexOf(id);
  return index === -1 ? null : (LEVEL_IDS[index + 1] ?? null);
}

/** Every level, built. For the tools and the tests — the app never needs them all. */
export function allLevels(): LevelDef[] {
  return LEVEL_IDS.map((id) => levelById(id)!);
}
