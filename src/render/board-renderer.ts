import type { Arrow, Block, Cell, GameState } from "@/engine/types";
import type { AnimationPlan } from "./animation";
import { easeOut, phaseAt, shakeOffset } from "./animation";
import type { Camera } from "./camera";
import { boardToScreen } from "./camera";
import type { Layout, Point } from "./layout";
import { blockRect, cellCentre, cellRect, laneExitPoint } from "./layout";
import { paletteEntry, THEME } from "./palette";
import { drawArrow, drawBlock, drawGlyph, pipeWidth } from "./shapes";
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
  /** Ids of arrows whose ray is blocked; drawn inert (ART.md 6.1). */
  blocked: ReadonlySet<string>;
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
}

export function renderBoard(context: CanvasRenderingContext2D, input: RenderInput): void {
  const { layout, camera, viewport } = input;

  context.save();
  context.fillStyle = THEME.backdrop;
  context.fillRect(0, 0, viewport.width, viewport.height);

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
  const hitBlockId = animation?.plan.block?.id;

  for (const block of state.blocks) {
    const flash = phase?.kind === "impact" && block.id === hitBlockId ? 1 - phase.t : 0;

    drawBlock(context, layout, block, blockRect(layout, block), {
      flash,
      highlighted:
        guide?.targetBlockId === block.id ||
        (guide?.splashBlockIds?.includes(block.id) ?? false),
    });
  }

  // A block destroyed this turn is already gone from the state; play its
  // shatter as a fading ghost so the frame gap becomes obvious.
  if (phase?.kind === "shatter" && animation?.plan.block) {
    drawShatter(context, layout, animation.plan.block, phase.t);
  }
}

function drawShatter(
  context: CanvasRenderingContext2D,
  layout: Layout,
  block: Block,
  t: number,
): void {
  const rect = blockRect(layout, block);
  const entry = paletteEntry(block.layers[0] ?? "v");
  const shards = 6;

  context.save();
  context.globalAlpha = 1 - t;
  context.fillStyle = entry.fill;

  for (let index = 0; index < shards; index += 1) {
    const angle = (index / shards) * Math.PI * 2 + t;
    const spread = layout.cell * 0.7 * t;
    const size = Math.min(rect.width, rect.height) * 0.34 * (1 - t * 0.5);

    context.save();
    context.translate(
      rect.x + rect.width / 2 + Math.cos(angle) * spread,
      rect.y + rect.height / 2 + Math.sin(angle) * spread,
    );
    context.rotate(angle);
    context.fillRect(-size / 2, -size / 2, size, size);
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
  const { state, layout, animation, blocked, pulse } = input;
  const phase = animation ? phaseAt(animation.plan, animation.elapsed) : null;
  const animatedId = phase ? animation?.plan.arrow.id : undefined;

  for (const arrow of state.arrows) {
    if (arrow.id === animatedId) continue;

    // A fireable arrow bobs slowly; a blocked one is completely still, which
    // is half of what makes the inert state readable (ART.md 6).
    const isBlockedArrow = blocked.has(arrow.id);
    const bob =
      input.now === undefined || isBlockedArrow
        ? 0
        : Math.sin(input.now / 900 + hashId(arrow.id)) * layout.cell * 0.02;

    drawArrow(context, layout, arrow, {
      blocked: isBlockedArrow,
      pulse: pulse?.arrowIds.includes(arrow.id) ? 1 - pulse.t : 0,
      offset: { x: 0, y: bob },
    });
  }

  // Once the arrow has landed it is gone: the impact frame is the last one
  // that draws it, and the shatter belongs to the block.
  if (phase && animation && phase.kind !== "shatter") {
    drawAnimatedArrow(context, layout, animation, phase.kind, phase.t);
  }
}

/** Spreads the idle bob so a board of arrows does not pulse in unison. */
function hashId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 628;
  }
  return hash / 100;
}

function drawAnimatedArrow(
  context: CanvasRenderingContext2D,
  layout: Layout,
  animation: { plan: AnimationPlan; elapsed: number },
  kind: string,
  t: number,
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
  drawGlyph(context, marker, entry.glyph, layout, THEME.ink, false, 0.22);
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
