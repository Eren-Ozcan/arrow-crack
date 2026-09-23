import { describe, expect, it } from "vitest";
import {
  createGestureState,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  tick,
  TAP_MAX_MOVE_DP,
  TAP_MAX_MS,
} from "@/input/gestures";
import { planAnimation, phaseAt, TIMING } from "@/render/animation";
import type { Arrow } from "@/engine/types";
import { computeLayout, cellCentre } from "@/render/layout";
import { trailPoints } from "@/render/trail";

const origin = { x: 100, y: 100 };

describe("gesture arbitration", () => {
  it("fires a quick, still tap", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: origin, time: 0 });

    expect(pointerUp(state, { id: 1, point: origin, time: 120 })).toEqual([
      { type: "tap", point: origin },
    ]);
  });

  it("never fires a touch that moved past the threshold", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: origin, time: 0 });

    const moved = pointerMove(state, {
      id: 1,
      point: { x: origin.x + TAP_MAX_MOVE_DP + 1, y: origin.y },
      time: 30,
    });
    expect(moved[0]?.type).toBe("pan");

    // Back to where it started, and lifted inside the tap window: still a pan.
    pointerMove(state, { id: 1, point: origin, time: 60 });
    expect(pointerUp(state, { id: 1, point: origin, time: 90 })).toEqual([]);
  });

  it("never fires a touch held past the tap window", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: origin, time: 0 });

    expect(tick(state, TAP_MAX_MS + 1)).toEqual([{ type: "holdStart", point: origin }]);
    expect(pointerUp(state, { id: 1, point: origin, time: 900 })).toEqual([
      { type: "holdEnd" },
    ]);
  });

  it("holds the guide only while the finger stays still", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: origin, time: 0 });
    tick(state, TAP_MAX_MS + 1);

    const moved = pointerMove(state, {
      id: 1,
      point: { x: origin.x + 40, y: origin.y },
      time: 400,
    });
    expect(moved.map((gesture) => gesture.type)).toEqual(["holdEnd", "pan"]);
  });

  it("does not start a guide before the tap window closes", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: origin, time: 0 });
    expect(tick(state, TAP_MAX_MS)).toEqual([]);
  });

  it("turns a second finger into a pinch, and cancels any fire", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: { x: 100, y: 100 }, time: 0 });
    pointerDown(state, { id: 2, point: { x: 200, y: 100 }, time: 10 });

    const pinched = pointerMove(state, { id: 2, point: { x: 300, y: 100 }, time: 20 });
    expect(pinched).toEqual([{ type: "pinch", scale: 2, centre: { x: 200, y: 100 } }]);

    // Neither finger may fire once a pinch has begun.
    expect(pointerUp(state, { id: 1, point: { x: 100, y: 100 }, time: 30 })).toEqual([]);
    expect(pointerUp(state, { id: 2, point: { x: 300, y: 100 }, time: 40 })).toEqual([]);
  });

  it("ends the guide when a second finger arrives", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: origin, time: 0 });
    tick(state, TAP_MAX_MS + 1);

    expect(pointerDown(state, { id: 2, point: { x: 240, y: 100 }, time: 400 })).toEqual([
      { type: "holdEnd" },
    ]);
  });

  it("reports a double tap instead of a second tap", () => {
    const state = createGestureState();

    pointerDown(state, { id: 1, point: origin, time: 0 });
    expect(pointerUp(state, { id: 1, point: origin, time: 100 })[0]?.type).toBe("tap");

    pointerDown(state, { id: 2, point: origin, time: 200 });
    expect(pointerUp(state, { id: 2, point: origin, time: 260 })).toEqual([
      { type: "doubleTap", point: origin },
    ]);

    // A third tap starts a fresh pair rather than chaining.
    pointerDown(state, { id: 3, point: origin, time: 300 });
    expect(pointerUp(state, { id: 3, point: origin, time: 360 })[0]?.type).toBe("tap");
  });

  it("forgets a tap that was too far away or too slow to pair", () => {
    const state = createGestureState();

    pointerDown(state, { id: 1, point: origin, time: 0 });
    pointerUp(state, { id: 1, point: origin, time: 50 });

    pointerDown(state, { id: 2, point: { x: origin.x + 100, y: origin.y }, time: 100 });
    expect(
      pointerUp(state, { id: 2, point: { x: origin.x + 100, y: origin.y }, time: 150 })[0]
        ?.type,
    ).toBe("tap");
  });

  it("drops a cancelled touch without firing", () => {
    const state = createGestureState();
    pointerDown(state, { id: 1, point: origin, time: 0 });
    tick(state, TAP_MAX_MS + 1);

    expect(pointerCancel(state, 1)).toEqual([{ type: "holdEnd" }]);
    expect(pointerUp(state, { id: 1, point: origin, time: 500 })).toEqual([]);
  });

  it("ignores events for touches it never saw", () => {
    const state = createGestureState();
    expect(pointerMove(state, { id: 9, point: origin, time: 0 })).toEqual([]);
    expect(pointerCancel(state, 9)).toEqual([]);
    expect(tick(state, 1000)).toEqual([]);
  });
});

const arrow: Arrow = {
  id: "a",
  color: "v",
  dir: "up",
  path: [
    { col: 1, row: 3 },
    { col: 1, row: 2 },
  ],
};

