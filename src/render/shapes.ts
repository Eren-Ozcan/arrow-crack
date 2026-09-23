import type { Arrow, Block, Cell } from "@/engine/types";
import type { Layout, Point } from "./layout";
import { cellCentre } from "./layout";
import type { Glyph } from "./palette";
import { glyphInk, mix, PALETTE, paletteEntry, THEME } from "./palette";

/**
 * Everything on the board is drawn procedurally (ART.md 8) and seen straight
 * on: an arrow is a coloured stroke over a heavier stroke of its own dark,
 * with an open chevron head and, in colour-blind mode, the glyph on its tail;
 * a block is a face inside that same dark edge, with the layers underneath
 * shown as nested bands. No black ink anywhere — every edge on the board is
 * the colour's own dark tone (ART.md 1), which is what lets the board read as
 * moulded candy rather than as a diagram.
 */

/** Stroke width as a fraction of the cell, leaving a gutter between runs. */
const PIPE_RATIO = 0.14;
/**
 * The darker stroke the colour is drawn over. Two same-coloured arrows lying
 * side by side must still read as two objects, and this is what solves it
 * (ART.md 3) — so it is a backing, not an outline around a fill.
 */
const OUTLINE_RATIO = 0.05;
/** How far towards black an edge sits from the colour it edges (ART.md 1). */
const EDGE_DARKEN = 0.34;
/**
 * How far back towards white the rim of a guide's target block is lifted:
 * enough to pick the block out, not enough to read as a second colour.
 */
const HIGHLIGHT_LIFT = 0.42;
/** The two ends of the body's shading: light at the top, barely dark below. */
const FACE_LIGHT = 0.3;
const FACE_SHADE = 0.1;
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
/**
 * The joint patch: how far back along the body it starts, and how far towards
 * the point it reaches. Back far enough to cover the pipe's own ink cap;
 * forward only as far as the chevron still encloses the body, so the point
 * itself keeps its ink and stays the sharpest thing on the arrow.
 */
const JOINT_BACK_RATIO = 0.06;
const JOINT_REACH_RATIO = 0.19;
/**
 * The tail carries the colour glyph in colour-blind mode, and on the
 * narrowest shipped board a cell is 32dp — a glyph that rides the pipe alone
 * is under 4dp there, which the ART.md 10.1 and 10.2 stills show is no
 * redundancy at all. So the tail cap is widened into a knob and the glyph is
 * sized to the knob instead (ART.md 3). The knob is still a rounded end,
 * never a second point, so the head remains the only thing on the arrow that
 * says direction. With the mode off the knob is not drawn at all and the
 * arrow ends on its own rounded cap.
 */
const TAIL_RATIO = 0.3;
/** The tail glyph, as a fraction of the cell: it has to fit inside the knob. */
const GLYPH_RATIO = 0.22;
/** A Ghost is translucent, and its outline is the only dashed one on the board. */
const GHOST_ALPHA = 0.5;
/** Band length of a Joker's pipe, as a fraction of the cell (ART.md 3.1). */
const JOKER_BAND_RATIO = 0.5;

export interface ArrowStyle {
  /** 0-1; the blocker highlight pulse (ART.md 6.2). */
  pulse?: number;
  /** Draws the shape redundancy: the tail knob and its glyph (ART.md 2.2). */
  colourBlind?: boolean;
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

/**
 * The edge a colour is drawn over: its own dark, never black. One function
 * owns it so an arrow, a block, a knob and a chevron cannot drift apart.
 */
export function edgeColour(fill: string): string {
  return mix(fill, "#000000", EDGE_DARKEN);
}

/**
 * The body shading: light along the top, a touch of dark at the bottom. It is
 * a single vertical ramp over whatever is being drawn, so a bend and a
 * straight run are lit the same way — one light, from above (ART.md 1).
 */
function faceGradient(
  context: CanvasRenderingContext2D,
  fill: string,
  top: number,
  bottom: number,
): CanvasGradient {
  const gradient = context.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, mix(fill, "#FFFFFF", FACE_LIGHT));
  gradient.addColorStop(0.6, fill);
  gradient.addColorStop(1, mix(fill, "#000000", FACE_SHADE));
  return gradient;
}

export function pipeWidth(layout: Layout): number {
  return layout.cell * PIPE_RATIO;
}

export function outlineWidth(layout: Layout): number {
  return Math.max(1.5, layout.cell * OUTLINE_RATIO);
}

/** Width of the tail knob the glyph sits on, ink edge excluded. */
export function tailWidth(layout: Layout): number {
  return layout.cell * TAIL_RATIO;
}

