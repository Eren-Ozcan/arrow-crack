import type { Arrow, Block, Cell, Dir, LevelDef, Side } from "@/engine/types";

/**
 * A deterministic backward board builder, for tests only.
 *
 * It grows arrows inward from the frame and pushes each arrow's colour onto
 * its lane's layer stack, so firing the arrows in reverse placement order
 * always solves the board: every board it produces is solvable by
 * construction, which is what makes it useful for stressing the solver and
 * for property tests. It is **not** the shipping generator (DESIGN.md 4.2) —
 * there is no difficulty model, no wide blocks and no decoys here.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDES: Side[] = ["top", "bottom", "left", "right"];

/** The direction an arrow on this side faces, and the step that goes inward. */
const FACING: Record<Side, Dir> = {
  top: "up",
  bottom: "down",
  left: "left",
  right: "right",
};

function inwardStep(side: Side): Cell {
  switch (side) {
    case "top":
      return { col: 0, row: 1 };
    case "bottom":
      return { col: 0, row: -1 };
    case "left":
      return { col: 1, row: 0 };
    case "right":
      return { col: -1, row: 0 };
  }
}

function edgeCell(side: Side, lane: number, cols: number, rows: number): Cell {
  switch (side) {
    case "top":
      return { col: lane, row: 0 };
    case "bottom":
      return { col: lane, row: rows - 1 };
    case "left":
      return { col: 0, row: lane };
    case "right":
      return { col: cols - 1, row: lane };
  }
}

export interface BuildOptions {
  seed: number;
  cols: number;
  rows: number;
  palette: string[];
  arrows: number;
  /** Cells trailing back from the head, inclusive of the head. */
  maxBodyLength?: number;
  hearts?: number;
}

const NEIGHBOURS: Cell[] = [
  { col: 0, row: -1 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
  { col: 1, row: 0 },
];

export function buildLevel(id: number, options: BuildOptions): LevelDef {
  const { seed, cols, rows, palette, arrows: wanted } = options;
  const maxBody = options.maxBodyLength ?? 3;
  const random = mulberry32(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;

  const occupied = new Set<string>();
  const key = (cell: Cell): string => `${cell.col},${cell.row}`;
  const free = (cell: Cell): boolean =>
    cell.col >= 0 &&
    cell.col < cols &&
    cell.row >= 0 &&
    cell.row < rows &&
    !occupied.has(key(cell));

  const arrows: Arrow[] = [];
  const stacks = new Map<string, string[]>();

  for (let attempt = 0; attempt < wanted * 12 && arrows.length < wanted; attempt += 1) {
    const side = pick(SIDES);
    const laneCount = side === "top" || side === "bottom" ? cols : rows;
    const lane = Math.floor(random() * laneCount);
    const inward = inwardStep(side);

    // Walk inward from the frame; the head may sit anywhere in the free
    // prefix, so later arrows can grow across this one's exit ray.
    const candidates: Cell[] = [];
    let cursor = edgeCell(side, lane, cols, rows);
    while (free(cursor)) {
      candidates.push(cursor);
      cursor = { col: cursor.col + inward.col, row: cursor.row + inward.row };
    }
    if (candidates.length === 0) continue;

    const head = pick(candidates);
    const path: Cell[] = [head];
    occupied.add(key(head));

    const bodyLength = 1 + Math.floor(random() * maxBody);
    for (let grown = 1; grown < bodyLength; grown += 1) {
      const from = path[0]!;
      // The cell right behind the head is fixed: the head direction has to
      // agree with the final segment, so only later cells may bend.
      const choices =
        grown === 1
          ? [{ col: from.col + inward.col, row: from.row + inward.row }].filter(free)
          : NEIGHBOURS.map((delta) => ({
              col: from.col + delta.col,
              row: from.row + delta.row,
            })).filter(free);
      if (choices.length === 0) break;

      const next = pick(choices);
      path.unshift(next);
      occupied.add(key(next));
    }

    const color = pick(palette);
    arrows.push({ id: `a${arrows.length}`, color, dir: FACING[side], path });

    // Reverse placement order is firing order, so the newest arrow's colour
    // has to end up on top of its lane's stack.
    const stackKey = `${side}:${lane}`;
    const stack = stacks.get(stackKey) ?? [];
    stack.unshift(color);
    stacks.set(stackKey, stack);
  }

  const blocks: Block[] = [...stacks.entries()].map(([stackKey, layers], index) => {
    const [side, lane] = stackKey.split(":") as [Side, string];
    return {
      id: `b${index}`,
      side,
      start: Number(lane),
      span: 1,
      layers,
    };
  });

  const usedColors = new Set<string>([
    ...arrows.map((arrow) => arrow.color),
    ...blocks.flatMap((block) => block.layers),
  ]);

  return {
    id,
    cols,
    rows,
    arrows,
    blocks,
    hearts: options.hearts ?? 4,
    // Every move peels exactly one layer here, so the optimum is the layer
    // count; the solver is expected to agree.
    par: blocks.reduce((sum, block) => sum + block.layers.length, 0),
    palette: palette.filter((color) => usedColors.has(color)),
  };
}