describe("animation plans", () => {
  it("runs a blocked arrow into what stopped it, then shakes it back", () => {
    // `travel` is the cells it can cross, so the slide ends on the
    // obstruction rather than at the frame, and nothing leaves the board.
    const plan = planAnimation({ event: "blocked", arrow, travel: 2 });
    expect(plan.phases).toEqual([
      { kind: "slide", durationMs: 2 * TIMING.slidePerCellMs },
      { kind: "recoil", durationMs: TIMING.recoilMs },
    ]);
  });

  it("leaves a blocked arrow with nowhere to go shaking where it stands", () => {
    const plan = planAnimation({ event: "blocked", arrow, travel: 0 });
    expect(plan.phases).toEqual([{ kind: "recoil", durationMs: TIMING.recoilMs }]);
  });

  it("slides, lands and shatters when a block is destroyed", () => {
    const plan = planAnimation({ event: "destroyed", arrow, travel: 2 });
    expect(plan.phases.map((phase) => phase.kind)).toEqual([
      "slide",
      "impact",
      "shatter",
    ]);
  });

  it("runs at one speed, whatever the arrow is and wherever it stands", () => {
    // The slide is the cells the head crosses, at a fixed cost per cell:
    // neither the body's own length nor a cap bends it, because two arrows
    // crossing the same gap at different speeds read as the game hesitating.
    const long: Arrow = {
      ...arrow,
      path: Array.from({ length: 40 }, (_, index) => ({ col: 1, row: index })),
    };
    const short = planAnimation({ event: "flewOff", arrow, travel: 6 });
    const stretched = planAnimation({ event: "flewOff", arrow: long, travel: 6 });

    expect(short.totalMs).toBe(6 * TIMING.slidePerCellMs);
    expect(stretched.totalMs).toBe(short.totalMs);
    expect(planAnimation({ event: "flewOff", arrow, travel: 12 }).totalMs).toBe(
      short.totalMs * 2,
    );
  });

  it("cuts to the impact frame under reduced motion", () => {
    const plan = planAnimation({
      event: "destroyed",
      arrow,
      travel: 2,
      reducedMotion: true,
    });
    expect(plan.phases).toEqual([{ kind: "impact", durationMs: TIMING.impactMs }]);
  });

  it("leaves a reduced-motion mistake with no phases at all", () => {
    const plan = planAnimation({
      event: "blocked",
      arrow,
      travel: 1,
      reducedMotion: true,
    });
    expect(plan.totalMs).toBe(0);
    expect(phaseAt(plan, 0)).toBeNull();
  });

  it("reports which phase is playing, and when it is over", () => {
    const plan = planAnimation({ event: "peeled", arrow, travel: 1 });
    const slideMs = plan.phases[0]!.durationMs;

    expect(phaseAt(plan, 0)?.kind).toBe("slide");
    expect(phaseAt(plan, slideMs)?.kind).toBe("impact");
    expect(phaseAt(plan, slideMs + TIMING.impactMs / 2)?.t).toBeCloseTo(0.5);
    expect(phaseAt(plan, plan.totalMs)).toBeNull();
  });
});

describe("firing along the arrow's own track", () => {
  const layout = computeLayout({ cols: 5, rows: 5 }, { width: 500, height: 500 });

  // An L: the tail sits to the left of the bend, the head runs up from it.
  const bent: Arrow = {
    id: "bent",
    color: "v",
    dir: "up",
    path: [
      { col: 0, row: 3 },
      { col: 1, row: 3 },
      { col: 1, row: 2 },
    ],
  };

  it("leaves the arrow where it is at zero distance", () => {
    const points = trailPoints(layout, bent, 0);
    expect(points).toEqual([
      cellCentre(layout, { col: 0, row: 3 }),
      cellCentre(layout, { col: 1, row: 3 }),
      cellCentre(layout, { col: 1, row: 2 }),
    ]);
  });

  it("walks the tail through the bend instead of dragging it sideways", () => {
    // One cell of travel: every point moves one step along the route, so the
    // tail lands on the bend and the body is now straight.
    const points = trailPoints(layout, bent, layout.cell);
    const [tail, middle, head] = points as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];

    expect(tail.x).toBeCloseTo(cellCentre(layout, { col: 1, row: 3 }).x);
    expect(tail.y).toBeCloseTo(cellCentre(layout, { col: 1, row: 3 }).y);
    expect(middle.x).toBeCloseTo(cellCentre(layout, { col: 1, row: 2 }).x);
    expect(head.x).toBeCloseTo(cellCentre(layout, { col: 1, row: 1 }).x);
    expect(head.y).toBeCloseTo(cellCentre(layout, { col: 1, row: 1 }).y);

    // The whole body is now in one column: the bend has passed out of it.
    expect(new Set(points.map((point) => Math.round(point.x))).size).toBe(1);
  });

  it("never stretches the body, whatever part of the track it is on", () => {
    const spacing = (points: { x: number; y: number }[]): number[] =>
      points
        .slice(1)
        .map((point, index) =>
          Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
        );

    for (const distance of [0, 0.5, 1.3, 4].map((cells) => cells * layout.cell)) {
      for (const gap of spacing(trailPoints(layout, bent, distance))) {
        // Points stay one cell apart along the track. Straddling the bend the
        // straight-line gap is shorter, never longer — the body is folding
        // round the corner, not stretching across it.
        expect(gap).toBeLessThanOrEqual(layout.cell + 0.001);
        expect(gap).toBeGreaterThan(layout.cell * 0.7);
      }
    }

    // Once the whole body is past the bend it is rigid again.
    for (const gap of spacing(trailPoints(layout, bent, layout.cell * 4))) {
      expect(gap).toBeCloseTo(layout.cell);
    }
  });

  it("carries the arrow straight off the board past the frame", () => {
    const far = trailPoints(layout, bent, layout.cell * 10);
    for (const point of far) {
      expect(point.y).toBeLessThan(layout.bounds.y);
      expect(point.x).toBeCloseTo(cellCentre(layout, { col: 1, row: 0 }).x);
    }
  });
});
