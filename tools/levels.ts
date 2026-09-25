import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LevelDef } from "../src/engine/types";
import { parseLevel } from "../src/levels/parse";
import type { RawLevel } from "../src/levels/parse";

export const LEVELS_DIR = join(process.cwd(), "src", "levels", "data");

export interface LoadedLevel {
  file: string;
  level: LevelDef;
}

/** Every level JSON in the bundle, sorted by filename. */
export async function loadLevels(dir = LEVELS_DIR): Promise<LoadedLevel[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files = entries.filter((name) => name.endsWith(".json")).sort();
  const levels: LoadedLevel[] = [];

  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf8");
    levels.push({ file, level: parseLevel(JSON.parse(raw) as RawLevel) });
  }

  return levels;
}

/**
 * Every level the app ships: the authored JSON plus every generated row,
 * rebuilt exactly the way the device rebuilds it. A generated level is
 * labelled by its row rather than a file, since it has none.
 */
export async function loadAll(): Promise<LoadedLevel[]> {
  const authored = await loadLevels();
  const { GENERATED, buildGenerated } = await import("../src/levels/index");
  const generated = GENERATED.map((entry) => ({
    file: `generated.json#${entry.id}`,
    level: buildGenerated(entry),
  }));
  return [...authored, ...generated].sort((a, b) => a.level.id - b.level.id);
}
