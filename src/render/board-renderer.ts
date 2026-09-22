import type { Arrow, Block, Cell, GameState } from "@/engine/types";
import type { AnimationPlan } from "./animation";
import { easeOut, phaseAt, shakeOffset } from "./animation";
import type { Camera } from "./camera";
import { boardToScreen } from "./camera";
import type { Layout, Point } from "./layout";
import { blockRect, cellCentre, cellRect, laneExitPoint } from "./layout";
import { paletteEntry, THEME } from "./palette";
import { burst, hashString, settleOffset } from "./particles";
import { drawArrow, drawBlock, drawGlyph, outlineWidth, pipeWidth } from "./shapes";
import { directionUnit, trailPoints } from "./trail";

export interface GuideView {
  arrowId: string;
  /** Cells the ray covers before it is stopped. */
  clear: Cell[];
  /** True when something is standing in the way. */
  blocked: boolean;
  targetBlockId: string | null;
  /**
   * Blocks the shot also reaches: a bomb's two neighbours, so the area effect
   * is visible before the tap and not after (ART.md 3.2).
   */
  splashBlockIds?: readonly string[];
}

export interface RenderInput {
  state: GameState;
  layout: Layout;
  camera: Camera;
  viewport: { width: number; height: number };
  /** Press-and-hold exit-ray guide (ART.md 3.2). */
  guide?: GuideView | null;
  /** Blocker highlight after a blocked tap (ART.md 6.2). */
  pulse?: { arrowIds: readonly string[]; t: number } | null;
  animation?: { plan: AnimationPlan; elapsed: number } | null;
  /** Points the last shot earned, floated off the block that was peeled. */
  gained?: number;
  /** Clock for the idle bob; omitted under reduced motion. */
  now?: number;
  /** Grid lines help trace a tangle; off by default. */
  showGrid: boolean;
  /** Turns the glyph redundancy up rather than on (ART.md 2.2). */
  highContrastGlyphs?: boolean;
}

export function renderBoard(context: CanvasRenderingContext2D, input: RenderInput): void {
  const { layout, camera, viewport } = input;

  context.save();
  context.fillStyle = THEME.backdrop;
  context.fillRect(0, 0, viewport.width, viewport.height);

  // The whole board takes the hit when an arrow bounces, applied before the
  // camera transform so a zoomed board kicks by the same amount on screen.
  const shake = screenShake(input);
  context.translate(shake.x, shake.y);

  context.translate(camera.offset.x, camera.offset.y);
  context.scale(camera.scale, camera.scale);

  drawBoardSurface(context, layout, input.showGrid, input.state.level.mask);
  drawBlocks(context, input);
  drawArrows(context, input);
  if (input.guide) drawGuide(context, input, input.guide);

  drawFloatingScore(context, input);
  context.restore();

  if (input.guide) drawEdgeMarker(context, input, input.guide);
}

/** Board kick on a bounce, as a fraction of a cell. */
const SCREEN_SHAKE_RATIO = 0.09;
/** How far the exposed layer sinks before it springs back, per cell. */
const SETTLE_RATIO = 0.07;

/**
 * A mismatch is the one event the board itself reacts to: the arrow recoils
 * and the board kicks along the shot's own axis, so the two read as one
 * impact (ART.md 6). A blocked tap never shakes the board — nothing touched
 * anything there, and the blocker pulse is what explains it (ART.md 6.2).
 *
 * Reduced motion drops the recoil phase outright, so this returns zero.
 */
function screenShake(input: RenderInput): Point {
  const { animation, layout } = input;
  if (!animation || animation.plan.event !== "bounced") return { x: 0, y: 0 };

  const phase = phaseAt(animation.plan, animation.elapsed);
  if (phase?.kind !== "recoil") return { x: 0, y: 0 };

  const unit = directionUnit(animation.plan.arrow.dir);
  const amount = shakeOffset(phase.t, layout.cell * SCREEN_SHAKE_RATIO);
  return { x: unit.x * amount, y: unit.y * amount };
}

