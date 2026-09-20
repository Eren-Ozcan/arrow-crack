import type { Cell, LevelDef } from "@/engine/types";

/**
 * A level as it is authored on disk. It is a `LevelDef` except for the mask,
 * which is written as a grid of characters rather than a cell list
 * (DESIGN.md 1.10) — one row per board row, one character per cell:
 *
 *   "..##..",   `#` is playable, `.` is outside the silhouette
 *
 * Nothing else in the file is derived, so a level JSON stays something a
 * person can read and edit.
 */
export interface RawLevel extends Omit<LevelDef, "mask"> {
  maskRows?: string[];
}

export const MASK_PLAYABLE = "#";

/** Expands a character grid into the cell list the engine takes. */
export function parseMask(rows: string[], cols: number, boardRows: number): Cell[] {
  if (rows.length !== boardRows) {
    throw new Error(`mask has ${rows.length} rows, the board has ${boardRows}`);
  }

  const mask: Cell[] = [];
  rows.forEach((row, rowIndex) => {
    if (row.length !== cols) {
      throw new Error(
        `mask row ${rowIndex} has ${row.length} cells, the board has ${cols}`,
      );
    }
    for (let col = 0; col < cols; col += 1) {
      if (row[col] === MASK_PLAYABLE) mask.push({ col, row: rowIndex });
    }
  });

  if (mask.length === 0) throw new Error("mask has no playable cells");
  return mask;
}

/**
 * The authored form to the runtime form. Both the app and the tools load
 * levels through here, so the shipped game and the validation gate always see
 * exactly the same board.
 */
export function parseLevel(raw: RawLevel): LevelDef {
  const { maskRows, ...level } = raw;
  if (!maskRows) return level;
  return { ...level, mask: parseMask(maskRows, raw.cols, raw.rows) };
}
