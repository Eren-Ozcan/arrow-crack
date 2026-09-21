import { describe, expect, it } from "vitest";
import { createState } from "@/engine/level";
import { earnedJokerTarget, grantEarnedJoker } from "@/game/earned";
import { ordered, wideAndBent } from "./fixtures/levels";

describe("the combo-earned Joker", () => {
  it("picks the arrow whose colour matches nothing on the frame", () => {
    const state = createState({
      ...ordered.level,
      arrows: [
        ...ordered.level.arrows,
        { id: "stranded", color: "y", dir: "down", path: [{ col: 0, row: 2 }] },
      ],
      palette: [...ordered.level.palette, "y"],
      blocks: [
        ...ordered.level.blocks,
        { id: "spare", side: "bottom", start: 0, span: 1, layers: ["b"] },
      ],
    });

    expect(earnedJokerTarget(state)).toBe("stranded");
  });

  it("upgrades that arrow and leaves every other one alone", () => {
    const state = createState(wideAndBent.level);
    const target = earnedJokerTarget(state)!;
    const upgraded = grantEarnedJoker(state, target);

    expect(upgraded.arrows.filter((arrow) => arrow.special === "joker")).toHaveLength(1);
    expect(upgraded.arrows.find((arrow) => arrow.id === target)?.special).toBe("joker");
    expect(upgraded.arrows.map((arrow) => arrow.path)).toEqual(
      state.arrows.map((arrow) => arrow.path),
    );
  });

  it("never upgrades an arrow that is already special", () => {
    const state = createState(wideAndBent.level);
    const first = earnedJokerTarget(state)!;
    const once = grantEarnedJoker(state, first);

    // Two on the board at once is the ceiling (DESIGN.md 1.11), so the second
    // grant never lands on the piece that already carries one.
    expect(earnedJokerTarget(once)).not.toBe(first);
  });
});
