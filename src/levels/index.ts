import type { LevelDef } from "@/engine/types";
import level001 from "./data/001.json";
import level002 from "./data/002.json";
import level003 from "./data/003.json";

/**
 * The bundled levels, in play order. Levels 1-30 are hand authored; 31 and up
 * are generated (DESIGN.md 4). Every one of them passes the gate in
 * `tools/validate-levels.ts` before it ships.
 */
export const LEVELS: LevelDef[] = [
  level001 as LevelDef,
  level002 as LevelDef,
  level003 as LevelDef,
];

export function levelById(id: number): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}

export function nextLevelId(id: number): number | null {
  const index = LEVELS.findIndex((level) => level.id === id);
  const next = index === -1 ? undefined : LEVELS[index + 1];
  return next ? next.id : null;
}
