import { describe, expect, it } from "vitest";
import { ESSENTIAL_CUES, HAPTIC_CUES } from "@/audio/cues";
import type { Cue } from "@/audio/cues";
import {
  allows,
  ladderRate,
  LADDER_SEMITONES,
  MAX_VOICES,
  sampleLadderRate,
  VoicePool,
} from "@/audio/mixer";
import { FOCUS_DUCK_GAIN, focusResponse } from "@/audio/focus";
import type { FocusChange } from "@/audio/focus";
import { cuesFor, cuesForShot, cuesForWin } from "@/audio/script";
import type { Shot } from "@/audio/script";
import { playCue } from "@/audio/synth";
import { DEFAULT_SETTINGS, parseSave } from "@/state/save";

/**
 * The rules in `AUDIO.md` that are rules rather than waveforms. What a cue
 * sounds like is judged by ear; when it plays, whether it plays at all, and
 * what it is pitched to are decisions, and they are asserted here.
 */

function shot(patch: Partial<Shot> = {}): Shot {
  return {
    kind: "shot",
    event: "peeled",
    special: null,
    travel: 0.5,
    slideMs: 600,
    multiplier: 1,
    heartLost: false,
    comboStepped: false,
    ...patch,
  };
}

function delayOf(cues: ReturnType<typeof cuesForShot>, cue: Cue): number {
  const found = cues.find((scheduled) => scheduled.cue === cue);
  expect(found, `${cue} was not played`).toBeDefined();
  return found!.delayMs;
}

describe("AUDIO.md 2 — the combo pitch ladder", () => {
  it("climbs the pentatonic scale a tier at a time", () => {
    const rates = [1, 2, 3, 4, 5].map((multiplier) => ladderRate(multiplier));
    expect(rates[0]).toBeCloseTo(1, 5);

    for (let tier = 1; tier < rates.length; tier += 1) {
      expect(rates[tier]!).toBeGreaterThan(rates[tier - 1]!);
      expect(rates[tier]!).toBeCloseTo(2 ** (LADDER_SEMITONES[tier]! / 12), 5);
    }
  });

  it("drops back to the base note when the chain breaks", () => {
    // There is no "combo lost" sting, so the fall itself has to be audible:
    // the next peel at x1 is the base pitch again.
    expect(ladderRate(5)).toBeGreaterThan(1);
    expect(ladderRate(1)).toBe(1);
  });

  it("flattens the climb for a recording, without taking it away", () => {
    // A synthesised voice is built at the pitch it is asked for; a recording
    // is resampled, so the full interval shortened the arrow and dragged it
    // bright — the reward got sharper the better the player did.
    const top = sampleLadderRate(5);

    expect(top).toBeGreaterThan(1);
    expect(top).toBeLessThan(ladderRate(5));
    expect(top).toBeLessThan(1.25);
    expect(sampleLadderRate(1)).toBe(1);
    expect(sampleLadderRate(4)).toBeGreaterThan(sampleLadderRate(2));
  });

  it("holds the top of the ladder at the multiplier cap", () => {
    expect(ladderRate(9)).toBe(ladderRate(LADDER_SEMITONES.length));
  });
});

describe("AUDIO.md 4 — mixing", () => {
  it("cuts the oldest voice once the cap is reached", () => {
    const pool = new VoicePool();
    const stopped: string[] = [];
    const cues: Cue[] = ["arrow", "blockBreak", "bounce", "hint", "star"];

    cues.forEach((cue, index) => {
      pool.admit({ cue, startedAt: index * 100, stop: () => stopped.push(cue) });
    });

    expect(pool.size).toBe(MAX_VOICES);
    expect(stopped).toEqual(["arrow"]);
  });

  it("refuses the same cue twice inside the rate limit", () => {
    const pool = new VoicePool();
    const noop = (): void => {};

    expect(pool.admit({ cue: "arrow", startedAt: 0, stop: noop })).toBe(true);
    expect(pool.admit({ cue: "arrow", startedAt: 40, stop: noop })).toBe(false);
    expect(pool.admit({ cue: "arrow", startedAt: 70, stop: noop })).toBe(true);
  });

  it("lets a different cue through inside that window", () => {
    // The limit exists so a fast chain does not rattle, not to thin the mix.
    const pool = new VoicePool();
    const noop = (): void => {};

    pool.admit({ cue: "arrow", startedAt: 0, stop: noop });
    expect(pool.admit({ cue: "heartLost", startedAt: 10, stop: noop })).toBe(true);
  });

  it("stops counting a voice once it has finished", () => {
    const pool = new VoicePool();
    pool.admit({ cue: "arrow", startedAt: 0, stop: () => {} });
    pool.retire(2000, 1000);
    expect(pool.size).toBe(0);
  });

  it("pairs a haptic with the impacts, and with the heart above all", () => {
    expect(HAPTIC_CUES).toContain("heartLost");
    expect(HAPTIC_CUES).toContain("arrow");
    expect(HAPTIC_CUES).not.toContain("select");
  });
});

