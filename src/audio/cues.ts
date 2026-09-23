/**
 * The cue set in `AUDIO.md` section 1. Every sound is feedback for something
 * the player caused, so a cue name is an event name — there is no cue here
 * that decorates.
 */
export type Cue =
  | "select"
  /** The arrow leaving, which is the sound of a tap that was allowed. */
  | "arrow"
  /** The same arrow, thinner: it left the board without hitting anything. */
  | "arrowMiss"
  /** The block coming apart, after the arrow that did it. */
  | "blockBreak"
  | "bounce"
  | "blocked"
  | "heartLost"
  | "comboStep"
  | "joker"
  | "ghost"
  | "bomb"
  | "hint"
  | "tick"
  | "win"
  | "star"
  | "perfect";

/**
 * What "reduce audio" leaves on (`AUDIO.md` 5): the reward, the one negative
 * sound, and the end of the level. Everything else is layering, and layering
 * is exactly what that option exists to remove.
 */
export const ESSENTIAL_CUES: readonly Cue[] = ["arrow", "blockBreak", "heartLost", "win"];

/**
 * The cues that carry a haptic as well (`AUDIO.md` 4). A player with the
 * sound off still feels the heart go, which is why the pairing is fixed here
 * rather than left to each call site.
 */
export const HAPTIC_CUES: readonly Cue[] = ["arrow", "blockBreak", "bomb", "heartLost"];

/** Milliseconds of the haptic each paired cue fires. */
export const HAPTIC_MS: Record<string, number> = {
  arrow: 12,
  blockBreak: 26,
  bomb: 32,
  heartLost: 45,
};
