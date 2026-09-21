import type { Arrow, Block, Cell } from "@/engine/types";
import type { Layout, Point } from "./layout";
import { cellCentre } from "./layout";
import type { Glyph } from "./palette";
import { PALETTE, paletteEntry, THEME } from "./palette";

/**
 * Everything on the board is drawn procedurally (ART.md 8): an arrow is a
 * heavy-outlined pipe with rounded bends, an oversized head and a rounded
 * tail carrying the glyph; a block is a slab with its remaining layers
 * showing as edges along the inner side.
 */

/** Pipe width as a fraction of the cell, leaving a gutter between runs. */
const PIPE_RATIO = 0.6;
const OUTLINE_RATIO = 0.1;
const HEAD_RATIO = 0.86;
/** How far short of the head cell the pipe stops, so the head reads as a head. */
const HEAD_INSET_RATIO = 0.3;
const GLYPH_RATIO = 0.3;
/** A Ghost is translucent, and its outline is the only dashed one on the board. */
const GHOST_ALPHA = 0.5;
/** Band length of a Joker's pipe, as a fraction of the cell (ART.md 3.1). */
const JOKER_BAND_RATIO = 0.5;

export interface ArrowStyle {
  /** 0-1; the blocker highlight pulse (ART.md 6.2). */
  pulse?: number;
  /** Board-space offset, used for the idle bob and the mistake shake. */
  offset?: Point;
  /**
   * Centre-line to draw instead of the arrow's resting one, tail first. The
   * firing animation uses it to run the body along the head's own track.
   */
  points?: Point[];
  /** 0-1, for a fading arrow. */
  alpha?: number;
}

export function pipeWidth(layout: Layout): number {
  return layout.cell * PIPE_RATIO;
}

export function outlineWidth(layout: Layout): number {
  return Math.max(1.5, layout.cell * OUTLINE_RATIO);
}

/** Centre-line of an arrow's path, tail first. */
export function pathPoints(layout: Layout, path: readonly Cell[]): Point[] {
  return path.map((cell) => cellCentre(layout, cell));
}

function tracePipe(
  context: CanvasRenderingContext2D,
  points: Point[],
  radius: number,
): void {
  context.beginPath();
  const [first] = points;
  if (!first) return;

  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    // Rounded bends follow the centre line, so the eye can trace a path
    // around a corner without losing it under a crossing neighbour.
    context.arcTo(current.x, current.y, next.x, next.y, radius);
  }

  const last = points[points.length - 1];
  if (last && points.length > 1) context.lineTo(last.x, last.y);
}

export function drawArrow(
  context: CanvasRenderingContext2D,
  layout: Layout,
  arrow: Arrow,
  style: ArrowStyle = {},
): void {
  const entry = paletteEntry(arrow.color);
  const fill = entry.fill;
  const ink = THEME.ink;
  const width = pipeWidth(layout);
  const outline = outlineWidth(layout);
  const offset = style.offset ?? { x: 0, y: 0 };

  const points = (style.points ?? pathPoints(layout, arrow.path)).map((point) => ({
    x: point.x + offset.x,
    y: point.y + offset.y,
  }));
  const head = points[points.length - 1]!;
  const beforeHead = points[points.length - 2] ?? head;

  // The pipe stops short of the head cell: a rounded cap poking out from
  // behind the arrowhead reads as a pencil, not as a direction.
  const inset = layout.cell * HEAD_INSET_RATIO;
  const towards = unitVector(beforeHead, head, arrow.dir);
  const pipeEnd = {
    x: head.x - towards.x * inset,
    y: head.y - towards.y * inset,
  };

  if (points.length === 1) {
    // A one-cell arrow still needs a body: a bare head has no tail to carry
    // the glyph, and no shape to tap.
    points[0] = {
      x: head.x - towards.x * layout.cell * 0.42,
      y: head.y - towards.y * layout.cell * 0.42,
    };
    points.push(pipeEnd);
  } else {
    points[points.length - 1] = pipeEnd;
  }

  context.save();
  context.globalAlpha = style.alpha ?? 1;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (style.pulse) {
    context.save();
    context.strokeStyle = THEME.ink;
    context.globalAlpha = (style.alpha ?? 1) * 0.35 * style.pulse;
    context.lineWidth = width + outline * 4;
    tracePipe(context, points, width / 2);
    context.stroke();
    context.restore();
  }

  // Outline first: two same-coloured arrows lying side by side must still
  // read as two objects (ART.md 3). A Ghost's is dashed, which is the one
  // silhouette on the board that is not continuous.
  context.strokeStyle = ink;
  context.lineWidth = width + outline * 2;
  if (arrow.special === "ghost")
    context.setLineDash([layout.cell * 0.22, layout.cell * 0.14]);
  tracePipe(context, points, width / 2);
  context.stroke();
  context.setLineDash([]);

  if (arrow.special === "ghost") context.globalAlpha = (style.alpha ?? 1) * GHOST_ALPHA;
  context.strokeStyle = fill;
  context.lineWidth = width;
  tracePipe(context, points, width / 2);
  context.stroke();

  // The Joker carries every palette colour as a repeating band, so it reads
  // as "not any colour" rather than as a sixth one (ART.md 3.1).
  if (arrow.special === "joker") drawJokerBands(context, points, layout, width);

  if (arrow.special === "bomb")
    drawBombHead(context, head, towards, layout, fill, ink, outline);
  else drawHead(context, head, towards, layout, fill, ink, outline);

  drawGlyph(
    context,
    points[0]!,
    arrow.special === "joker" ? "all" : entry.glyph,
    layout,
    ink,
    false,
  );

  context.restore();
}

