import type { Point } from "@/render/layout";

/**
 * Gesture arbitration (ART.md 4.1). Firing is a tap and a misfire costs a
 * heart, so a pan must never be mistaken for one: a touch fires only if it
 * lifts within 250 ms having moved under 8 dp, and a touch that becomes a pan
 * can never turn back into a fire — not even if the finger returns to where
 * it started. Every ambiguity resolves to "do nothing".
 */
export const TAP_MAX_MS = 250;
export const TAP_MAX_MOVE_DP = 8;
/** Two taps this close in time and space are a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_MAX_DP = 24;

export type Gesture =
  | { type: "tap"; point: Point }
  | { type: "doubleTap"; point: Point }
  | { type: "pan"; delta: Point }
  | { type: "holdStart"; point: Point }
  | { type: "holdEnd" }
  | { type: "pinch"; scale: number; centre: Point };

export interface PointerInput {
  id: number;
  point: Point;
  time: number;
}

interface Touch {
  id: number;
  start: Point;
  last: Point;
  startedAt: number;
  /** Once true, this touch can never fire. */
  moved: boolean;
  holding: boolean;
}

export interface GestureState {
  touches: Touch[];
  /** Distance between two fingers when the pinch began. */
  pinchStart: number | null;
  pinchScale: number;
  lastTap: { point: Point; time: number } | null;
}

export function createGestureState(): GestureState {
  return { touches: [], pinchStart: null, pinchScale: 1, lastTap: null };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function pointerDown(state: GestureState, input: PointerInput): Gesture[] {
  state.touches.push({
    id: input.id,
    start: input.point,
    last: input.point,
    startedAt: input.time,
    moved: false,
    holding: false,
  });

  if (state.touches.length === 2) {
    const [first, second] = state.touches as [Touch, Touch];
    // A second finger ends any chance of firing, and starts a pinch.
    first.moved = true;
    second.moved = true;
    state.pinchStart = distance(first.last, second.last);
    state.pinchScale = 1;
    return first.holding ? [{ type: "holdEnd" }] : [];
  }

  return [];
}

export function pointerMove(state: GestureState, input: PointerInput): Gesture[] {
  const touch = state.touches.find((candidate) => candidate.id === input.id);
  if (!touch) return [];

  const previous = touch.last;
  touch.last = input.point;

  if (state.touches.length >= 2 && state.pinchStart !== null) {
    const [first, second] = state.touches as [Touch, Touch];
    const spread = distance(first.last, second.last);
    if (state.pinchStart === 0) return [];

    const scale = spread / state.pinchStart;
    const step = scale / state.pinchScale;
    state.pinchScale = scale;
    return [{ type: "pinch", scale: step, centre: midpoint(first.last, second.last) }];
  }

  const gestures: Gesture[] = [];
  const travelled = distance(touch.start, input.point);

  if (!touch.moved && travelled > TAP_MAX_MOVE_DP) {
    touch.moved = true;
    if (touch.holding) {
      touch.holding = false;
      gestures.push({ type: "holdEnd" });
    }
  }

  if (touch.moved) {
    gestures.push({
      type: "pan",
      delta: { x: input.point.x - previous.x, y: input.point.y - previous.y },
    });
  }

  return gestures;
}

export function pointerUp(state: GestureState, input: PointerInput): Gesture[] {
  const index = state.touches.findIndex((candidate) => candidate.id === input.id);
  if (index === -1) return [];

  const [touch] = state.touches.splice(index, 1) as [Touch];
  if (state.touches.length < 2) state.pinchStart = null;

  const gestures: Gesture[] = [];
  if (touch.holding) gestures.push({ type: "holdEnd" });

  const heldMs = input.time - touch.startedAt;
  const fireable = !touch.moved && heldMs <= TAP_MAX_MS;
  if (!fireable) return gestures;

  const previous = state.lastTap;
  const isDouble =
    previous !== null &&
    input.time - previous.time <= DOUBLE_TAP_MS &&
    distance(previous.point, touch.start) <= DOUBLE_TAP_MAX_DP;

  if (isDouble) {
    state.lastTap = null;
    gestures.push({ type: "doubleTap", point: touch.start });
  } else {
    state.lastTap = { point: touch.start, time: input.time };
    gestures.push({ type: "tap", point: touch.start });
  }

  return gestures;
}

export function pointerCancel(state: GestureState, id: number): Gesture[] {
  const index = state.touches.findIndex((candidate) => candidate.id === id);
  if (index === -1) return [];

  const [touch] = state.touches.splice(index, 1) as [Touch];
  if (state.touches.length < 2) state.pinchStart = null;
  return touch.holding ? [{ type: "holdEnd" }] : [];
}

/**
 * Drives the press-and-hold exit-ray guide: a touch held past the tap window
 * without moving stops being a fire and starts showing the ray.
 */
export function tick(state: GestureState, now: number): Gesture[] {
  if (state.touches.length !== 1) return [];

  const [touch] = state.touches as [Touch];
  if (touch.moved || touch.holding) return [];
  if (now - touch.startedAt <= TAP_MAX_MS) return [];

  touch.holding = true;
  return [{ type: "holdStart", point: touch.start }];
}
