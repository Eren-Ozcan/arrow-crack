import type { FireEvent } from "@/engine/types";

/**
 * The tutorial beats (DESIGN.md 2): one new idea at a time, taught where it
 * happens rather than in a text wall. A beat is a single line, shown once per
 * level attempt, either as the board opens or in answer to what just
 * happened — the mistake beats fire on the mistake itself, which on levels
 * 1-3 costs nothing.
 */
export type BeatTrigger = "start" | FireEvent;

export interface Beat {
  level: number;
  when: BeatTrigger;
  text: string;
}

export const BEATS: Beat[] = [
  { level: 1, when: "start", text: "Tap an arrow to fire it." },
  {
    level: 2,
    when: "blocked",
    text: "Blocked by another arrow. Off the tutorial, that costs a heart.",
  },
  {
    level: 3,
    when: "bounced",
    text: "Wrong colour, so it bounces back. Off the tutorial, that costs a heart.",
  },
  {
    level: 5,
    when: "start",
    text: "Blocks are layered. The edges along the inside show what is underneath.",
  },
  {
    level: 8,
    when: "start",
    text: "Hearts pay for mistakes. Finish without one for three stars.",
  },
  { level: 20, when: "start", text: "One heart. Read the board before every tap." },
  { level: 31, when: "start", text: "One block, several lanes: any of them feeds it." },
  {
    level: 35,
    when: "start",
    text: "A Joker takes any colour — but it still needs a clear path.",
  },
  {
    level: 42,
    when: "start",
    text: "A Bomb peels its block and both neighbours, whatever the colour.",
  },
  { level: 50, when: "start", text: "Three hearts from here on." },
  {
    level: 55,
    when: "start",
    text: "A Ghost fires straight through the tangle — the colour still has to match.",
  },
];

/** The beat for this moment, or null. */
export function beatFor(level: number, when: BeatTrigger): Beat | null {
  return BEATS.find((beat) => beat.level === level && beat.when === when) ?? null;
}
