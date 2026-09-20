import type { Arrow, Block, FireEvent } from "@/engine/types";

/**
 * Motion timings from ART.md 7. Input is locked while a plan plays, so these
 * are gameplay numbers, not decoration: a long body may never stall the turn.
 */
export const TIMING = {
  slidePerCellMs: 40,
  slideCapMs: 500,
  impactMs: 180,
  recoilMs: 220,
  shatterMs: 320,
} as const;

export type PhaseKind = "slide" | "impact" | "recoil" | "shatter";

export interface Phase {
  kind: PhaseKind;
  durationMs: number;
}

export interface AnimationPlan {
  event: FireEvent;
  arrow: Arrow;
  /** The block that was hit, when there was one. */
  block?: Block;
  /** Cells the head travels before it leaves the board. */
  travel: number;
  phases: Phase[];
  totalMs: number;
}

export interface PlanInput {
  event: FireEvent;
  arrow: Arrow;
  block?: Block | undefined;
  /** Cells between the head and the frame, inclusive of the exit step. */
  travel: number;
  /**
   * Reduced motion cuts every duration to the impact frame only and drops the
   * idle bob, particles and confetti. It never changes what is legible.
   */
  reducedMotion?: boolean;
}

export function planAnimation(input: PlanInput): AnimationPlan {
  const { event, arrow, travel } = input;
  const reduced = input.reducedMotion ?? false;

  const slideMs = reduced
    ? 0
    : Math.min(TIMING.slideCapMs, (travel + arrow.path.length) * TIMING.slidePerCellMs);

  const phases: Phase[] = [];
  const push = (kind: PhaseKind, durationMs: number): void => {
    if (durationMs > 0) phases.push({ kind, durationMs });
  };

  switch (event) {
    case "blocked":
      // Nothing leaves the board; the arrow shakes in place.
      push("recoil", reduced ? 0 : TIMING.recoilMs);
      break;
    case "bounced":
      push("slide", slideMs);
      push("recoil", reduced ? 0 : TIMING.recoilMs);
      break;
    case "peeled":
      push("slide", slideMs);
      push("impact", TIMING.impactMs);
      break;
    case "destroyed":
      push("slide", slideMs);
      push("impact", TIMING.impactMs);
      push("shatter", reduced ? 0 : TIMING.shatterMs);
      break;
    case "flewOff":
      push("slide", slideMs);
      break;
  }

  const plan: AnimationPlan = {
    event,
    arrow,
    travel,
    phases,
    totalMs: phases.reduce((sum, phase) => sum + phase.durationMs, 0),
  };
  if (input.block) plan.block = input.block;
  return plan;
}

export interface PhaseProgress {
  kind: PhaseKind;
  /** 0-1 within this phase. */
  t: number;
}

/** Which phase a plan is in at `elapsed`, or null once it has finished. */
export function phaseAt(plan: AnimationPlan, elapsed: number): PhaseProgress | null {
  let start = 0;
  for (const phase of plan.phases) {
    if (elapsed < start + phase.durationMs) {
      return { kind: phase.kind, t: (elapsed - start) / phase.durationMs };
    }
    start += phase.durationMs;
  }
  return null;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** A hard shake, used for both mistakes (ART.md 6). */
export function shakeOffset(t: number, amplitude: number): number {
  return Math.sin(t * Math.PI * 6) * amplitude * (1 - t);
}
