/**
 * The timed level's clock (PROGRESSION.md 3). It is the whole budget on such a
 * level: a mistake costs five seconds rather than a heart, and the level fails
 * when the clock reaches zero.
 *
 * Pure, like the engine: it is told what time it is rather than reading one,
 * so the same code runs in the session and in a test. Which moments are on the
 * clock and which are not is section 3.1, and the session is what decides —
 * a clock that ran during an ad would be the ad interrupting play.
 */

/** A mistake costs this much time instead of a heart. */
export const MISTAKE_PENALTY_MS = 5_000;
/** A rewarded continue on a timed level (PROGRESSION.md 3). */
export const CONTINUE_BONUS_MS = 30_000;
/** Winning with less than this left is a narrow escape (PROGRESSION.md 2.3). */
export const NARROW_ESCAPE_MS = 5_000;
/** `timeBonus = 10 x seconds remaining`. */
export const TIME_BONUS_PER_SECOND = 10;

export interface ClockState {
  readonly limitMs: number;
  readonly remainingMs: number;
  readonly running: boolean;
  /** When the clock was last advanced; null while it is paused. */
  readonly startedAt: number | null;
}

export function createClock(limitMs: number): ClockState {
  return { limitMs, remainingMs: limitMs, running: false, startedAt: null };
}

/** Starts or resumes the clock from this moment. */
export function resume(clock: ClockState, now: number): ClockState {
  if (clock.running || clock.remainingMs <= 0) return clock;
  return { ...clock, running: true, startedAt: now };
}

/** Charges the elapsed time and stops the clock where it stands. */
export function pause(clock: ClockState, now: number): ClockState {
  if (!clock.running) return clock;
  return { ...advance(clock, now), running: false, startedAt: null };
}

/** The clock as of `now`; a paused clock is unchanged. */
export function advance(clock: ClockState, now: number): ClockState {
  if (!clock.running || clock.startedAt === null) return clock;
  // Taps carry a pointer timestamp and the loop carries a frame timestamp, so
  // the two can arrive a millisecond out of order. Time never runs backwards.
  const elapsed = Math.max(0, now - clock.startedAt);
  return {
    ...clock,
    remainingMs: Math.max(0, clock.remainingMs - elapsed),
    startedAt: now,
  };
}

/** A mistake: five seconds, never below zero. */
export function penalise(clock: ClockState, now: number): ClockState {
  const current = advance(clock, now);
  return {
    ...current,
    remainingMs: Math.max(0, current.remainingMs - MISTAKE_PENALTY_MS),
  };
}

/** After a rewarded ad: thirty seconds, board kept. */
export function grantTime(clock: ClockState, bonusMs = CONTINUE_BONUS_MS): ClockState {
  return {
    ...clock,
    remainingMs: clock.remainingMs + bonusMs,
    running: false,
    startedAt: null,
  };
}

export function isExpired(clock: ClockState): boolean {
  return clock.remainingMs <= 0;
}

/** Speed pays here explicitly, and only here (PROGRESSION.md 3). */
export function timeBonus(clock: ClockState): number {
  return Math.floor(clock.remainingMs / 1000) * TIME_BONUS_PER_SECOND;
}
