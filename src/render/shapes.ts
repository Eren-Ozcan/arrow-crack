import type { Arrow, Block, Cell } from "@/engine/types";
import type { Layout, Point } from "./layout";
import { cellCentre } from "./layout";
import type { Glyph } from "./palette";
import { mix, PALETTE, paletteEntry, THEME } from "./palette";

/**
 * Everything on the board is drawn procedurally (ART.md 8), flat and seen
 * straight on: an arrow is a coloured stroke over a heavier ink stroke, with
 * an open chevron head and the glyph on its tail; a block is a flat face with
 * the layers underneath shown as nested bands on the same plane. Nothing is
 * drawn with thickness, and nothing is offset to fake depth.
 */

/** Stroke width as a fraction of the cell, leaving a gutter between runs. */
const PIPE_RATIO = 0.14;
/**
 * The ink stroke the colour is drawn over. Two same-coloured arrows lying
 * side by side must still read as two objects, and this is what solves it
 * (ART.md 3) — so it is a backing, not an outline around a fill.
 */
const OUTLINE_RATIO = 0.05;
/**
 * The chevron's arm length. It has to stay comfortably longer than the
 * backing is wide, or the two arms merge into a blob instead of reading as
 * a V — which is the whole of the direction signal.
 */
const HEAD_RATIO = 0.34;
/**
 * How far short of the head the stroke stops. It has to clear the chevron's
 * own width: a rounded cap left showing behind the head turns the silhouette
 * into a spade, which is the shape of neither an arrow nor a direction.
 */
const HEAD_INSET_RATIO = 0.3;
/** The tail glyph rides on the stroke, so it cannot be wider than it. */
const GLYPH_RATIO = 0.1;
/** A Ghost is translucent, and its outline is the only dashed one on the board. */
const GHOST_ALPHA = 0.5;
/** Band length of a Joker's pipe, as a fraction of the cell (ART.md 3.1). */
const JOKER_BAND_RATIO = 0.5;

export interface ArrowStyle {
  /** 0-1; the blocker highlight pulse (ART.md 6.2). */
  pulse?: number;
  /** Turns the glyph redundancy up rather than on (ART.md 2.2). */
  highContrastGlyph?: boolean;
  /** Board-space offset, used for the idle bob and the mistake shake. */
  offset?: Point;
  /**
   * Centre-line to draw instead of the arrow's resting one, tail first. The
   * firing animation uses it to run the body along the head's own track.
   */
  points?: Point[];
  /** 0-1, for a fading arrow. */
  alpha?: number;
  /**
   * The arrow that was tapped wrong: the body is drawn in the damage red and
   * stays there until another arrow is tapped (ART.md 6).
   */
  wrong?: boolean;
}

export function pipeWidth(layout: Layout): number {
  return layout.cell * PIPE_RATIO;
}

export function outlineWidth(layout: Layout): number {
  return Math.max(1.5, layout.cell * OUTLINE_RATIO);
}

