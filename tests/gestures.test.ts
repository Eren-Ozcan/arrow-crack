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
  it("shakes in place on a blocked tap, with nothing leaving the board", () => {
    const plan = planAnimation({ event: "blocked", arrow, travel: 2 });
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

  it("caps the slide so a long body never stalls the turn", () => {
    const long: Arrow = {
      ...arrow,
      path: Array.from({ length: 40 }, (_, index) => ({ col: 1, row: index })),
    };
    const plan = planAnimation({ event: "flewOff", arrow: long, travel: 20 });
    expect(plan.totalMs).toBe(TIMING.slideCapMs);
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
