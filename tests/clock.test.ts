import { describe, expect, it } from "vitest";
import {
  CONTINUE_BONUS_MS,
  MISTAKE_PENALTY_MS,
  advance,
  createClock,
  grantTime,
  isExpired,
  pause,
  penalise,
  resume,
  timeBonus,
} from "@/game/clock";

describe("the timed level clock", () => {
  it("only spends time while it is running", () => {
    const started = resume(createClock(30_000), 1_000);
    expect(advance(started, 4_000).remainingMs).toBe(27_000);

    // A paused clock is where the ad, the modal and the background go
    // (PROGRESSION.md 3.1): time may never pass there.
    const paused = pause(started, 4_000);
    expect(paused.remainingMs).toBe(27_000);
    expect(advance(paused, 90_000).remainingMs).toBe(27_000);
  });

  it("does not charge for the gap it was paused over", () => {
    const paused = pause(advance(resume(createClock(10_000), 0), 3_000), 3_000);
    const back = resume(paused, 60_000);
    expect(advance(back, 61_000).remainingMs).toBe(6_000);
  });

  it("charges five seconds for a mistake, and never below zero", () => {
    const clock = resume(createClock(6_000), 0);
    expect(penalise(clock, 0).remainingMs).toBe(6_000 - MISTAKE_PENALTY_MS);
    expect(penalise(penalise(clock, 0), 0).remainingMs).toBe(0);
    expect(isExpired(penalise(penalise(clock, 0), 0))).toBe(true);
  });

  it("grants thirty seconds on a continue, stopped until play resumes", () => {
    const clock = grantTime(advance(resume(createClock(20_000), 0), 20_000));
    expect(clock.remainingMs).toBe(CONTINUE_BONUS_MS);
    expect(clock.running).toBe(false);
  });

  it("pays ten points per whole second left", () => {
    expect(timeBonus(createClock(12_400))).toBe(120);
    expect(timeBonus(createClock(0))).toBe(0);
  });
});

describe("the clock and out-of-order timestamps", () => {
  it("never runs backwards when a tap arrives before the frame", () => {
    const clock = advance(resume(createClock(10_000), 1_000), 5_000);
    expect(advance(clock, 4_999).remainingMs).toBe(6_000);
  });
});