describe("AUDIO.md 5 — reduced audio", () => {
  const settings = { sound: true, reducedAudio: true };

  it("keeps the reward, the heart and the win", () => {
    for (const cue of ESSENTIAL_CUES) expect(allows(settings, cue)).toBe(true);
  });

  it("drops the layering", () => {
    for (const cue of ["slide", "select", "comboStep", "tick"] as Cue[]) {
      expect(allows(settings, cue)).toBe(false);
    }
  });

  it("is not a mute switch, and the mute switch is not it", () => {
    expect(allows({ sound: false, reducedAudio: false }, "arrow")).toBe(false);
    expect(allows({ sound: true, reducedAudio: false }, "select")).toBe(true);
  });

  it("defaults off, and a save written before it existed still loads", () => {
    expect(DEFAULT_SETTINGS.reducedAudio).toBe(false);

    const legacy = parseSave(
      JSON.stringify({
        version: 1,
        levels: {},
        hints: 0,
        settings: { sound: true, music: true, haptics: true, language: "en" },
      }),
    );
    expect(legacy.settings.reducedAudio).toBe(false);
  });
});

/**
 * Enough of the Web Audio API to build a voice on. The point is not to hear
 * anything — it is that every cue in the set schedules something and can be
 * cut again, since a cue that throws would take a frame of the game with it.
 */
function fakeContext(): { context: AudioContext; starts: () => number } {
  let started = 0;
  const param = (): AudioParam =>
    ({
      value: 1,
      setValueAtTime: () => param(),
      exponentialRampToValueAtTime: () => param(),
      linearRampToValueAtTime: () => param(),
      cancelScheduledValues: () => param(),
    }) as unknown as AudioParam;

  const node = (extra: Record<string, unknown> = {}): AudioNode =>
    ({
      connect: (next: AudioNode) => next,
      disconnect: () => {},
      ...extra,
    }) as unknown as AudioNode;

  const source = (extra: Record<string, unknown> = {}): AudioNode =>
    node({
      start: () => {
        started += 1;
      },
      stop: () => {},
      ...extra,
    });

  const context = {
    currentTime: 0,
    sampleRate: 48_000,
    destination: node(),
    createGain: () => node({ gain: param() }),
    createOscillator: () => source({ frequency: param(), type: "sine" }),
    createBiquadFilter: () => node({ frequency: param(), Q: param(), type: "lowpass" }),
    createBufferSource: () => source({ buffer: null, loop: false }),
    createBuffer: (channels: number, length: number) => ({
      sampleRate: 48_000,
      getChannelData: () => new Float32Array(length),
      numberOfChannels: channels,
    }),
  } as unknown as AudioContext;

  return { context, starts: () => started };
}

describe("AUDIO.md 6 — every cue is synthesised", () => {
  it("schedules something for every cue in the set, and can cut it again", () => {
    const cues: Cue[] = [
      "select",
      "arrowMiss",
      "arrow",
      "blockBreak",
      "bounce",
      "blocked",
      "heartLost",
      "comboStep",
      "joker",
      "ghost",
      "bomb",
      "hint",
      "tick",
      "win",
      "star",
      "perfect",
    ];

    for (const cue of cues) {
      const { context, starts } = fakeContext();
      const voice = playCue(context, context.destination, cue, { rate: 1.2, index: 1 });

      expect(starts(), cue).toBeGreaterThan(0);
      expect(voice.durationMs, cue).toBeGreaterThan(0);
      expect(() => voice.stop(), cue).not.toThrow();
    }
  });
});