/** Width of the ink backing: the coloured stroke plus an ink edge each side. */
export function backingWidth(layout: Layout): number {
  return pipeWidth(layout) + outlineWidth(layout) * 2;
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
  // A wrong tap paints the whole body red and holds it there until another
  // arrow is tapped (ART.md 6). The tail glyph is left alone: it is what
  // still says which colour the arrow is while the red is on it.
  const fill = style.wrong ? THEME.wrong : entry.fill;
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
    // Long enough that a shaft still shows once the head's inset is taken
    // off it: a one-cell arrow with a stub reads as a keyhole, not an arrow.
    points[0] = {
      x: head.x - towards.x * layout.cell * 0.72,
      y: head.y - towards.y * layout.cell * 0.72,
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
    context.lineWidth = width + outline * 5;
    tracePipe(context, points, width / 2);
    context.stroke();
    context.restore();
  }

  // The backing first: two same-coloured arrows lying side by side must still
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
    {
      highContrast: style.highContrastGlyph ?? false,
    },
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

/** The one head that is not a chevron alone: a bullseye, with a small point
 * still at the very tip so a Bomb is read for direction like any other arrow
 * (ART.md 3.1). */
function drawBombHead(
  context: CanvasRenderingContext2D,
  head: Point,
  towards: Point,
  layout: Layout,
  fill: string,
  ink: string,
  outline: number,
): void {
  const radius = layout.cell * 0.27;
  const inkEdge = Math.max(1, layout.cell * 0.055);
  const light = mix(fill, "#FFFFFF", 0.55);

  // The point first, so the rings sit on top of its root.
  const tip = {
    x: head.x + towards.x * radius * 1.7,
    y: head.y + towards.y * radius * 1.7,
  };
  drawHead(context, tip, towards, layout, fill, ink, outline);

  const ring = (r: number, colour: string, edge: number): void => {
    context.beginPath();
    context.arc(head.x, head.y, r, 0, Math.PI * 2);
    context.fillStyle = colour;
    context.fill();
    context.strokeStyle = ink;
    context.lineWidth = edge;
    context.stroke();
  };

  context.save();
  ring(radius, fill, inkEdge);
  ring(radius * 0.64, light, inkEdge * 0.55);
  ring(radius * 0.28, fill, inkEdge * 0.55);
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
  const width = pipeWidth(layout);
  const angle = Math.atan2(towards.y, towards.x);

  context.save();
  context.translate(head.x, head.y);
  context.rotate(angle);

  // An open chevron drawn in the same two strokes as the body, so the head is
  // the body's own line turning a corner rather than a separate object.
  const trace = (): void => {
    context.beginPath();
    context.moveTo(-size, -size * 0.8);
    context.lineTo(0, 0);
    context.lineTo(-size, size * 0.8);
  };

  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = ink;
  context.lineWidth = width + outline * 2;
  trace();
  context.stroke();

  context.strokeStyle = fill;
  context.lineWidth = width;
  trace();
  context.stroke();
  context.restore();
}

export interface GlyphStyle {
  /** Same shapes, larger and in full ink: the accessibility option turns the
   * redundancy up, it does not turn it on (ART.md 2.2). */
  highContrast?: boolean;
  /** Fraction of a cell the glyph spans before the high-contrast bump. */
  scale?: number;
}

/** Ink alpha of the default embossed glyph; ART.md 2.3 floors it at 1.8:1. */
export const GLYPH_ALPHA = 0.45;
/** How much larger a high-contrast glyph is drawn. */
export const HIGH_CONTRAST_GLYPH_SCALE = 1.3;

export function drawGlyph(
  context: CanvasRenderingContext2D,
  centre: Point,
  /** "all" is the Joker's mark: every shape overlapped into one (ART.md 3.1). */
  glyph: Glyph | "all",
  layout: Layout,
  ink: string,
  style: GlyphStyle = {},
): void {
  const highContrast = style.highContrast ?? false;
  const size =
    layout.cell *
    (style.scale ?? GLYPH_RATIO) *
    (highContrast ? HIGH_CONTRAST_GLYPH_SCALE : 1);

  context.save();
  context.translate(centre.x, centre.y);
  // Embossed and low contrast by default: a player with normal colour vision
  // reads colour first and never notices the redundancy (ART.md 2.2).
  context.globalAlpha = highContrast ? 1 : GLYPH_ALPHA;
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
  /** The hairline that shows a block has been hit but not yet broken. */
  cracked?: boolean;
  /** Turns the glyph redundancy up rather than on (ART.md 2.2). */
  highContrastGlyph?: boolean;
  /** Outline for the press-and-hold target (ART.md 3.2). */
  highlighted?: boolean;
  alpha?: number;
}

/** How many layer bands are drawn before the count badge takes over. */
const MAX_VISIBLE_BANDS = 2;

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
  const band = Math.min(rect.width, rect.height) * 0.1;

  context.save();
  context.globalAlpha = style.alpha ?? 1;

  // The face owns the square; the layers underneath are nested bands hugging
  // the inside of the outline, on the same plane. Nothing is offset, because
  // nothing on this board is drawn with thickness (ART.md 5).
  context.fillStyle = entry.fill;
  context.strokeStyle = THEME.ink;
  context.lineWidth = outline * 1.6;
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, radius);
  context.fill();
  context.stroke();

  const hidden = block.layers.length - 1;
  const bands = Math.min(hidden, MAX_VISIBLE_BANDS);
  for (let index = 1; index <= bands; index += 1) {
    const layer = block.layers[index];
    if (!layer) continue;

    // Outermost band is the layer that comes next, so the order the player
    // will meet them reads from the outside in.
    const inset = outline * 0.8 + band * (index - 0.5);
    const width = rect.width - inset * 2;
    const height = rect.height - inset * 2;
    if (width <= band || height <= band) break;

    context.strokeStyle = paletteEntry(layer).fill;
    context.lineWidth = band;
    roundedRect(
      context,
      rect.x + inset,
      rect.y + inset,
      width,
      height,
      Math.max(1, radius - inset),
    );
    context.stroke();

    context.strokeStyle = THEME.ink;
    context.lineWidth = Math.max(1, outline * 0.5);
    roundedRect(
      context,
      rect.x + inset + band / 2,
      rect.y + inset + band / 2,
      width - band,
      height - band,
      Math.max(1, radius - inset - band / 2),
    );
    context.stroke();
  }

  if (style.flash) {
    context.save();
    context.globalAlpha = style.flash;
    context.fillStyle = "#FFFFFF";
    roundedRect(context, rect.x, rect.y, rect.width, rect.height, radius);
    context.fill();
    context.restore();
  }

  if (style.cracked) {
    drawCrack(context, layout, rect);
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
    { highContrast: style.highContrastGlyph ?? false, scale: vertical ? 0.26 : 0.3 },
  );

  // A deeper stack shows a count badge instead of an unreadable sandwich.
  if (hidden > MAX_VISIBLE_BANDS) {
    drawLayerCount(context, layout, rect, hidden - MAX_VISIBLE_BANDS);
  }

  context.restore();
}

/**
 * A hairline, half the weight of the outline: a cracked block has to read as
 * damaged without shouting over the colour it is matched against (ART.md 6).
 */
function drawCrack(
  context: CanvasRenderingContext2D,
  layout: Layout,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const { x, y, width, height } = rect;

  context.save();
  context.strokeStyle = THEME.ink;
  context.lineWidth = Math.max(1, outlineWidth(layout) * 0.5);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(x + width * 0.18, y);
  context.lineTo(x + width * 0.3, y + height * 0.34);
  context.lineTo(x + width * 0.22, y + height * 0.62);
  context.lineTo(x + width * 0.36, y + height);
  context.stroke();
  context.restore();
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
