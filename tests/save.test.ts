import { describe, expect, it } from "vitest";
import { SCORE_VERSION } from "@/game/score";
import {
  SAVE_VERSION,
  STORAGE_KEY,
  SaveStore,
  addHints,
  createSave,
  currentLevelId,
  isUnlocked,
  levelRecord,
  markColourNudgeShown,
  owesColourNudge,
  parseSave,
  recordColourMistake,
  recordWin,
  serialiseSave,
  spendHint,
  totalStars,
  updateSettings,
  COLOUR_NUDGE_AT,
} from "@/state/save";
import type { SaveStorage } from "@/state/save";

/** A storage that behaves, so only the save's own rules are under test. */
function memoryStorage(seed?: string): SaveStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(STORAGE_KEY, seed);
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const ORDER = [1, 2, 3, 4];

describe("the local save", () => {
  it("keeps the best of every figure, never the latest", () => {
    let save = recordWin(createSave(), { levelId: 3, stars: 3, score: 4200 });
    save = recordWin(save, { levelId: 3, stars: 1, score: 900 });

    expect(levelRecord(save, 3)).toEqual({ stars: 3, bestScore: 4200, bestTimeMs: null });
  });

  it("keeps the most clock left on a timed level", () => {
    let save = recordWin(createSave(), {
      levelId: 7,
      stars: 2,
      score: 100,
      remainingMs: 4_000,
    });
    save = recordWin(save, { levelId: 7, stars: 2, score: 100, remainingMs: 9_000 });
    save = recordWin(save, { levelId: 7, stars: 2, score: 100, remainingMs: 1_000 });

    expect(levelRecord(save, 7)?.bestTimeMs).toBe(9_000);
  });

  it("pays a hint for a three-star first clear, and only the first", () => {
    let save = recordWin(createSave(), { levelId: 1, stars: 3, score: 10 });
    expect(save.hints).toBe(1);

    // Replaying a cleared level can never farm the balance
    // (PROGRESSION.md 4.1).
    save = recordWin(save, { levelId: 1, stars: 3, score: 10 });
    expect(save.hints).toBe(1);

    // A first clear that is not perfect pays nothing.
    save = recordWin(save, { levelId: 2, stars: 2, score: 10 });
    expect(save.hints).toBe(1);
  });

  it("never spends a hint it does not have", () => {
    expect(spendHint(createSave()).hints).toBe(0);
    expect(spendHint(addHints(createSave(), 2)).hints).toBe(1);
    expect(addHints(createSave(), -5).hints).toBe(0);
  });

  it("opens a level once the one before it is cleared, stars or not", () => {
    const save = recordWin(createSave(), { levelId: 1, stars: 1, score: 10 });

    expect(isUnlocked(save, 1, ORDER)).toBe(true);
    expect(isUnlocked(save, 2, ORDER)).toBe(true);
    expect(isUnlocked(save, 3, ORDER)).toBe(false);
    expect(isUnlocked(save, 99, ORDER)).toBe(false);
    expect(currentLevelId(save, ORDER)).toBe(2);
  });

  it("counts stars and lands on the last level when everything is cleared", () => {
    let save = createSave();
    for (const id of ORDER) save = recordWin(save, { levelId: id, stars: 2, score: 10 });

    expect(totalStars(save)).toBe(8);
    expect(currentLevelId(save, ORDER)).toBe(4);
    expect(currentLevelId(createSave(), [])).toBe(null);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    store.update((save) => recordWin(save, { levelId: 2, stars: 3, score: 500 }));
    store.update((save) => updateSettings(save, { music: false }));

    const reloaded = new SaveStore(storage).save;
    expect(reloaded.settings.music).toBe(false);
    expect(reloaded.settings.sound).toBe(true);
    expect(levelRecord(reloaded, 2)?.bestScore).toBe(500);
    expect(reloaded.hints).toBe(1);
  });

  it("starts fresh rather than throwing on anything unreadable", () => {
    expect(parseSave(null)).toEqual(createSave());
    expect(parseSave("{not json")).toEqual(createSave());
    expect(parseSave("[]")).toEqual(createSave());
    // A save written by a newer build is not guessed at.
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION + 1, hints: 9 })).hints).toBe(
      0,
    );
  });

  it("ignores junk inside an otherwise valid save", () => {
    const save = parseSave(
      JSON.stringify({
        version: SAVE_VERSION,
        scoreVersion: SCORE_VERSION,
        hints: -4,
        settings: { sound: "yes", haptics: false },
        levels: { "2": { stars: 9, bestScore: 10 }, nope: { stars: 1 }, "3": 5 },
      }),
    );

    expect(save.hints).toBe(0);
    expect(save.settings.sound).toBe(true);
    expect(save.settings.haptics).toBe(false);
    expect(levelRecord(save, 2)).toEqual({ stars: 3, bestScore: 10, bestTimeMs: null });
    expect(levelRecord(save, 3)).toBeUndefined();
  });

  it("reads a save written before the display settings existed", () => {
    // Adding a boolean needs no migration: an absent one is its default, and
    // the defaults are the behaviour that shipped before the switch did.
    const save = parseSave(
      JSON.stringify({
        version: SAVE_VERSION,
        scoreVersion: SCORE_VERSION,
        hints: 2,
        settings: { sound: true, music: false, haptics: true, language: "en" },
        levels: {},
      }),
    );

    expect(save.settings.reducedMotion).toBe(false);
    expect(save.settings.colourBlindMode).toBe(false);
    expect(save.settings.music).toBe(false);
    expect(save.hints).toBe(2);
  });

  it("drops scores from an older formula but keeps the progress", () => {
    const old = serialiseSave({
      ...createSave(),
      scoreVersion: SCORE_VERSION - 1,
      levels: { "5": { stars: 3, bestScore: 9999, bestTimeMs: 8_000 } },
    });

    const save = parseSave(old);
    expect(save.scoreVersion).toBe(SCORE_VERSION);
    expect(levelRecord(save, 5)).toEqual({ stars: 3, bestScore: 0, bestTimeMs: null });
  });

  it("keeps playing when storage is missing or refuses to write", () => {
    const hostile: SaveStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    const store = new SaveStore(hostile);
    expect(store.update((save) => addHints(save, 3)).hints).toBe(3);
    expect(store.clear().hints).toBe(0);

    const none = new SaveStore(null);
    expect(none.update((save) => addHints(save, 1)).hints).toBe(1);
  });

  it("forgets everything on delete data", () => {
    const storage = memoryStorage();
    const store = new SaveStore(storage);
    store.update((save) => recordWin(save, { levelId: 1, stars: 3, score: 10 }));

    expect(store.clear()).toEqual(createSave());
    expect(storage.map.has(STORAGE_KEY)).toBe(false);
    expect(new SaveStore(storage).save).toEqual(createSave());
  });

  it("points at colour-blind mode only after enough wrong-colour taps", () => {
    let save = createSave();
    for (let i = 0; i < COLOUR_NUDGE_AT - 1; i += 1) {
      save = recordColourMistake(save);
      expect(owesColourNudge(save)).toBe(false);
    }

    save = recordColourMistake(save);
    expect(owesColourNudge(save)).toBe(true);

    save = markColourNudgeShown(save);
    expect(owesColourNudge(save)).toBe(false);
    // The count keeps no meaning once the line has been shown.
    expect(owesColourNudge(recordColourMistake(save))).toBe(false);
  });

  it("never mentions the mode to a player who already found it", () => {
    let save = updateSettings(createSave(), { colourBlindMode: true });
    for (let i = 0; i < COLOUR_NUDGE_AT + 2; i += 1) save = recordColourMistake(save);
    expect(owesColourNudge(save)).toBe(false);
    expect(save.nudges.colourMistakes).toBe(0);

    // Turning it back off is still an answer: the switch has been seen.
    save = updateSettings(save, { colourBlindMode: false });
    for (let i = 0; i < COLOUR_NUDGE_AT + 2; i += 1) save = recordColourMistake(save);
    expect(owesColourNudge(save)).toBe(false);
  });

  it("carries the nudge state through a round trip, and survives its absence", () => {
    const save = markColourNudgeShown(recordColourMistake(createSave()));
    expect(parseSave(serialiseSave(save)).nudges).toEqual(save.nudges);

    const older = JSON.parse(serialiseSave(createSave())) as Record<string, unknown>;
    delete older["nudges"];
    expect(parseSave(JSON.stringify(older)).nudges).toEqual(createSave().nudges);
  });
});
