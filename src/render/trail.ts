import type { Arrow, Dir } from "@/engine/types";
import type { Layout, Point } from "./layout";
import { cellCentre } from "./layout";

/**
 * An arrow moves along its own shape, head first: the head advances straight
 * in its facing direction, and every body cell follows the exact route the
 * head traced, like a train on its own track (DESIGN.md 1.4).
 *
 * So the firing animation cannot translate the whole shape. The resting
 * centre-line, extended straight out past the frame, is the *track*; at any
 * moment each of the arrow's own points sits that much further along it, and
 * a bend passes back down the body rather than travelling sideways with it.
 */

export function directionUnit(dir: Dir): Point {
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

/** Cumulative distance to each point of a polyline. */
function arcLengths(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    lengths.push(
      lengths[index - 1]! + Math.hypot(current.x - previous.x, current.y - previous.y),
    );
  }
  return lengths;
}

/**
 * The point at `arc` along the track. Past the end it keeps going straight in
 * the exit direction, which is what carries the arrow off the board.
 */
function pointAtArc(
  points: readonly Point[],
  lengths: readonly number[],
  exit: Point,
  arc: number,
): Point {
  const last = points[points.length - 1]!;
  const total = lengths[lengths.length - 1]!;

  if (arc >= total) {
    const overshoot = arc - total;
    return { x: last.x + exit.x * overshoot, y: last.y + exit.y * overshoot };
  }
  if (arc <= 0) {
    const first = points[0]!;
    const start = points[1] ?? first;
    const dx = start.x - first.x;
    const dy = start.y - first.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: first.x + (dx / length) * arc, y: first.y + (dy / length) * arc };
  }

  for (let index = 1; index < points.length; index += 1) {
    const segmentEnd = lengths[index]!;
    if (arc > segmentEnd) continue;

    const segmentStart = lengths[index - 1]!;
    const from = points[index - 1]!;
    const to = points[index]!;
    const span = segmentEnd - segmentStart || 1;
    const t = (arc - segmentStart) / span;

    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  return last;
}

/**
 * The arrow's centre-line, tail first, once it has travelled `distance` along
 * its own track. Every original vertex keeps its place in the body and simply
 * moves further along the same route.
 */
export function trailPoints(layout: Layout, arrow: Arrow, distance: number): Point[] {
  const resting = arrow.path.map((cell) => cellCentre(layout, cell));
  const lengths = arcLengths(resting);
  const exit = directionUnit(arrow.dir);

  return lengths.map((arc) => pointAtArc(resting, lengths, exit, arc + distance));
}
