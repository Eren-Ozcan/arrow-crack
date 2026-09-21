import { describe, expect, it } from "vitest";
import { fire, grantContinue, markOutOfTime, markStuck } from "@/engine/fire";
import { createState } from "@/engine/level";
import { starsFor, starsForMistakes } from "@/engine/stars";
import type { GameState, LevelDef } from "@/engine/types";
import { fixtures, ordered, singleShot, wideAndBent } from "./fixtures/levels";

function play(state: GameState, ...arrowIds: string[]): GameState {
  return arrowIds.reduce((current, id) => fire(current, id).state, state);
}

describe("fire — the ray check", () => {
  it("costs a heart and leaves the board untouched when the ray is blocked", () => {
    const state = createState(ordered.level);
    const { state: after, event } = fire(state, "blue");

    expect(event).toBe("blocked");
    expect(after.heartsLeft).toBe(state.heartsLeft - 1);
    expect(after.mistakes).toBe(1);
    expect(after.arrows).toEqual(state.arrows);
    expect(after.blocks).toEqual(state.blocks);
  });

  it("never treats an arrow's own body as an obstacle", () => {
    // A spiral: the tail sits directly ahead of the head, on its own ray.
    const spiral: LevelDef = {
      id: 10,
      cols: 3,
      rows: 3,
      palette: ["v"],
      hearts: 4,
      par: 1,
      arrows: [
        {
          id: "spiral",
          color: "v",
          dir: "right",
          path: [
            { col: 2, row: 1 },
            { col: 2, row: 0 },
            { col: 1, row: 0 },
            { col: 0, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 1 },
          ],
        },
      ],
      blocks: [{ id: "b1", side: "right", start: 1, span: 1, layers: ["v"] }],
    };

    const { event } = fire(createState(spiral), "spiral");
    expect(event).toBe("destroyed");
  });
});

describe("fire — impact", () => {
  it("peels the top layer on a colour match", () => {
    const state = createState(ordered.level);
    const { state: after, event } = fire(state, "red");

    expect(event).toBe("peeled");
    expect(after.blocks[0]?.layers).toEqual(["b"]);
    expect(after.arrows.map((arrow) => arrow.id)).toEqual(["blue"]);
    expect(after.occupancy.size).toBe(1);
    expect(after.heartsLeft).toBe(state.heartsLeft);
  });

  it("leaves the other blocks alone when one is peeled", () => {
    const twoBlocks: LevelDef = {
      ...structuredClone(ordered.level),
      blocks: [
        { id: "b1", side: "top", start: 1, span: 1, layers: ["v", "b"] },
        { id: "b2", side: "bottom", start: 0, span: 1, layers: ["b"] },
      ],
    };
    const { state, event } = fire(createState(twoBlocks), "red");

    expect(event).toBe("peeled");
    expect(state.blocks.map((block) => block.layers)).toEqual([["b"], ["b"]]);
  });

  it("destroys a block when its last layer is peeled, and wins the level", () => {
    const { state, event } = fire(createState(singleShot.level), "a1");

    expect(event).toBe("destroyed");
    expect(state.blocks).toEqual([]);
    expect(state.status).toBe("won");
  });

  it("bounces back into the exact starting shape on a mismatch, for a heart", () => {
    const mismatch: LevelDef = {
      ...structuredClone(singleShot.level),
      palette: ["v", "b"],
      blocks: [{ id: "b1", side: "top", start: 1, span: 1, layers: ["b"] }],
    };
    const state = createState(mismatch);
    const { state: after, event } = fire(state, "a1");

    expect(event).toBe("bounced");
    expect(after.heartsLeft).toBe(state.heartsLeft - 1);
    expect(after.mistakes).toBe(1);
    expect(after.arrows).toEqual(state.arrows);
    expect(after.occupancy).toEqual(state.occupancy);
    expect(after.blocks).toEqual(state.blocks);
  });

  it("flies off an open lane for free, and the arrow is gone", () => {
    const state = createState(wideAndBent.level);
    const { state: after, event } = fire(state, "loose");

    expect(event).toBe("flewOff");
    expect(after.heartsLeft).toBe(state.heartsLeft);
    expect(after.mistakes).toBe(0);
    expect(after.arrows.map((arrow) => arrow.id)).toEqual(["bent"]);
    expect(after.blocks).toEqual(state.blocks);
  });

  it("flies off into a destroyed lane, free and irreversible", () => {
    const twoAtOne: LevelDef = {
      id: 11,
      cols: 3,
      rows: 3,
      palette: ["v"],
      hearts: 4,
      par: 2,
      arrows: [
        {
          id: "first",
          color: "v",
          dir: "up",
          path: [
            { col: 1, row: 1 },
            { col: 1, row: 0 },
          ],
        },
        { id: "second", color: "v", dir: "up", path: [{ col: 1, row: 2 }] },
      ],
      blocks: [
        { id: "b1", side: "top", start: 1, span: 1, layers: ["v"] },
        { id: "b2", side: "bottom", start: 0, span: 1, layers: ["v"] },
      ],
    };

    const afterFirst = play(createState(twoAtOne), "first");
    expect(afterFirst.blocks.map((block) => block.id)).toEqual(["b2"]);

    const { state: after, event } = fire(afterFirst, "second");
    expect(event).toBe("flewOff");
    expect(after.heartsLeft).toBe(afterFirst.heartsLeft);
    expect(after.arrows).toEqual([]);
    expect(after.status).toBe("playing");
  });
});

