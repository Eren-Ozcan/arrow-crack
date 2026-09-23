import type { Arrow, Block, FireEvent } from "@/engine/types";

/**
 * Motion timings from ART.md 7. Input is locked while a plan plays, so these
 * are gameplay numbers, not decoration: a long body may never stall the turn.
 */
export const TIMING = {
  // One speed, everywhere: the slide is this many milliseconds per cell the
  // head crosses, and nothing else changes it. There is no cap and the body's
  // own length is not counted — both of those made an arrow's speed depend on
  // where it stood and how long it was, and a board where two arrows cross
  // the same gap at different speeds reads as the game hesitating. The
  // longest lane on any shipped board is 8 cells, so the worst shot is 800 ms
  // and the turn is still protected (ART.md 7).
  slidePerCellMs: 100,
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

  const slideMs = reduced ? 0 : travel * TIMING.slidePerCellMs;

  const phases: Phase[] = [];
  const push = (kind: PhaseKind, durationMs: number): void => {
    if (durationMs > 0) phases.push({ kind, durationMs });
  };

  switch (event) {
    case "blocked":
      // The arrow does move: it runs up to whatever is in its way, is stopped
      // by it and comes back. A shake in place said a life was spent without
      // ever showing what spent it, and the blocker pulse was left to carry
      // the whole explanation on its own (ART.md 6.2). `travel` is the cells
      // it can actually cross, so the head stops on the obstruction.
      push("slide", slideMs);
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

/** A hard shake, used for both mistakes (ART.md 6). */
export function shakeOffset(t: number, amplitude: number): number {
  return Math.sin(t * Math.PI * 6) * amplitude * (1 - t);
}
