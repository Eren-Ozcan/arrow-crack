import type { Arrow, Block, Cell, GameState } from "@/engine/types";
import type { AnimationPlan, PhaseProgress } from "./animation";
import { phaseAt, shakeOffset } from "./animation";
import type { Camera } from "./camera";
import { boardToScreen } from "./camera";
import type { Layout, Point } from "./layout";
import { blockRect, cellCentre, cellRect } from "./layout";
import { glyphInk, paletteEntry, THEME } from "./palette";
import { burst, hashString, settleOffset } from "./particles";
import {
  drawArrow,
  drawBlock,
  drawGlyph,
  edgeColour,
  outlineWidth,
  pipeWidth,
  roundedRect,
} from "./shapes";
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

/** One shot in flight: its plan, how far into it we are, and what it scored. */
export interface ShotAnimation {
  plan: AnimationPlan;
  elapsed: number;
  /** Points this shot earned, floated off the block it peeled. */
  gained?: number;
}

export interface RenderInput {
  state: GameState;
  layout: Layout;
  camera: Camera;
  viewport: { width: number; height: number };
  /**
   * The exit-ray guides on screen (ART.md 3.2): the arrow under the finger,
   * plus every arrow a previous hold left its line on. More than one at a
   * time is the point — an ordering question is about two arrows, not one.
   */
  guides?: readonly GuideView[] | null;
  /** Blocker highlight after a blocked tap (ART.md 6.2). */
  pulse?: { arrowIds: readonly string[]; t: number } | null;
  /**
   * Every shot still playing. A tap is never held back for the one before it
   * (DESIGN.md 5), so more than one body can be in the air, and each carries
   * the points it earned rather than the board carrying the last shot's.
   */
  animations?: readonly ShotAnimation[] | null;
  /** Clock for the idle bob; omitted under reduced motion. */
  now?: number;
  /** Grid lines help trace a tangle; off by default. */
  showGrid: boolean;
  /** Draws each colour's own shape on top of the colour (ART.md 2.2). */
  colourBlindMode?: boolean;
  /**
   * The arrow that was tapped wrong. It is drawn red and stays red until
   * another arrow is tapped (ART.md 6).
   */
  wrongArrowId?: string | null;
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
  for (const guide of input.guides ?? []) drawGuide(context, input, guide);

  drawFloatingScore(context, input);
  context.restore();

  for (const guide of input.guides ?? []) drawEdgeMarker(context, input, guide);
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
  const { layout } = input;
  let shake: Point = { x: 0, y: 0 };

  // Two mismatches at once kick the board twice; the axes add rather than one
  // of them winning, which is what two impacts actually feel like.
  for (const animation of input.animations ?? []) {
    if (animation.plan.event !== "bounced") continue;

    const phase = phaseAt(animation.plan, animation.elapsed);
    if (phase?.kind !== "recoil") continue;

    const unit = directionUnit(animation.plan.arrow.dir);
    const amount = shakeOffset(phase.t, layout.cell * SCREEN_SHAKE_RATIO);
    shake = { x: shake.x + unit.x * amount, y: shake.y + unit.y * amount };
  }

  return shake;
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
  const { state, layout } = input;
  const guides = input.guides ?? [];
  const playing = livePhases(input);

  // The reducer resolves a shot at the tap, but the block it hit may not come
  // apart until the head arrives: while a body is still sliding its target is
  // drawn as it was, layers and all, and a block that shot destroyed is added
  // back for the slide (ART.md 6). The oldest shot still on its way wins,
  // because a block two shots are heading for has not met either of them yet.
  const pending = new Map<string, Block>();
  for (const { animation, phase } of playing) {
    const block = animation.plan.block;
    if (phase.kind !== "slide" || !block || pending.has(block.id)) continue;
    pending.set(block.id, block);
  }

  const landed = playing.find(({ phase }) => phase.kind === "impact");
  const hit = landed?.animation.plan.block;
  const impact = landed?.phase;

  const blocks = state.blocks.map((block) => pending.get(block.id) ?? block);
  for (const [id, block] of pending) {
    if (!state.blocks.some((candidate) => candidate.id === id)) blocks.push(block);
  }