/**
 * Bands of every palette colour along the pipe. They are drawn as a dashed
 * overlay, one dash per colour, offset so the cycle repeats along the body.
 */
function drawJokerBands(
  context: CanvasRenderingContext2D,
  points: Point[],
  layout: Layout,
  width: number,
): void {
  const colours = Object.values(PALETTE);
  const band = layout.cell * JOKER_BAND_RATIO;
  const cycle = band * colours.length;

  context.save();
  context.lineWidth = width;
  colours.forEach((colour, index) => {
    context.strokeStyle = colour.fill;
    context.setLineDash([band, cycle - band]);
    context.lineDashOffset = -band * index;
    tracePipe(context, points, width / 2);
    context.stroke();
  });
  context.restore();
}

/** The one head that is not a triangle: heavy, round, with a short fuse. */
function drawBombHead(
  context: CanvasRenderingContext2D,
  head: Point,
  towards: Point,
  layout: Layout,
  fill: string,
  ink: string,
  outline: number,
): void {
  const radius = layout.cell * HEAD_RATIO * 0.42;

  context.save();
  context.translate(head.x, head.y);
  context.rotate(Math.atan2(towards.y, towards.x));

  context.beginPath();
  context.moveTo(radius * 0.4, 0);
  context.quadraticCurveTo(radius * 1.5, -radius * 0.5, radius * 1.7, -radius * 1.1);
  context.strokeStyle = ink;
  context.lineWidth = outline * 1.5;
  context.stroke();

  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = outline * 2;
  context.stroke();
  context.restore();
}

function unitVector(from: Point, to: Point, dir: Arrow["dir"]): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length > 0) return { x: dx / length, y: dy / length };

  // A single-cell arrow has no segment to read the direction from.
  switch (dir) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

function drawHead(
  context: CanvasRenderingContext2D,
  head: Point,
  towards: Point,
  layout: Layout,
  fill: string,
  ink: string,
  outline: number,
): void {
  const size = layout.cell * HEAD_RATIO;
  const angle = Math.atan2(towards.y, towards.x);

  context.save();
  context.translate(head.x, head.y);
  context.rotate(angle);

  // The head is the only pointed end, oversized so direction reads at a
  // glance in a screen full of bends.
  context.beginPath();
  context.moveTo(size * 0.5, 0);
  context.lineTo(-size * 0.25, size * 0.42);
  context.lineTo(-size * 0.25, -size * 0.42);
  context.closePath();

  context.fillStyle = fill;
  context.strokeStyle = ink;
  context.lineWidth = outline * 2;
  context.stroke();
  context.fill();
  context.restore();
}

export function drawGlyph(
  context: CanvasRenderingContext2D,
  centre: Point,
  /** "all" is the Joker's mark: every shape overlapped into one (ART.md 3.1). */
  glyph: Glyph | "all",
  layout: Layout,
  ink: string,
  muted: boolean,
  scale = GLYPH_RATIO,
): void {
  const size = layout.cell * scale;

  context.save();
  context.translate(centre.x, centre.y);
  // Embossed and low contrast by default: a player with normal colour vision
  // reads colour first and never notices the redundancy (ART.md 2.2).
  context.globalAlpha = muted ? 0.3 : 0.45;
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.lineWidth = Math.max(1, size * 0.22);
  context.lineCap = "round";
  context.beginPath();

  switch (glyph) {
    case "all":
      // Outlined, not filled: overlapping five solid shapes is a blob.
      context.arc(0, 0, size / 2, 0, Math.PI * 2);
      context.moveTo(0, -size * 0.62);
      context.lineTo(size * 0.54, size * 0.36);
      context.lineTo(-size * 0.54, size * 0.36);
      context.closePath();
      context.rect(-size * 0.36, -size * 0.36, size * 0.72, size * 0.72);
      context.lineWidth = Math.max(1, size * 0.12);
      context.stroke();
      break;
    case "triangle":
      context.moveTo(0, -size / 2);
      context.lineTo(size / 2, size / 2);
      context.lineTo(-size / 2, size / 2);
      context.closePath();
      context.fill();
      break;
    case "circle":
      context.arc(0, 0, size / 2, 0, Math.PI * 2);
      context.fill();
      break;
    case "square":
      context.rect(-size / 2, -size / 2, size, size);
      context.fill();
      break;
    case "diamond":
      context.moveTo(0, -size / 2);
      context.lineTo(size / 2, 0);
      context.lineTo(0, size / 2);
      context.lineTo(-size / 2, 0);
      context.closePath();
      context.fill();
      break;
    case "cross":
      context.moveTo(-size / 2, -size / 2);
      context.lineTo(size / 2, size / 2);
      context.moveTo(size / 2, -size / 2);
      context.lineTo(-size / 2, size / 2);
      context.stroke();
      break;
  }

  context.restore();
}