/** Diameter of the tail glyph itself, at the default embossed size. */
export function glyphWidth(layout: Layout): number {
  return layout.cell * GLYPH_RATIO;
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
  const ink = edgeColour(fill);
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
    context.strokeStyle = ink;
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
  // The body is flat, and deliberately so. A face gradient works on a block
  // because a block is one rectangle lit from above; an arrow is a polyline
  // whose thickness runs vertically on one segment and horizontally on the
  // next, so a single ramp lights the body and the chevron differently and
  // prints a bright patch where they meet. Flat colour inside the edge reads
  // as moulded at every bend, which is what the tangle needs (ART.md 3).
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

  // The head is the body's own line turning a corner (ART.md 3), so nothing
  // is drawn across the place they meet. Both shapes carry their own ink
  // edge, and where they overlap those two edges printed a dark notch in the
  // mouth of the chevron — the arrow read as a shaft bolted to a separate
  // head. Laying the body's colour down once more over the joint, after the
  // head, erases it and leaves one continuous silhouette. The Ghost keeps its
  // notch: its whole outline is dashed on purpose, and a solid patch in the
  // middle of it would be the one continuous piece of a broken line.
  if (arrow.special !== "ghost" && arrow.special !== "bomb") {
    context.save();
    context.strokeStyle = fill;
    context.lineWidth = width;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(
      pipeEnd.x - towards.x * layout.cell * JOINT_BACK_RATIO,
      pipeEnd.y - towards.y * layout.cell * JOINT_BACK_RATIO,
    );
    context.lineTo(
      head.x - towards.x * layout.cell * JOINT_REACH_RATIO,
      head.y - towards.y * layout.cell * JOINT_REACH_RATIO,
    );
    context.stroke();
    context.restore();
  }

  // Flat by default: the tail is the pipe's own rounded cap, and the shape
  // redundancy is what colour-blind mode adds on top of it (ART.md 2.2).
  if (style.colourBlind) {
    drawTailKnob(context, points[0]!, layout, fill, ink, arrow.special === "ghost");
    drawGlyph(
      context,
      points[0]!,
      arrow.special === "joker" ? "all" : entry.glyph,
      layout,
      glyphInk(fill),
    );
  }

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
  /** Fraction of a cell the glyph spans. */
  scale?: number;
}

/**
 * The widened tail cap the glyph sits on. Drawn after the pipe so the ink
 * backing reads as one silhouette with it, and translucent for a Ghost like
 * the rest of that arrow's body.
 */
function drawTailKnob(
  context: CanvasRenderingContext2D,
  centre: Point,
  layout: Layout,
  fill: string,
  ink: string,
  ghost: boolean,
): void {
  const radius = (layout.cell * TAIL_RATIO) / 2;
  const outline = outlineWidth(layout);

  context.save();
  context.beginPath();
  context.arc(centre.x, centre.y, radius + outline, 0, Math.PI * 2);
  context.fillStyle = ink;
  context.fill();

  if (ghost) context.globalAlpha *= GHOST_ALPHA;
  context.beginPath();
  context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  context.fillStyle = faceGradient(context, fill, centre.y - radius, centre.y + radius);
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
  style: GlyphStyle = {},
): void {
  const size = layout.cell * (style.scale ?? GLYPH_RATIO);

  context.save();
  context.translate(centre.x, centre.y);
  // A glyph is only ever drawn in colour-blind mode, so it is printed in full
  // ink rather than embossed: it is the signal, not a hint under it.
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
  /** Draws the shape redundancy: the colour's glyph (ART.md 2.2). */
  colourBlind?: boolean;
  /** Lifts the rim of the press-and-hold target (ART.md 3.2). */
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
  // Nearly a pill on the short side of the frame: the roundness is what makes
  // a block read as moulded rather than as a panel (ART.md 5).
  const radius = Math.min(rect.width, rect.height) * 0.44;
  const band = Math.min(rect.width, rect.height) * 0.1;
  const edge = Math.max(2, Math.min(rect.width, rect.height) * 0.1);

  context.save();
  context.globalAlpha = style.alpha ?? 1;

  // The edge first, as a solid shape rather than a stroke: the face is then
  // inset into it, so the dark reads as the block's own moulded rim and not
  // as a line drawn around it (ART.md 5). A guide's target block lifts that
  // rim instead of gaining an outline: the block keeps its silhouette, and
  // the ray stays the only line on the board (ART.md 3.2).
  context.fillStyle = style.highlighted
    ? mix(edgeColour(entry.fill), "#FFFFFF", HIGHLIGHT_LIFT)
    : edgeColour(entry.fill);
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, radius);
  context.fill();

  context.fillStyle = faceGradient(context, entry.fill, rect.y, rect.y + rect.height);
  roundedRect(
    context,
    rect.x + edge,
    rect.y + edge,
    rect.width - edge * 2,
    rect.height - edge * 2,
    Math.max(1, radius - edge * 0.5),
  );
  context.fill();

  const hidden = block.layers.length - 1;
  const bands = Math.min(hidden, MAX_VISIBLE_BANDS);
  let drawn = 0;
  for (let index = 1; index <= bands; index += 1) {
    const layer = block.layers[index];
    if (!layer) continue;

    // Outermost band is the layer that comes next, so the order the player
    // will meet them reads from the outside in.
    const inset = edge + band * (index - 0.5);
    const width = rect.width - inset * 2;
    const height = rect.height - inset * 2;
    if (width <= band || height <= band) break;

    const layerFill = paletteEntry(layer).fill;
    context.strokeStyle = layerFill;
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

    context.strokeStyle = edgeColour(layerFill);
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
    drawn += 1;
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
    drawCrack(context, layout, rect, edgeColour(entry.fill));
  }

  // The glyph is sized to the face that is left once the layer bands have
  // taken their inset, not to the cell: a block on the short side of the
  // frame is a third the depth of one on the long side, and a mark sized to
  // the cell there filled the whole face and read as a hole in the block.
  if (style.colourBlind) {
    const free = Math.min(rect.width, rect.height) - (edge + band * drawn) * 2;
    drawGlyph(
      context,
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      entry.glyph,
      layout,
      glyphInk(entry.fill),
      { scale: Math.max(0, free * 0.5) / layout.cell },
    );
  }

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
  colour: string,
): void {
  const { x, y, width, height } = rect;

  context.save();
  context.strokeStyle = colour;
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