function drawBoardSurface(
  context: CanvasRenderingContext2D,
  layout: Layout,
  showGrid: boolean,
  mask: readonly Cell[] | undefined,
): void {
  context.save();
  context.fillStyle = THEME.board;
  if (mask) {
    // A shaped board is the silhouette itself, not a rectangle with empty
    // corners: the cells are filled one by one, slightly overlapping so the
    // outline reads as one surface (DESIGN.md 1.10).
    const bleed = 1;
    for (const cell of mask) {
      const rect = cellRect(layout, cell);
      context.fillRect(
        rect.x - bleed,
        rect.y - bleed,
        rect.width + bleed * 2,
        rect.height + bleed * 2,
      );
    }
  } else {
    // The grid only: the frame sits outside it with a visible gap, so "on the
    // board" and "on the frame" are never ambiguous (ART.md 5).
    context.fillRect(
      layout.origin.x,
      layout.origin.y,
      layout.cols * layout.cell,
      layout.rows * layout.cell,
    );
  }

  if (showGrid) {
    if (mask) {
      // Grid lines only make sense where there is a board to trace.
      context.beginPath();
      for (const cell of mask) {
        const rect = cellRect(layout, cell);
        context.rect(rect.x, rect.y, rect.width, rect.height);
      }
      context.strokeStyle = THEME.disabledInk;
      context.globalAlpha = 0.25;
      context.lineWidth = 1;
      context.stroke();
      context.restore();
      return;
    }
    context.strokeStyle = THEME.disabledInk;
    context.globalAlpha = 0.25;
    context.lineWidth = 1;
    context.beginPath();
    for (let col = 0; col <= layout.cols; col += 1) {
      const x = layout.origin.x + col * layout.cell;
      context.moveTo(x, layout.origin.y);
      context.lineTo(x, layout.origin.y + layout.rows * layout.cell);
    }
    for (let row = 0; row <= layout.rows; row += 1) {
      const y = layout.origin.y + row * layout.cell;
      context.moveTo(layout.origin.x, y);
      context.lineTo(layout.origin.x + layout.cols * layout.cell, y);
    }
    context.stroke();
  }

  context.restore();
}

function drawBlocks(context: CanvasRenderingContext2D, input: RenderInput): void {
  const { state, layout, animation, guide } = input;
  const phase = animation ? phaseAt(animation.plan, animation.elapsed) : null;
  const hit = animation?.plan.block;

  for (const block of state.blocks) {
    const isHit = phase?.kind === "impact" && block.id === hit?.id;
    const flash = isHit ? 1 - phase.t : 0;
    // The layer the slab was hiding drops in and springs back, which is what
    // makes a peel read as a stack losing its top rather than as a recolour.
    const settle =
      isHit && animation?.plan.event === "peeled"
        ? settleOffset(phase.t, layout.cell * SETTLE_RATIO)
        : 0;
    const inward = innerDirection(block.side);

    context.save();
    context.translate(inward.x * settle, inward.y * settle);
    drawBlock(context, layout, block, blockRect(layout, block), {
      flash,
      highlighted:
        guide?.targetBlockId === block.id ||
        (guide?.splashBlockIds?.includes(block.id) ?? false),
      highContrastGlyph: input.highContrastGlyphs ?? false,
    });
    context.restore();
  }

  // The slab that came off is thrown, and a block destroyed this turn is
  // already gone from the state, so its whole shatter is thrown instead — the
  // frame gap it leaves behind is the point (ART.md 6).
  if (hit && phase?.kind === "impact" && animation?.plan.event === "peeled") {
    drawShards(context, layout, hit, phase.t, "peel");
  }
  if (hit && phase?.kind === "shatter") {
    drawShards(context, layout, hit, phase.t, "shatter");
  }
}

/**
 * The shards of one slab (a peel) or of a whole block (a shatter). The burst
 * is deterministic per block, so a frame of it can be asserted in a test.
 */
function drawShards(
  context: CanvasRenderingContext2D,
  layout: Layout,
  block: Block,
  t: number,
  kind: "peel" | "shatter",
): void {
  const rect = blockRect(layout, block);
  const entry = paletteEntry(block.layers[0] ?? "v");
  const whole = kind === "shatter";

  const shards = burst({
    seed: hashString(block.id),
    count: whole ? 9 : 6,
    t,
    origin: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    spread: layout.cell * (whole ? 0.95 : 0.5),
    size: Math.min(rect.width, rect.height) * (whole ? 0.34 : 0.26),
    gravity: layout.cell * (whole ? 0.4 : 0.18),
  });

  context.save();
  context.fillStyle = entry.fill;
  context.strokeStyle = THEME.ink;
  context.lineWidth = Math.max(1, outlineWidth(layout) * 0.6);

  for (const shard of shards) {
    context.save();
    context.globalAlpha = shard.alpha;
    context.translate(shard.centre.x, shard.centre.y);
    context.rotate(shard.rotation);
    // Outlined like everything else on the board: a bare fill of the yellow
    // would vanish against the board the moment it left the ink (ART.md 2.3).
    context.beginPath();
    context.rect(-shard.size / 2, -shard.size / 2, shard.size, shard.size);
    context.fill();
    context.stroke();
    context.restore();
  }

  context.restore();
}

