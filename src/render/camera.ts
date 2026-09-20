import type { Layout, Point, Rect } from "./layout";

/**
 * The board behaves like a photo (ART.md 4): pinch 1x-3x, drag to pan,
 * double-tap between fit and 2x. Screen point = board point * scale + offset.
 */
export interface Camera {
  scale: number;
  offset: Point;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 3;
/** What a double tap toggles to, from fit. */
export const DOUBLE_TAP_SCALE = 2;

export function fitCamera(): Camera {
  return { scale: MIN_SCALE, offset: { x: 0, y: 0 } };
}

export function isFitted(camera: Camera): boolean {
  return camera.scale === MIN_SCALE && camera.offset.x === 0 && camera.offset.y === 0;
}

export function boardToScreen(camera: Camera, point: Point): Point {
  return {
    x: point.x * camera.scale + camera.offset.x,
    y: point.y * camera.scale + camera.offset.y,
  };
}

export function screenToBoard(camera: Camera, point: Point): Point {
  return {
    x: (point.x - camera.offset.x) / camera.scale,
    y: (point.y - camera.offset.y) / camera.scale,
  };
}

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/**
 * Keep the board on screen. When the scaled board is larger than the
 * viewport its edges are held to the viewport's; when it is smaller it is
 * centred, so a pan can never push it away entirely.
 */
export function clampCamera(
  camera: Camera,
  bounds: Rect,
  viewport: { width: number; height: number },
): Camera {
  const axis = (
    offset: number,
    start: number,
    size: number,
    viewportSize: number,
  ): number => {
    const scaledStart = start * camera.scale;
    const scaledSize = size * camera.scale;

    if (scaledSize <= viewportSize) {
      return (viewportSize - scaledSize) / 2 - scaledStart;
    }
    const min = viewportSize - (scaledStart + scaledSize);
    const max = -scaledStart;
    return Math.max(min, Math.min(max, offset));
  };

  return {
    scale: clampScale(camera.scale),
    offset: {
      x: axis(camera.offset.x, bounds.x, bounds.width, viewport.width),
      y: axis(camera.offset.y, bounds.y, bounds.height, viewport.height),
    },
  };
}

/** Zoom while keeping the board point under `anchor` under `anchor`. */
export function zoomAt(camera: Camera, anchor: Point, scale: number): Camera {
  const next = clampScale(scale);
  const board = screenToBoard(camera, anchor);
  return {
    scale: next,
    offset: {
      x: anchor.x - board.x * next,
      y: anchor.y - board.y * next,
    },
  };
}

export function panBy(camera: Camera, delta: Point): Camera {
  return {
    scale: camera.scale,
    offset: { x: camera.offset.x + delta.x, y: camera.offset.y + delta.y },
  };
}

/** Double tap toggles between fit and 2x, centred on the tapped point. */
export function toggleZoom(
  camera: Camera,
  anchor: Point,
  layout: Layout,
  viewport: { width: number; height: number },
): Camera {
  if (camera.scale > MIN_SCALE) return fitCamera();
  return clampCamera(zoomAt(camera, anchor, DOUBLE_TAP_SCALE), layout.bounds, viewport);
}