export interface BlockStyle {
  /** 0-1, for the impact flash. */
  flash?: number;
  /** Outline for the press-and-hold target (ART.md 3.2). */
  highlighted?: boolean;
  alpha?: number;
}

/** How many layer edges are drawn before the count badge takes over. */
const MAX_VISIBLE_EDGES = 3;

export function drawBlock(
  context: CanvasRenderingContext2D,
  layout: Layout,
  block: Block,
  rect: { x: number; y: number; width: number; height: number },
  style: BlockStyle = {},
): void {
  const top = block.layers[0];
  if (!top) return;

  const entry = paletteEntry(top);
  const outline = outlineWidth(layout);
  const radius = Math.min(rect.width, rect.height) * 0.22;
  const vertical = block.side === "left" || block.side === "right";
  const edgeDepth = Math.min(rect.width, rect.height) * 0.16;

  context.save();
  context.globalAlpha = style.alpha ?? 1;

  // Layer edges, drawn along the inner side so the stack reads as a stack.
  const hidden = block.layers.length - 1;
  const edges = Math.min(hidden, MAX_VISIBLE_EDGES - 1);
  for (let index = edges; index >= 1; index -= 1) {
    const layer = block.layers[index];
    if (!layer) continue;

    const shift = index * edgeDepth;
    const inner = innerShift(block.side, shift);
    context.fillStyle = paletteEntry(layer).fill;
    context.strokeStyle = THEME.ink;
    context.lineWidth = outline;
    roundedRect(
      context,
      rect.x + inner.x,
      rect.y + inner.y,
      rect.width,
      rect.height,
      radius,
    );
    context.fill();
    context.stroke();
  }

  context.fillStyle = entry.fill;
  context.strokeStyle = THEME.ink;
  context.lineWidth = outline * 1.6;
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, radius);
  context.fill();
  context.stroke();

  if (style.flash) {
    context.save();
    context.globalAlpha = style.flash;
    context.fillStyle = "#FFFFFF";
    roundedRect(context, rect.x, rect.y, rect.width, rect.height, radius);
    context.fill();
    context.restore();
  }

  if (style.highlighted) {
    context.strokeStyle = THEME.ink;
    context.lineWidth = outline * 2.4;
    roundedRect(
      context,
      rect.x - outline,
      rect.y - outline,
      rect.width + outline * 2,
      rect.height + outline * 2,
      radius,
    );
    context.stroke();
  }

  drawGlyph(
    context,
    { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    entry.glyph,
    layout,
    THEME.ink,
    false,
    vertical ? 0.26 : 0.3,
  );

  // A deeper stack shows a count badge instead of an unreadable sandwich.
  if (hidden >= MAX_VISIBLE_EDGES) {
    drawLayerCount(context, layout, rect, hidden - (MAX_VISIBLE_EDGES - 1));
  }

  context.restore();
}

function innerShift(side: Block["side"], shift: number): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -shift };
    case "bottom":
      return { x: 0, y: shift };
    case "left":
      return { x: -shift, y: 0 };
    case "right":
      return { x: shift, y: 0 };
  }
}

function drawLayerCount(
  context: CanvasRenderingContext2D,
  layout: Layout,
  rect: { x: number; y: number; width: number; height: number },
  extra: number,
): void {
  const size = Math.min(rect.width, rect.height) * 0.42;

  context.save();
  context.fillStyle = THEME.ink;
  context.font = `600 ${size}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    `+${extra}`,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2 + layout.cell * 0.22,
  );
  context.restore();
}

export function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const limit = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + limit, y);
  context.arcTo(x + width, y, x + width, y + height, limit);
  context.arcTo(x + width, y + height, x, y + height, limit);
  context.arcTo(x, y + height, x, y, limit);
  context.arcTo(x, y, x + width, y, limit);
  context.closePath();
}
