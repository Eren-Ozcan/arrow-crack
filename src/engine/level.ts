import type { Arrow, Block, Cell, Dir, GameState, LevelDef, Side } from "./types";

/** Key for the occupancy index. Cells are small integers, so a string is fine. */
export function cellKey(cell: Cell): string {
  return `${cell.col},${cell.row}`;
}

export function step(cell: Cell, dir: Dir): Cell {
  switch (dir) {
    case "up":
      return { col: cell.col, row: cell.row - 1 };
    case "down":
      return { col: cell.col, row: cell.row + 1 };
    case "left":
      return { col: cell.col - 1, row: cell.row };
    case "right":
      return { col: cell.col + 1, row: cell.row };
  }
}

/** The frame side an arrow exits towards. */
export function sideOf(dir: Dir): Side {
  switch (dir) {
    case "up":
      return "top";
    case "down":
      return "bottom";
    case "left":
      return "left";
    case "right":
      return "right";
  }
}

export function headOf(arrow: Arrow): Cell {
  const head = arrow.path[arrow.path.length - 1];
  if (!head) throw new Error(`arrow ${arrow.id} has an empty path`);
  return head;
}

/**
 * The lane an arrow exits on, decided by its head alone (DESIGN.md 1.2):
 * the head's row when it faces left or right, its column when it faces up or
 * down. The body's shape never affects which block is hit.
 */
export function laneOf(arrow: Arrow): number {
  const head = headOf(arrow);
  return arrow.dir === "left" || arrow.dir === "right" ? head.row : head.col;
}

export function blockCoversLane(block: Block, lane: number): boolean {
  return lane >= block.start && lane < block.start + block.span;
}

/**
 * The block an arrow would hit, or undefined when the lane is open or its
 * block has already been destroyed (DESIGN.md 1.2).
 */
export function blockForArrow(blocks: readonly Block[], arrow: Arrow): Block | undefined {
  const side = sideOf(arrow.dir);
  const lane = laneOf(arrow);
  return blocks.find((block) => block.side === side && blockCoversLane(block, lane));
}

function inBounds(cell: Cell, level: LevelDef): boolean {
  return cell.col >= 0 && cell.col < level.cols && cell.row >= 0 && cell.row < level.rows;
}

function adjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

function dirBetween(from: Cell, to: Cell): Dir | undefined {
  if (to.col === from.col && to.row === from.row - 1) return "up";
  if (to.col === from.col && to.row === from.row + 1) return "down";
  if (to.col === from.col - 1 && to.row === from.row) return "left";
  if (to.col === from.col + 1 && to.row === from.row) return "right";
  return undefined;
}

/** Lane count on a side: columns for top/bottom, rows for left/right. */
export function laneCount(level: LevelDef, side: Side): number {
  return side === "top" || side === "bottom" ? level.cols : level.rows;
}

/**
 * Structural validation of a level definition. Returns one message per
 * problem, empty when the level is well formed. This is the shared
 * implementation behind the CI gate's schema and path-integrity checks
 * (`CI.md` 2.2); solvability is the solver's job, not this function's.
 */
