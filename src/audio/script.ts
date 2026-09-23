import type { FireEvent, Special } from "@/engine/types";
import type { Cue } from "./cues";
import { ladderRate } from "./mixer";
import type { PlayOptions } from "./synth";

/**
 * Which cues a shot makes, in what order, and how far apart — the part of
 * `AUDIO.md` that is a rule rather than a waveform, kept pure so it can be
 * asserted without an `AudioContext`.
 *
 * The rule that shapes all of it: the heart is its own fact. It never
 * overlaps the bounce or the knock that caused it, it lands just after, so
 * two facts arrive as two sounds (`AUDIO.md` 1).
 */

export interface Shot {
  kind: "shot";
  event: FireEvent;
  special: Special | null;
  /** Cells the body travelled, normalised 0-1 for the slide's pitch. */
  travel: number;
  /**
   * How long the body is on its way, in milliseconds — the slide phase of the
   * animation this shot plays under. The sound of what the arrow met waits
   * exactly this long, so the break is heard when it is seen.
   */
  slideMs: number;
  /** The multiplier the shot scored at, which is the arrow's pitch tier. */
  multiplier: number;
  /** True when this shot took one (never on a timed level, which takes seconds). */
  heartLost: boolean;
  /** True when the multiplier stepped up on this shot (`PROGRESSION.md` 1). */
  comboStepped: boolean;
}

/**
 * What the session reports. The select click is its own event because it
 * happens before there is a shot to describe.
 */
export type SoundEvent = Shot | { kind: "select" };

export interface ScheduledCue {
  cue: Cue;
  options?: PlayOptions;
  /** Milliseconds after the shot, so the order in the list is also in time. */
  delayMs: number;
}

/** The heart lands after the sound of what cost it, never under it. */
const HEART_DELAY_MS = 140;
/** The combo note sits behind the peel it belongs to, not on top of it. */
const COMBO_DELAY_MS = 90;

export function cuesFor(event: SoundEvent): ScheduledCue[] {
  return event.kind === "select" ? [{ cue: "select", delayMs: 0 }] : cuesForShot(event);
}

/**
 * A tap that was allowed is the arrow, immediately. The sound of the shot is
 * feedback for the decision, and feedback that waits for the animation is
 * feedback the hand has stopped asking about — so the arrow plays at the tap
 * and nothing is scheduled behind it unless something else actually
 * happened.
 *
 * What the arrow hit is a second, separate fact and gets a second, separate
 * sound at the moment of impact: a block coming apart is not a louder arrow.
 * The arrow sounds for every shot whose body actually leaves — a match, a
 * broken block, a free flight, and a bounce, which runs to the block and
 * back. Only a blocked tap is silent of it, because on a blocked tap nothing
 * moved at all (`AUDIO.md` 1).
 */
export function cuesForShot(shot: Shot): ScheduledCue[] {
  const cues: ScheduledCue[] = [];
  const rate = ladderRate(shot.multiplier);

  switch (shot.event) {
    case "peeled":
      cues.push({ cue: arrowCue(shot), options: { rate }, delayMs: 0 });
      break;
    case "destroyed":
      // Two facts: the arrow went, and the block came apart under it.
      cues.push({ cue: arrowCue(shot), options: { rate }, delayMs: 0 });
      cues.push({ cue: "blockBreak", options: { rate }, delayMs: impactDelay(shot) });
      break;
    case "bounced":
      // The body does leave on a bounce — it runs to the block, is refused
      // and comes back — so it makes the arrow sound like any other shot.
      // What is different is what it meets, and that is the thud's job.
      cues.push({ cue: arrowCue(shot), options: { rate }, delayMs: 0 });
      cues.push({ cue: "bounce", delayMs: impactDelay(shot) });
      break;
    case "blocked":
      // The knock is the collision, so it lands when the arrow arrives at
      // whatever stopped it — the same rule the block's own break follows.
      cues.push({ cue: "blocked", delayMs: impactDelay(shot) });
      break;
    case "flewOff":
      // A flight into a destroyed lane is free and irreversible. It hit
      // nothing, so it is the thinner version of the same arrow, and there
      // is no second sound behind it.
      cues.push({ cue: "arrowMiss", options: { travel: shot.travel }, delayMs: 0 });
      break;
  }

  if (shot.comboStepped && shot.event !== "blocked" && shot.event !== "bounced") {
    cues.push({
      cue: "comboStep",
      options: { rate },
      delayMs: impactDelay(shot) + COMBO_DELAY_MS,
    });
  }

  if (shot.heartLost) {
    cues.push({ cue: "heartLost", delayMs: impactDelay(shot) + HEART_DELAY_MS });
  }

  return cues;
}

/** A special replaces the arrow sound outright; it never layers over it. */
function arrowCue(shot: Shot): Cue {
  if (shot.special === "joker") return "joker";
  if (shot.special === "bomb") return "bomb";
  if (shot.special === "ghost") return "ghost";
  return "arrow";
}

/**
 * How long the body takes to reach what it hits. It no longer delays the
 * arrow — only the sound of the thing being hit, which has to land when the
 * block actually comes apart on screen. That moment is the end of the slide,
 * so this is the slide itself rather than a figure that guesses at it: an
 * estimate that drifted from the animation was heard as the block breaking
 * before the arrow got there.
 */
function impactDelay(shot: Shot): number {
  return Math.max(0, Math.round(shot.slideMs));
}

/** The win panel's sequence: the sting, a note per star, then the badge. */
export function cuesForWin(stars: 0 | 1 | 2 | 3, perfect: boolean): ScheduledCue[] {
  const cues: ScheduledCue[] = [{ cue: "win", delayMs: 0 }];

  // One note per star, on the 200 ms stagger the reveal animates at
  // (`ART.md` 7), so the sound and the star land together.
  for (let star = 0; star < stars; star += 1) {
    cues.push({ cue: "star", options: { index: star }, delayMs: 320 + star * 200 });
  }

  if (perfect) {
    cues.push({ cue: "perfect", delayMs: 320 + stars * 200 + 160 });
  }
  return cues;
}