describe("fire — end states", () => {
  it("loses the level when the last heart goes", () => {
    const oneHeart: LevelDef = { ...structuredClone(ordered.level), hearts: 1 };
    const { state, event } = fire(createState(oneHeart), "blue");

    expect(event).toBe("blocked");
    expect(state.heartsLeft).toBe(0);
    expect(state.status).toBe("lost");
    expect(() => fire(state, "red")).toThrow(/cannot fire/);
  });

  it("continues with one heart and an untouched board", () => {
    const oneHeart: LevelDef = { ...structuredClone(ordered.level), hearts: 1 };
    const lost = fire(createState(oneHeart), "blue").state;
    const resumed = grantContinue(lost);

    expect(resumed.status).toBe("playing");
    expect(resumed.heartsLeft).toBe(1);
    expect(resumed.continuesUsed).toBe(1);
    expect(resumed.mistakes).toBe(1);
    expect(resumed.blocks).toEqual(lost.blocks);
    expect(resumed.arrows).toEqual(lost.arrows);
    expect(() => grantContinue(resumed)).toThrow(/cannot continue/);
  });

  it("marks a playing board stuck, and only a playing board", () => {
    const state = createState(ordered.level);
    expect(markStuck(state).status).toBe("stuck");

    const won = play(state, "red", "blue");
    expect(markStuck(won).status).toBe("won");
  });

  it("rejects a tap on an arrow that is not on the board", () => {
    expect(() => fire(createState(ordered.level), "ghost")).toThrow(/no arrow/);
  });
});

describe("stars", () => {
  it("comes from the mistake count alone", () => {
    expect(starsForMistakes(0)).toBe(3);
    expect(starsForMistakes(1)).toBe(2);
    expect(starsForMistakes(2)).toBe(1);
    expect(starsForMistakes(7)).toBe(1);
  });

  it("counts mistakes made before a continue", () => {
    const oneHeart: LevelDef = { ...structuredClone(ordered.level), hearts: 1 };
    const resumed = grantContinue(fire(createState(oneHeart), "blue").state);
    const won = play(resumed, "red", "blue");

    expect(won.status).toBe("won");
    expect(starsFor(won)).toBe(2);
  });

  it("scores nothing for an unfinished level", () => {
    expect(starsFor(createState(ordered.level))).toBe(0);
  });
});

describe("the fixture set", () => {
  it("is solved by its scripted taps, cleanly", () => {
    for (const fixture of fixtures) {
      const won = play(createState(fixture.level), ...fixture.solves);

      expect(won.status, `level ${fixture.level.id}`).toBe("won");
      expect(won.mistakes, `level ${fixture.level.id}`).toBe(0);
      expect(won.heartsLeft).toBe(fixture.level.hearts);
      expect(starsFor(won)).toBe(3);
      expect(fixture.solves).toHaveLength(fixture.level.par);
    }
  });
});

describe("fire — timed levels", () => {
  const timed: LevelDef = {
    ...ordered.level,
    id: 38,
    type: "timed",
    timeLimitMs: 45_000,
  };

  it("counts the mistake but never takes a heart", () => {
    // A timed level has exactly one failure currency, and it is the clock
    // (PROGRESSION.md 3). The session charges the five seconds.
    const state = createState(timed);
    const { state: after, event } = fire(state, "blue");

    expect(event).toBe("blocked");
    expect(after.heartsLeft).toBe(state.heartsLeft);
    expect(after.mistakes).toBe(1);
    expect(after.status).toBe("playing");
  });

  it("still loses a star for that mistake", () => {
    const after = play(createState(timed), "blue", "red", "blue");
    expect(after.status).toBe("won");
    expect(starsFor(after)).toBe(2);
  });

  it("runs out of time rather than out of hearts", () => {
    const outOfTime = markOutOfTime(createState(timed));
    expect(outOfTime.status).toBe("lost");
    // Marking it twice is the same board: the clock only expires once.
    expect(markOutOfTime(outOfTime)).toBe(outOfTime);
  });

  it("grants seconds, not a heart, on a continue", () => {
    const lost = markOutOfTime(createState(timed));
    const resumed = grantContinue(lost);

    expect(resumed.heartsLeft).toBe(lost.heartsLeft);
    expect(resumed.continuesUsed).toBe(1);
    expect(resumed.status).toBe("playing");
  });
});