export function validateLevel(level: LevelDef): string[] {
  const errors: string[] = [];

  if (level.cols < 1 || level.rows < 1) errors.push("board must be at least 1x1");
  if (level.hearts < 1) errors.push("hearts must be at least 1");
  if (level.palette.length === 0) errors.push("palette is empty");
  // Winning means destroying every block, so a level without one is unwinnable.
  if (level.blocks.length === 0) errors.push("level has no blocks");
  if (level.type === "timed" && level.timeLimitMs === undefined) {
    errors.push("timed level has no timeLimitMs");
  }
  if (level.type !== "timed" && level.timeLimitMs !== undefined) {
    errors.push("non-timed level has a timeLimitMs");
  }

  let maskKeys: Set<string> | undefined;
  if (level.mask) {
    maskKeys = new Set(level.mask.map(cellKey));
    for (const cell of level.mask) {
      if (!inBounds(cell, level)) {
        errors.push(`mask cell ${cellKey(cell)} is off the board`);
      }
    }
  }

  const owner = new Map<string, string>();
  const arrowIds = new Set<string>();

  for (const arrow of level.arrows) {
    if (arrowIds.has(arrow.id)) errors.push(`duplicate arrow id ${arrow.id}`);
    arrowIds.add(arrow.id);

    if (!level.palette.includes(arrow.color)) {
      errors.push(`arrow ${arrow.id} uses colour ${arrow.color}, not in the palette`);
    }

    if (arrow.path.length === 0) {
      errors.push(`arrow ${arrow.id} has an empty path`);
      continue;
    }

    const seen = new Set<string>();
    for (const [index, cell] of arrow.path.entries()) {
      const key = cellKey(cell);

      if (!inBounds(cell, level)) {
        errors.push(`arrow ${arrow.id} leaves the board at ${key}`);
      }
      if (maskKeys && !maskKeys.has(key)) {
        errors.push(`arrow ${arrow.id} occupies ${key}, outside the mask`);
      }
      if (seen.has(key)) {
        errors.push(`arrow ${arrow.id} crosses itself at ${key}`);
      }
      seen.add(key);

      const taken = owner.get(key);
      if (taken !== undefined) {
        errors.push(`arrows ${taken} and ${arrow.id} overlap at ${key}`);
      } else {
        owner.set(key, arrow.id);
      }

      const previous = arrow.path[index - 1];
      if (previous && !adjacent(previous, cell)) {
        errors.push(
          `arrow ${arrow.id} is disconnected between ${cellKey(previous)} and ${key}`,
        );
      }
    }

    const last = arrow.path[arrow.path.length - 1];
    const beforeLast = arrow.path[arrow.path.length - 2];
    if (last && beforeLast) {
      const segment = dirBetween(beforeLast, last);
      if (segment !== undefined && segment !== arrow.dir) {
        errors.push(
          `arrow ${arrow.id} faces ${arrow.dir} but its final segment runs ${segment}`,
        );
      }
    }
  }

  const blockIds = new Set<string>();
  const laneTaken = new Map<string, string>();

  for (const block of level.blocks) {
    if (blockIds.has(block.id)) errors.push(`duplicate block id ${block.id}`);
    blockIds.add(block.id);

    if (block.layers.length === 0) {
      errors.push(`block ${block.id} has no layers`);
    }
    for (const layer of block.layers) {
      if (!level.palette.includes(layer)) {
        errors.push(`block ${block.id} has layer ${layer}, not in the palette`);
      }
    }
    if (block.span < 1) errors.push(`block ${block.id} has a span below 1`);

    const lanes = laneCount(level, block.side);
    if (block.start < 0 || block.start + block.span > lanes) {
      errors.push(`block ${block.id} covers lanes outside the ${block.side} side`);
    }

    for (let lane = block.start; lane < block.start + block.span; lane += 1) {
      const key = `${block.side}:${lane}`;
      const taken = laneTaken.get(key);
      if (taken !== undefined) {
        errors.push(`blocks ${taken} and ${block.id} both cover ${key}`);
      } else {
        laneTaken.set(key, block.id);
      }
    }
  }

  return errors;
}

export function buildOccupancy(arrows: readonly Arrow[]): Map<string, string> {
  const occupancy = new Map<string, string>();
  for (const arrow of arrows) {
    for (const cell of arrow.path) occupancy.set(cellKey(cell), arrow.id);
  }
  return occupancy;
}

/** Fresh runtime state for a level. Hearts refill on every entry (DESIGN.md 1.5). */
export function createState(level: LevelDef): GameState {
  const errors = validateLevel(level);
  if (errors.length > 0) {
    throw new Error(`level ${level.id} is invalid: ${errors.join("; ")}`);
  }

  return {
    level,
    arrows: level.arrows,
    blocks: level.blocks,
    heartsLeft: level.hearts,
    mistakes: 0,
    continuesUsed: 0,
    status: "playing",
    occupancy: buildOccupancy(level.arrows),
  };
}
