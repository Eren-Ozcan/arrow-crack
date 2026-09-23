import type { FireEvent } from "@/engine/types";
import type { StringKey } from "@/ui/strings";

/**
 * The tutorial beats (DESIGN.md 2): one new idea at a time, taught where it
 * happens rather than in a text wall. A beat is a single line, shown once per
 * level attempt, either as the board opens or in answer to what just
 * happened — the mistake beats fire on the mistake itself, which on levels
 * 1-3 costs nothing.
 *
 * A beat names a string rather than carrying one, so the lines live with every
 * other string in `ui/strings.en.json` (DESIGN.md 6).
 */
export type BeatTrigger = "start" | FireEvent;

export interface Beat {
  level: number;
  when: BeatTrigger;
  key: StringKey;
}

/**
 * A colour mismatch is **structurally impossible** while every block is fed
 * by a single lane: the arrows in a lane sit in front of each other in the
 * order the layers peel, so the only wrong tap available is a blocked one.
 * It first becomes possible where two lanes feed one stack, which is the
 * wide block at level 31 — level 32 is the first board a player can actually
 * bounce on. The beat is therefore taught there rather than at level 3,
 * where the line could never fire (`DESIGN.md` 2).
 */
export const BEATS: Beat[] = [
  { level: 1, when: "start", key: "coach.1.start" },
  { level: 2, when: "blocked", key: "coach.2.blocked" },
  { level: 5, when: "start", key: "coach.5.start" },
  { level: 8, when: "start", key: "coach.8.start" },
  { level: 20, when: "start", key: "coach.20.start" },
  { level: 31, when: "start", key: "coach.31.start" },
  { level: 32, when: "bounced", key: "coach.32.bounced" },
  { level: 35, when: "start", key: "coach.35.start" },
  { level: 38, when: "start", key: "coach.38.start" },
  { level: 42, when: "start", key: "coach.42.start" },
  { level: 50, when: "start", key: "coach.50.start" },
  { level: 55, when: "start", key: "coach.55.start" },
];

/** The beat for this moment, or null. */
export function beatFor(level: number, when: BeatTrigger): Beat | null {
  return BEATS.find((beat) => beat.level === level && beat.when === when) ?? null;
}