  for (const block of blocks) {
    const isHit = impact !== undefined && block.id === hit?.id;
    const flash = isHit ? 1 - impact.t : 0;
    // The layer the slab was hiding drops in and springs back, which is what
    // makes a peel read as a stack losing its top rather than as a recolour.
    const settle =
      isHit && landed?.animation.plan.event === "peeled"
        ? settleOffset(impact.t, layout.cell * SETTLE_RATIO)
        : 0;
    const inward = innerDirection(block.side);

    context.save();
    context.translate(inward.x * settle, inward.y * settle);
    drawBlock(context, layout, block, blockRect(layout, block), {
      flash,
      highlighted: guides.some(
        (guide) =>
          guide.targetBlockId === block.id ||
          (guide.splashBlockIds?.includes(block.id) ?? false),
      ),
      colourBlind: input.colourBlindMode ?? false,
    });
    context.restore();
  }

  // The slab that came off is thrown, and a block destroyed this turn is
  // already gone from the state, so its whole shatter is thrown instead — the
  // frame gap it leaves behind is the point (ART.md 6).
  for (const { animation, phase } of playing) {
    const block = animation.plan.block;
    if (!block) continue;
    if (phase.kind === "impact" && animation.plan.event === "peeled") {
      drawShards(context, layout, block, phase.t, "peel");
    }
    if (phase.kind === "shatter") {
      drawShards(context, layout, block, phase.t, "shatter");
    }
  }
}

/** The shots still on screen this frame, oldest first, with where each is. */
function livePhases(
  input: RenderInput,
): { animation: ShotAnimation; phase: PhaseProgress }[] {
  const live: { animation: ShotAnimation; phase: PhaseProgress }[] = [];
  for (const animation of input.animations ?? []) {
    const phase = phaseAt(animation.plan, animation.elapsed);
    if (phase) live.push({ animation, phase });
  }
  return live;
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
    count: whole ? 6 : 4,
    t,
    origin: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    spread: layout.cell * (whole ? 1.05 : 0.55),
    size: Math.min(rect.width, rect.height) * (whole ? 0.38 : 0.28),
    gravity: layout.cell * (whole ? 0.4 : 0.18),
  });

  context.save();
  context.fillStyle = entry.fill;
  context.strokeStyle = edgeColour(entry.fill);
  context.lineWidth = Math.max(1, outlineWidth(layout) * 0.6);

  for (const shard of shards) {
    context.save();
    context.globalAlpha = shard.alpha;
    context.translate(shard.centre.x, shard.centre.y);
    context.rotate(shard.rotation);
    // Outlined like everything else on the board: a bare fill of the yellow
    // would vanish against the board the moment it left the ink (ART.md 2.3).
    // Blunt and rounded, never a sliver: a shard is a piece of the block.
    roundedRect(
      context,
      -shard.size / 2,
      (-shard.size * 0.74) / 2,
      shard.size,
      shard.size * 0.74,
      shard.size * 0.2,
    );
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
  for (const animation of input.animations ?? []) {
    drawOneScore(context, input.layout, animation);
  }
}

