import { cellKey, headOf, step } from "./level";
import type { Arrow, Cell, GameState } from "./types";

/**
 * The exit ray: the straight run ahead of the head, out to the board edge.
 * Only this decides whether a shot is possible (DESIGN.md 1.4), which is why
 * the renderer needs it too — a blocked arrow has to read as blocked before
 * the tap (ART.md 6.1).
 */
export function rayCells(state: GameState, arrow: Arrow): Cell[] {
  const { cols, rows } = state.level;
  const cells: Cell[] = [];

  let cell = step(headOf(arrow), arrow.dir);
  while (cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows) {
    cells.push(cell);
    cell = step(cell, arrow.dir);
  }

  return cells;
}

/**
 * The arrows standing in this one's way, nearest first. An arrow's own body
 * follows the route its head traced, so it is never among them.
 */
export function blockersOf(state: GameState, arrow: Arrow): string[] {
  // A Ghost passes straight through other arrows, so nothing ever blocks it
  // (DESIGN.md 1.11). It still obeys the colour rule.
  if (arrow.special === "ghost") return [];

  const blockers: string[] = [];

  for (const cell of rayCells(state, arrow)) {
    const occupant = state.occupancy.get(cellKey(cell));
    if (occupant !== undefined && occupant !== arrow.id && !blockers.includes(occupant)) {
      blockers.push(occupant);
    }
  }

  return blockers;
}

export function isBlocked(state: GameState, arrow: Arrow): boolean {
  return blockersOf(state, arrow).length > 0;
}

/** Where the ray stops: the cell before the first blocker, or the last cell. */
export function clearRay(state: GameState, arrow: Arrow): Cell[] {
  const cells = rayCells(state, arrow);
  // The Ghost's guide draws through every obstruction to the frame (ART.md 3.2).
  if (arrow.special === "ghost") return cells;

  const clear: Cell[] = [];

  for (const cell of cells) {
    const occupant = state.occupancy.get(cellKey(cell));
    if (occupant !== undefined && occupant !== arrow.id) break;
    clear.push(cell);
  }

  return clear;
}
