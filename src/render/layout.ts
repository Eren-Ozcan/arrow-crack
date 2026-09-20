import type { Block, Cell, LevelDef, Side } from "@/engine/types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  cols: number;
  rows: number;
  /** Side of one grid cell, in logical pixels. */
  cell: number;
  /** Thickness of a frame slab. */
  frame: number;
  /** Gap between the grid and the frame, so "on the board" is never ambiguous. */
  gap: number;
  /** Top-left of the grid itself, frame excluded. */
  origin: Point;
  /** The whole board including frame and gap. */
  bounds: Rect;
}

const FRAME_RATIO = 0.62;
const GAP_RATIO = 0.18;
const MARGIN_RATIO = 0.06;

/**
 * Fit the grid plus its frame into the viewport (ART.md 5). The frame sits
 * outside the grid with a visible gap, and everything scales from the cell
 * size, so the layout is resolution independent.
 */
export function computeLayout(
  level: Pick<LevelDef, "cols" | "rows">,
  viewport: { width: number; height: number },
): Layout {
  const { cols, rows } = level;

  // Frame and gap cost the same on both sides, in cell units.
  const extra = 2 * (FRAME_RATIO + GAP_RATIO);
  const margin = Math.min(viewport.width, viewport.height) * MARGIN_RATIO;
  const usableWidth = Math.max(1, viewport.width - 2 * margin);
  const usableHeight = Math.max(1, viewport.height - 2 * margin);

  const cell = Math.min(usableWidth / (cols + extra), usableHeight / (rows + extra));
  const frame = cell * FRAME_RATIO;
  const gap = cell * GAP_RATIO;

  const width = cols * cell + 2 * (frame + gap);
  const height = rows * cell + 2 * (frame + gap);
  const boundsX = (viewport.width - width) / 2;
  const boundsY = (viewport.height - height) / 2;

  return {
    cols,
    rows,
    cell,
    frame,
    gap,
    origin: { x: boundsX + frame + gap, y: boundsY + frame + gap },
    bounds: { x: boundsX, y: boundsY, width, height },
  };
}

export function cellRect(layout: Layout, cell: Cell): Rect {
  return {
    x: layout.origin.x + cell.col * layout.cell,
    y: layout.origin.y + cell.row * layout.cell,
    width: layout.cell,
    height: layout.cell,
  };
}

export function cellCentre(layout: Layout, cell: Cell): Point {
  const rect = cellRect(layout, cell);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** The grid cell under a board-space point, or null when outside the grid. */
export function cellAt(layout: Layout, point: Point): Cell | null {
  const col = Math.floor((point.x - layout.origin.x) / layout.cell);
  const row = Math.floor((point.y - layout.origin.y) / layout.cell);
  if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return null;
  return { col, row };
}

/**
 * A frame block's slab. A wide block is one slab spanning its lanes, which is
 * exactly what the rule says it is.
 */
export function blockRect(layout: Layout, block: Block): Rect {
  const { cell, frame, gap, origin, cols, rows } = layout;
  const span = block.span * cell;
  const start = block.start * cell;

  switch (block.side) {
    case "top":
      return {
        x: origin.x + start,
        y: origin.y - gap - frame,
        width: span,
        height: frame,
      };
    case "bottom":
      return {
        x: origin.x + start,
        y: origin.y + rows * cell + gap,
        width: span,
        height: frame,
      };
    case "left":
      return {
        x: origin.x - gap - frame,
        y: origin.y + start,
        width: frame,
        height: span,
      };
    case "right":
      return {
        x: origin.x + cols * cell + gap,
        y: origin.y + start,
        width: frame,
        height: span,
      };
  }
}

/** Where an arrow leaving on this lane crosses the frame's inner edge. */
export function laneExitPoint(layout: Layout, side: Side, lane: number): Point {
  const { cell, gap, origin, cols, rows } = layout;
  const along = (lane + 0.5) * cell;

  switch (side) {
    case "top":
      return { x: origin.x + along, y: origin.y - gap };
    case "bottom":
      return { x: origin.x + along, y: origin.y + rows * cell + gap };
    case "left":
      return { x: origin.x - gap, y: origin.y + along };
    case "right":
      return { x: origin.x + cols * cell + gap, y: origin.y + along };
  }
}