describe("AUDIO.md 1 — what a shot sounds like", () => {
  it("lands the heart after the sound that cost it, never under it", () => {
    const cues = cuesForShot(shot({ event: "bounced", heartLost: true }));
    expect(delayOf(cues, "heartLost")).toBeGreaterThan(delayOf(cues, "bounce"));
  });

  it("does the same for a blocked tap, which costs a heart without a bounce", () => {
    const cues = cuesForShot(shot({ event: "blocked", heartLost: true }));
    expect(delayOf(cues, "heartLost")).toBeGreaterThan(delayOf(cues, "blocked"));
  });

  it("makes one sound per fact, not a stack of them", () => {
    // The travel used to sound as well as the impact, which read as two
    // objects for one decision. A destroyed block is genuinely two facts.
    for (const event of ["peeled", "blocked"] as const) {
      expect(cuesForShot(shot({ event })), event).toHaveLength(1);
    }
    // A destroyed block and a bounce are each genuinely two facts: the arrow
    // that went, and what it met.
    expect(cuesForShot(shot({ event: "destroyed" }))).toHaveLength(2);
    expect(cuesForShot(shot({ event: "bounced" }))).toHaveLength(2);
  });

  it("gives a special its own sound instead of the arrow's, never on top", () => {
    for (const special of ["joker", "bomb", "ghost"] as const) {
      const cues = cuesForShot(shot({ special }));
      expect(
        cues.map((one) => one.cue),
        special,
      ).toEqual([special]);
    }
  });

  it("pitches the peel by the multiplier it scored at", () => {
    const cues = cuesForShot(shot({ multiplier: 4 }));
    const peel = cues.find((scheduled) => scheduled.cue === "arrow");
    expect(peel?.options?.rate).toBeCloseTo(ladderRate(4), 5);
  });

  it("marks a flight that hit nothing as a shot that did not land", () => {
    // The flight into a destroyed lane is free and irreversible.
    const cues = cuesForShot(shot({ event: "flewOff" }));
    expect(cues.map((scheduled) => scheduled.cue)).toEqual(["arrowMiss"]);
  });

  it("never steps the combo on a shot that broke it", () => {
    const cues = cuesForShot(shot({ event: "bounced", comboStepped: true }));
    expect(cues.some((scheduled) => scheduled.cue === "comboStep")).toBe(false);
  });

  it("sounds the select before there is an outcome to report", () => {
    expect(cuesFor({ kind: "select" })).toEqual([{ cue: "select", delayMs: 0 }]);
  });

  it("holds the block's sound until the body has actually arrived", () => {
    // The arrow is heard at the tap; the block is heard when it is hit, and
    // "when it is hit" is the slide the animation plays, not an estimate of
    // it — the two drifting apart is the block breaking before the arrow
    // reaches it.
    const short = cuesForShot(shot({ event: "destroyed", slideMs: 200 }));
    const long = cuesForShot(shot({ event: "destroyed", slideMs: 1000 }));
    expect(delayOf(short, "blockBreak")).toBe(200);
    expect(delayOf(long, "blockBreak")).toBe(1000);
  });
});

describe("AUDIO.md 1 — the win panel", () => {
  it("plays one note per star, on the ART.md 7 stagger", () => {
    const cues = cuesForWin(3, false);
    const stars = cues.filter((scheduled) => scheduled.cue === "star");

    expect(stars).toHaveLength(3);
    expect(stars[1]!.delayMs - stars[0]!.delayMs).toBe(200);
    expect(stars[2]!.delayMs - stars[1]!.delayMs).toBe(200);
  });

  it("puts the perfect note above the last star, and only on a clean clear", () => {
    const perfect = cuesForWin(3, true);
    const last = perfect.filter((scheduled) => scheduled.cue === "star").at(-1)!;
    const badge = perfect.find((scheduled) => scheduled.cue === "perfect")!;

    expect(badge.delayMs).toBeGreaterThan(last.delayMs);
    expect(cuesForWin(3, false).some((one) => one.cue === "perfect")).toBe(false);
  });

  it("opens with the sting, once", () => {
    const stings = cuesForWin(1, false).filter((scheduled) => scheduled.cue === "win");
    expect(stings).toHaveLength(1);
    expect(stings[0]!.delayMs).toBe(0);
  });

  it("gets out of the way of a call and comes back after it", () => {
    // AUDIO.md 4. A transient loss is a call or a navigation prompt: stop,
    // keep the focus, and expect it back.
    expect(focusResponse("lostTransient")).toEqual({
      music: "pause",
      duck: false,
      abandon: false,
    });
    expect(focusResponse("gained")).toEqual({
      music: "resume",
      duck: false,
      abandon: false,
    });
  });

  it("hands the output over for good when it is taken for good", () => {
    // A permanent loss is another app owning the output now. Holding focus
    // we are not using is the thing this whole path exists to stop.
    expect(focusResponse("lost")).toEqual({
      music: "pause",
      duck: false,
      abandon: true,
    });
  });

  it("plays under a notification rather than cutting out", () => {
    const ducked = focusResponse("ducked");
    expect(ducked.music).toBe("keep");
    expect(ducked.duck).toBe(true);
    expect(ducked.abandon).toBe(false);
    // Quiet enough to talk over, loud enough that the loop has not stopped.
    expect(FOCUS_DUCK_GAIN).toBeGreaterThan(0);
    expect(FOCUS_DUCK_GAIN).toBeLessThan(0.5);
  });

  it("answers every change Android can send", () => {
    const changes: FocusChange[] = ["gained", "lost", "lostTransient", "ducked"];
    for (const change of changes) {
      const response = focusResponse(change);
      expect(["resume", "pause", "keep"], change).toContain(response.music);
    }
  });
});
