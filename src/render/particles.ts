import type { Point } from "./layout";

/**
 * Shards, for the peel and for the full shatter (ART.md 6). A peel throws the
 * slab that came off; a destroyed block throws the whole thing.
 *
 * The burst is deterministic: the same block always breaks the same way, so a
 * frame can be asserted in a test and a bad burst is reproducible. Reduced
 * motion never reaches here — the caller drops the phase instead, which is
 * what keeps the impact frame legible (ART.md 7).
 */
export interface Shard {
  centre: Point;
  rotation: number;
  size: number;
  alpha: number;
}

export interface BurstInput {
  /** Stable per block, so one block's shards never re-roll between frames. */
  seed: number;
  count: number;
  /** 0-1 across the burst. */
  t: number;
  origin: Point;
  /** How far the outermost shard travels by the end. */
  spread: number;
  /** Shard side at the start of the burst. */
  size: number;
  /** Downward drift, so the shards fall rather than float away. */
  gravity?: number;
}

/** A stable number per id, so a block's burst and its bob never re-roll. */
export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100_003;
  }
  return hash;
}

/** Deterministic 0-1 noise; the burst needs spread, not real randomness. */
function noise(seed: number, index: number): number {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

export function burst(input: BurstInput): Shard[] {
  const { seed, count, t, origin, spread, size } = input;
  const gravity = input.gravity ?? 0;
  const shards: Shard[] = [];

  for (let index = 0; index < count; index += 1) {
    // An even fan with a little scatter: evenly spaced alone looks mechanical,
    // fully random leaves gaps the eye reads as a missing shard.
    const angle =
      ((index + 0.5) / count) * Math.PI * 2 + (noise(seed, index) - 0.5) * 0.9;
    const speed = 0.55 + noise(seed, index + 101) * 0.45;
    const travel = spread * speed * easeOutCubic(t);
    const drop = gravity * t * t;

    shards.push({
      centre: {
        x: origin.x + Math.cos(angle) * travel,
        y: origin.y + Math.sin(angle) * travel + drop,
      },
      rotation: (noise(seed, index + 211) - 0.5) * Math.PI * 3 * t,
      size: size * (1 - 0.55 * t),
      // Held solid at first so the break is seen, then gone quickly.
      alpha: 1 - t * t,
    });
  }

  return shards;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * How far a block sinks and springs back once the slab above it is gone
 * (ART.md 6: "the next layer settles down with a small bounce"). Positive is
 * inward, towards the board.
 */
export function settleOffset(t: number, amplitude: number): number {
  return Math.sin(t * Math.PI) * amplitude * (1 - t * 0.4);
}
