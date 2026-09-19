import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LevelDef } from "../src/engine/types";

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
    levels.push({ file, level: JSON.parse(raw) as LevelDef });
  }

  return levels;
}