/**
 * In-level feedback is wordless: a badge and a floating score, never text
 * over the board (PROGRESSION.md 2.1).
 */
function drawFloatingScore(context: CanvasRenderingContext2D, input: RenderInput): void {
  const { animation, layout, gained } = input;
  if (!animation || !gained) return;

  const block = animation.plan.block;
  if (!block) return;

  const elapsed = animation.elapsed;
  const slideMs =
    animation.plan.phases[0]?.kind === "slide" ? animation.plan.phases[0].durationMs : 0;
  if (elapsed < slideMs) return;

  const t = Math.min(1, (elapsed - slideMs) / 600);
  const rect = blockRect(layout, block);
  // Float inward, over the board: outside the frame the number would sit on
  // the backdrop, where board ink is unreadable.
  const inward = innerDirection(block.side);
  const drift = layout.cell * (0.5 + t * 0.7);

  context.save();
  context.globalAlpha = 1 - t;
  context.fillStyle = THEME.ink;
  context.font = `700 ${layout.cell * 0.42}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    `+${gained}`,
    rect.x + rect.width / 2 + inward.x * drift,
    rect.y + rect.height / 2 + inward.y * drift,
  );
  context.restore();
}

/** Points from a frame side towards the middle of the board. */
function innerDirection(side: Block["side"]): Point {
  switch (side) {
    case "top":
      return { x: 0, y: 1 };
    case "bottom":
      return { x: 0, y: -1 };
    case "left":
      return { x: 1, y: 0 };
    case "right":
      return { x: -1, y: 0 };
  }
}

function drawArrows(context: CanvasRenderingContext2D, input: RenderInput): void {
  const { state, layout, animation, pulse } = input;
  const phase = animation ? phaseAt(animation.plan, animation.elapsed) : null;
  const animatedId = phase ? animation?.plan.arrow.id : undefined;

  for (const arrow of state.arrows) {
    if (arrow.id === animatedId) continue;

    // Every arrow bobs: a blocked one is drawn exactly like any other, and
    // what it runs into is read off the board or off the hold guide.
    const bob =
      input.now === undefined
        ? 0
        : Math.sin(input.now / 900 + hashId(arrow.id)) * layout.cell * 0.02;

    drawArrow(context, layout, arrow, {
      pulse: pulse?.arrowIds.includes(arrow.id) ? 1 - pulse.t : 0,
      offset: { x: 0, y: bob },
      highContrastGlyph: input.highContrastGlyphs ?? false,
    });
  }

  // Once the arrow has landed it is gone: the impact frame is the last one
  // that draws it, and the shatter belongs to the block.
  if (phase && animation && phase.kind !== "shatter") {
    drawAnimatedArrow(
      context,
      layout,
      animation,
      phase.kind,
      phase.t,
      input.highContrastGlyphs ?? false,
    );
  }
}

/** Spreads the idle bob so a board of arrows does not pulse in unison. */
function hashId(id: string): number {
  return (hashString(id) % 628) / 100;
}

function drawAnimatedArrow(
  context: CanvasRenderingContext2D,
  layout: Layout,
  animation: { plan: AnimationPlan; elapsed: number },
  kind: string,
  t: number,
  highContrastGlyph: boolean,
): void {
  const { plan } = animation;
  const arrow = plan.arrow;
  // Far enough that the head reaches into the frame gap, not just the last cell.
  const distance = plan.travel * layout.cell + layout.gap;
  const unit = directionUnit(arrow.dir);

  let travelled = 0;
  let offset: Point = { x: 0, y: 0 };
  let alpha = 1;

  if (kind === "slide") {
    travelled = easeOut(t) * distance;
    alpha = plan.event === "flewOff" ? 1 - t * 0.9 : 1;
  } else if (kind === "impact") {
    travelled = distance;
    alpha = 1 - t;
  } else if (kind === "recoil") {
    // Both mistakes shake hard and leave the board exactly as it was. A
    // bounce slides back down its own track first, so the arrow is never seen
    // to teleport home.
    travelled = plan.event === "bounced" ? distance * (1 - t) : 0;
    const shake = shakeOffset(t, layout.cell * 0.14);
    offset = { x: unit.y * shake, y: unit.x * shake };
  }

  // The body runs along the head's own track, so a bend travels back down the
  // arrow instead of the whole shape drifting sideways (DESIGN.md 1.4).
  drawArrow(context, layout, arrow, {
    offset,
    alpha,
    highContrastGlyph,
    ...(travelled > 0 ? { points: trailPoints(layout, arrow, travelled) } : {}),
  });
}

function drawGuide(
  context: CanvasRenderingContext2D,
  input: RenderInput,
  guide: GuideView,
): void {
  const { state, layout } = input;
  const arrow = state.arrows.find((candidate) => candidate.id === guide.arrowId);
  if (!arrow) return;

  const head = arrow.path[arrow.path.length - 1]!;
  const from = cellCentre(layout, head);
  const last = guide.clear[guide.clear.length - 1];
  const to = last ? cellCentre(layout, last) : from;

  context.save();
  context.lineCap = "round";
  context.lineWidth = pipeWidth(layout) * 0.45;
  context.globalAlpha = 0.5;
  // Clear rays are drawn in the arrow's own colour; a blocked one stops at
  // the obstruction and is drawn in the disabled ink.
  context.strokeStyle = guide.blocked
    ? THEME.disabledInk
    : paletteEntry(arrow.color).fill;
  context.setLineDash([layout.cell * 0.18, layout.cell * 0.16]);

  context.beginPath();
  context.moveTo(from.x, from.y);
  if (!guide.blocked) {
    const exit = laneExitPoint(layout, sideFor(arrow.dir), laneFor(arrow));
    context.lineTo(exit.x, exit.y);
  } else {
    context.lineTo(to.x, to.y);
  }
  context.stroke();
  context.restore();
}

function sideFor(dir: Arrow["dir"]): "top" | "bottom" | "left" | "right" {
  return dir === "up"
    ? "top"
    : dir === "down"
      ? "bottom"
      : dir === "left"
        ? "left"
        : "right";
}

function laneFor(arrow: Arrow): number {
  const head = arrow.path[arrow.path.length - 1]!;
  return arrow.dir === "left" || arrow.dir === "right" ? head.row : head.col;
}

/**
 * Zoomed in, the target block may be off screen — and the decision the game
 * is about must never require zooming out to see (ART.md 4).
 */
function drawEdgeMarker(
  context: CanvasRenderingContext2D,
  input: RenderInput,
  guide: GuideView,
): void {
  const { state, layout, camera, viewport } = input;
  const block = state.blocks.find((candidate) => candidate.id === guide.targetBlockId);
  if (!block) return;

  const rect = blockRect(layout, block);
  const centre = boardToScreen(camera, {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  });

  const margin = 18;
  const onScreen =
    centre.x >= margin &&
    centre.x <= viewport.width - margin &&
    centre.y >= margin &&
    centre.y <= viewport.height - margin;
  if (onScreen) return;

  const marker = {
    x: Math.max(margin, Math.min(viewport.width - margin, centre.x)),
    y: Math.max(margin, Math.min(viewport.height - margin, centre.y)),
  };
  const entry = paletteEntry(block.layers[0] ?? "v");

  context.save();
  context.beginPath();
  context.arc(marker.x, marker.y, margin * 0.8, 0, Math.PI * 2);
  context.fillStyle = entry.fill;
  context.strokeStyle = THEME.ink;
  context.lineWidth = 2;
  context.fill();
  context.stroke();
  drawGlyph(context, marker, entry.glyph, layout, THEME.ink, {
    highContrast: input.highContrastGlyphs ?? false,
    scale: 0.22,
  });
  context.restore();
}

/** The cell an arrow's head must cross to leave the board, for the slide. */
export function travelCells(state: GameState, arrow: Arrow): number {
  const head = arrow.path[arrow.path.length - 1]!;
  const { cols, rows } = state.level;

  switch (arrow.dir) {
    case "up":
      return head.row + 1;
    case "down":
      return rows - head.row;
    case "left":
      return head.col + 1;
    case "right":
      return cols - head.col;
  }
}

/** Screen rect of a cell, for hit testing under the current camera. */
export function cellScreenRect(
  layout: Layout,
  camera: Camera,
  cell: Cell,
): { x: number; y: number; width: number; height: number } {
  const rect = cellRect(layout, cell);
  const point = boardToScreen(camera, rect);
  return {
    x: point.x,
    y: point.y,
    width: rect.width * camera.scale,
    height: rect.height * camera.scale,
  };
}