/** The number one shot earned, which belongs to that shot and not the board. */
function drawOneScore(
  context: CanvasRenderingContext2D,
  layout: Layout,
  animation: ShotAnimation,
): void {
  const gained = animation.gained ?? 0;
  if (!gained) return;

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
  const { state, layout, pulse } = input;
  const playing = livePhases(input);
  const animated = new Set(playing.map(({ animation }) => animation.plan.arrow.id));

  for (const arrow of state.arrows) {
    if (animated.has(arrow.id)) continue;

    // Every arrow bobs: a blocked one is drawn exactly like any other, and
    // what it runs into is read off the board or off the hold guide.
    const bob =
      input.now === undefined
        ? 0
        : Math.sin(input.now / 900 + hashId(arrow.id)) * layout.cell * 0.02;

    drawArrow(context, layout, arrow, {
      pulse: pulse?.arrowIds.includes(arrow.id) ? 1 - pulse.t : 0,
      offset: { x: 0, y: bob },
      colourBlind: input.colourBlindMode ?? false,
      wrong: arrow.id === input.wrongArrowId,
    });
  }

  // Once the arrow has landed it is gone: the impact frame is the last one
  // that draws it, and the shatter belongs to the block.
  for (const { animation, phase } of playing) {
    if (phase.kind === "shatter") continue;
    drawAnimatedArrow(
      context,
      layout,
      animation,
      phase.kind,
      phase.t,
      input.colourBlindMode ?? false,
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
  animation: ShotAnimation,
  kind: string,
  t: number,
  colourBlind: boolean,
): void {
  const { plan } = animation;
  const arrow = plan.arrow;
  // Far enough that the head reaches into the frame gap, not just the last
  // cell — except on a blocked tap, where what stopped the arrow is another
  // arrow on the board and the head has to stop against it, not past it.
  const distance =
    plan.travel * layout.cell + (plan.event === "blocked" ? 0 : layout.gap);
  const unit = directionUnit(arrow.dir);

  let travelled = 0;
  let offset: Point = { x: 0, y: 0 };
  let alpha = 1;

  if (kind === "slide") {
    // Linear, as ART.md 7 says. It used to run on `easeOut`, which is 65% of
    // the way across at a third of the time: the arrow appeared to shoot and
    // then crawl, and lengthening the phase only made the crawl longer. The
    // perceived speed has to be the one the duration sets.
    travelled = t * distance;
    alpha = plan.event === "flewOff" ? 1 - t * 0.9 : 1;
  } else if (kind === "impact") {
    travelled = distance;
    alpha = 1 - t;
  } else if (kind === "recoil") {
    // Both mistakes shake hard and leave the board exactly as it was, and
    // both slide back down their own track first, so the arrow is never seen
    // to teleport home. What it hit — a block of the wrong colour, or another
    // arrow — is where the recoil starts from.
    travelled = distance * (1 - t);
    const shake = shakeOffset(t, layout.cell * 0.14);
    offset = { x: unit.y * shake, y: unit.x * shake };
  }

  // The body runs along the head's own track, so a bend travels back down the
  // arrow instead of the whole shape drifting sideways (DESIGN.md 1.4).
  drawArrow(context, layout, arrow, {
    offset,
    alpha,
    colourBlind,
    ...(travelled > 0 ? { points: trailPoints(layout, arrow, travelled) } : {}),
  });
}

/** The zoom the guide has to undo to reach the edge of a zoomed-in screen. */
function camera(input: RenderInput): number {
  return input.camera.scale;
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

  context.save();
  context.lineCap = "round";
  // A clear ray is a hairline that runs off the screen: it is a direction,
  // not a piece, and the thinner it is the less it argues with the board it
  // crosses. A blocked one is heavier and dashed, because it is a statement
  // about one short stretch of board rather than about a whole lane.
  context.lineWidth = pipeWidth(layout) * (guide.blocked ? 0.45 : 0.14);
  context.globalAlpha = guide.blocked ? 0.5 : 0.6;
  // Clear rays are drawn in the arrow's own colour; a blocked one stops at
  // the obstruction and is drawn in the disabled ink.
  context.strokeStyle = guide.blocked
    ? THEME.disabledInk
    : paletteEntry(arrow.color).fill;
  if (guide.blocked) context.setLineDash([layout.cell * 0.18, layout.cell * 0.16]);

  context.beginPath();
  context.moveTo(from.x, from.y);
  if (!guide.blocked) {
    // Up to the block it will meet, and not a pixel further: the ray answers
    // "what does this one hit", so it ends on the face that answers it. A
    // line drawn through the block and off the screen crossed the very thing
    // it was pointing at, and the block is what the player is reading.
    const unit = directionUnit(arrow.dir);
    const reach = faceReach(input, guide, arrow, from);
    context.lineTo(from.x + unit.x * reach, from.y + unit.y * reach);
  } else {
    // The line has to reach what stopped it. When the obstruction is in the
    // very next cell there is no clear cell to draw to, and the guide used
    // to come out as a dot on the arrow's own head — which read as no guide
    // at all. So it is drawn to the edge of the blocking cell instead.
    const unit = directionUnit(arrow.dir);
    const reach = (guide.clear.length + 0.5) * layout.cell;
    context.lineTo(from.x + unit.x * reach, from.y + unit.y * reach);
  }
  context.stroke();
  context.restore();
}

/**
 * How far a clear ray runs: from the arrow's head to the near face of the
 * block it is aimed at. Without a target block — a Ghost's ray through a hole
 * in the frame, or a board whose target has already gone — it falls back to
 * running off the screen, because a ray that stops in mid-air would read as a
 * blocked one.
 */
function faceReach(
  input: RenderInput,
  guide: GuideView,
  arrow: Arrow,
  from: Point,
): number {
  const { state, layout } = input;
  const block = state.blocks.find((candidate) => candidate.id === guide.targetBlockId);
  if (block) {
    const rect = blockRect(layout, block);
    switch (arrow.dir) {
      case "up":
        return from.y - (rect.y + rect.height);
      case "down":
        return rect.y - from.y;
      case "left":
        return from.x - (rect.x + rect.width);
      case "right":
        return rect.x - from.x;
    }
  }
  return (input.viewport.width + input.viewport.height) / Math.max(camera(input), 0.1);
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
  context.strokeStyle = edgeColour(entry.fill);
  context.lineWidth = 2;
  context.fill();
  context.stroke();
  if (input.colourBlindMode)
    drawGlyph(context, marker, entry.glyph, layout, glyphInk(entry.fill), {
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
