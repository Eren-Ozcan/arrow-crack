/**
 * What every generated level is asked to be (DESIGN.md 2, 4.2).
 *
 * The app and the offline tools read the same table: the CLI walks seeds
 * against `specFor(id)`, and the app rebuilds a level from `specFor(id)` plus
 * the seed the CLI recorded. Changing a knob here changes shipped boards, which
 * is why the level gate pins a fingerprint of every generated level.
 */
import type { Special } from "@/engine/types";
import type { GenerateOptions } from "./generate";

/** Levels 1-10 are the hand-authored tutorial; everything after is generated. */
export const FIRST_GENERATED_LEVEL = 11;
export const LAST_LEVEL = 2000;

/**
 * Hand-authored beats inside the generated range: the shaped silhouettes
 * (DESIGN.md 1.10). Mask-aware generation is a post-launch lever, so past 80
 * there are none.
 */
export const HAND_AUTHORED_LEVELS = [20, 40, 60, 80];

/** A single heart, every tenth level from 20 (DESIGN.md 1.5). */
export function isOneHeart(id: number): boolean {
  return id >= 20 && id % 10 === 0;
}

/**
 * Every fifteenth level from 38 (PROGRESSION.md 3). 38 + 15k ends in 3 or 8,
 * so a timed level can never sit next to a one-heart level.
 */
export function isTimed(id: number): boolean {
  return id >= 38 && (id - 38) % 15 === 0;
}

/**
 * Specials are introduced one at a time, in this order, and never before 35
 * (DESIGN.md 1.11); each one comes back once more a band later. Past 80 they
 * rotate on a fixed stride, away from the two spike types.
 */
const SPECIAL_INTROS: Record<number, Special> = {
  35: "joker",
  42: "bomb",
  48: "joker",
  55: "ghost",
  63: "bomb",
  74: "ghost",
};
const SPECIAL_ROTATION: Special[] = ["joker", "bomb", "ghost"];
const SPECIAL_STRIDE = 6;

export function specialFor(id: number): Special | undefined {
  if (id <= 80) return SPECIAL_INTROS[id];
  if (id % SPECIAL_STRIDE !== 1 || isOneHeart(id) || isTimed(id)) return undefined;
  return SPECIAL_ROTATION[Math.floor(id / SPECIAL_STRIDE) % SPECIAL_ROTATION.length];
}

/** A timed level gets a clock with room to read the board, not just to tap. */
export function clockFor(par: number): number {
  return Math.max(45_000, Math.ceil((par * 5_000) / 5_000) * 5_000);
}

/** Hearts by level index (DESIGN.md 2), or one on a one-heart level. */
export function heartsFor(id: number): number {
  if (isOneHeart(id)) return 1;
  return id >= 50 ? 3 : 4;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * How hard a level is asked to be, 0..1. A saturating trend — most of the
 * climb is over by level 700, and a player at 1500 meets the full game rather
 * than an ever-growing one — with a ten-level wave on top: the start of each
 * ten is a breather, the ninth is the peak, and the tenth is the one-heart
 * punctuation, built gentler on purpose.
 */
const WAVE = [-0.5, -0.35, -0.2, -0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0];
const TREND_SCALE = 300;
const WAVE_AMPLITUDE = 0.1;

export function trendAt(id: number): number {
  return 1 - Math.exp(-Math.max(0, id - FIRST_GENERATED_LEVEL) / TREND_SCALE);
}

export function effortAt(id: number): number {
  return clamp01(trendAt(id) + WAVE_AMPLITUDE * WAVE[(id - 1) % WAVE.length]!);
}

const PALETTE = ["v", "b", "g", "y", "p"];

/**
 * The knobs for a level index. Difficulty here is not board size — the
 * frame's rule is ordering, and the 48dp cell sets a hard ceiling of eight
 * columns (REFERENCE.md 4). It is the tangle (longer, bent bodies, a fuller
 * grid) and the colour pressure (deeper stacks on wide blocks whose lower
 * layers are already in reach), and the difficulty model is what picks the
 * seed inside the band afterwards.
 */
export function specFor(id: number): Omit<GenerateOptions, "seed"> {
  const effort = effortAt(id);
  const timed = isTimed(id);
  const special = specialFor(id);

  const cols = effort < 0.2 ? 6 : effort < 0.45 ? 7 : 8;
  // Past the middle of the curve some boards grow taller rather than wider:
  // a phone has height to spare and no width.
  const rows = cols + (effort > 0.6 ? id % 3 : 0);

  const minBody = effort < 0.4 ? 2 : 3;
  const maxBody = Math.round(lerp(4, 7, effort));
  const fill = lerp(0.5, 0.8, effort);
  const arrows = Math.max(
    6,
    Math.round((fill * cols * rows) / ((minBody + maxBody) / 2)) - (timed ? 3 : 0),
  );

  return {
    id,
    cols,
    rows,
    // The palette never passes five: that is as many hues as stay separable
    // under colour blindness (ART.md 2). Colour pressure comes from the
    // stacks, not from more colours.
    palette: PALETTE.slice(0, id < 31 ? 3 : id < 50 ? 4 : 5),
    hearts: heartsFor(id),
    arrows,
    decoys: id < 36 ? 0 : effort < 0.5 ? 1 : 2,
    maxLayers: id < 31 ? 2 : Math.round(lerp(2, 4, effort)),
    blocks: Math.round(lerp(5, 11, effort)),
    wideRate: id < 31 ? 0.15 : lerp(0.25, 0.5, effort),
    bendRate: lerp(0.3, 0.65, effort),
    // A timed level wants a short par and a forgiving board: time pressure
    // over deep lookahead is a coin flip, not a challenge (PROGRESSION.md 3).
    pinRate: timed ? 0.2 : lerp(0.3, 0.85, effort),
    minBody,
    maxBody,
    holdRate: id < 31 ? 0.15 : lerp(0.2, 0.5, effort),
    contrast: lerp(0.5, 1, effort),
    ...(timed ? { type: "timed" as const } : {}),
    ...(special ? { special } : {}),
  };
}
