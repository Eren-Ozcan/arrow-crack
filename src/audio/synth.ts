import type { Cue } from "./cues";

/**
 * Every cue is synthesised, not sampled (`AUDIO.md` 6): oscillators, noise
 * bursts and envelopes built at playback time. That keeps the audio budget at
 * zero bytes, keeps a licence out of `THIRD-PARTY-NOTICES.md`, and makes the
 * combo ladder a playback rate rather than five files — which is what the
 * ladder asked for in the first place.
 *
 * The character each cue is aiming at is the table in `AUDIO.md` section 1.
 * Short, precise, mechanical: the click of something fitting.
 */

export interface PlayOptions {
  /** Pitch ratio; the combo ladder passes it for a peel. */
  rate?: number;
  /** 0-1, how much work the shot was — the slide's length rides on it. */
  travel?: number;
  /** Which of a series this is: the star reveal counts 0, 1, 2. */
  index?: number;
}

export interface PlayingVoice {
  /** Cuts the voice early, for the voice cap in `AUDIO.md` 4. */
  stop: () => void;
  /** How long the voice sounds, so the pool knows when it has retired. */
  durationMs: number;
}

/** One second of mono white noise, built once and shared by every noise voice. */
let noiseBuffer: AudioBuffer | null = null;

function noise(context: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;

  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

interface Piece {
  /** Nodes to stop when the voice is cut. */
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
}

/** A plucked or struck tone: one oscillator under a percussive envelope. */
function tone(
  context: AudioContext,
  destination: AudioNode,
  at: number,
  options: {
    type: OscillatorType;
    from: number;
    to?: number;
    peak: number;
    attack?: number;
    decay: number;
  },
): Piece {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attack = options.attack ?? 0.002;

  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.from, at);
  if (options.to !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(options.to, at + options.decay);
  }

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(options.peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + options.decay);

  oscillator.connect(gain).connect(destination);
  oscillator.start(at);
  oscillator.stop(at + attack + options.decay + 0.02);
  return { sources: [oscillator], gain };
}

/** A filtered noise burst: every knock, clack, shatter and whoosh in the set. */
function burst(
  context: AudioContext,
  destination: AudioNode,
  at: number,
  options: {
    filter: BiquadFilterType;
    from: number;
    to?: number;
    q?: number;
    peak: number;
    attack?: number;
    decay: number;
  },
): Piece {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const attack = options.attack ?? 0.001;

  source.buffer = noise(context);
  source.loop = true;
  filter.type = options.filter;
  filter.Q.value = options.q ?? 1;
  filter.frequency.setValueAtTime(options.from, at);
  if (options.to !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(options.to, at + options.decay);
  }

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(options.peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + options.decay);

  source.connect(filter).connect(gain).connect(destination);
  source.start(at);
  source.stop(at + attack + options.decay + 0.02);
  return { sources: [source], gain };
}

/** Semitones above a base frequency, for the ladder and the star reveal. */
function step(base: number, semitones: number): number {
  return base * 2 ** (semitones / 12);
}

/**
 * **The** arrow sound: one voice, one arrow. A shot used to be a stack — a
 * release, a flight and an impact — and a stack is what made it sound like
 * three objects instead of one. It is a single filtered crack now, swept
 * down hard and gone in under a tenth of a second, and it carries the combo
 * ladder in its pitch (`AUDIO.md` 1, 2).
 *
 * There is deliberately **no low body under it**: a low tone with a fast
 * decay is a drum however it is dressed, and a drum is a membrane, not a
 * point entering wood.
 */
function peel(
  context: AudioContext,
  destination: AudioNode,
  at: number,
  rate: number,
): Piece[] {
  return [
    burst(context, destination, at, {
      filter: "bandpass",
      from: 3800 * rate,
      to: 850 * rate,
      q: 0.9,
      peak: 0.44,
      decay: 0.06,
    }),
  ];
}

/**
 * Builds the voice for a cue. Returns the pieces so the caller can cut them;
 * the character notes are in `AUDIO.md` section 1 and are the spec for each
 * branch here.
 */
export function playCue(
  context: AudioContext,
  destination: AudioNode,
  cue: Cue,
  options: PlayOptions = {},
): PlayingVoice {
  const at = context.currentTime;
  const rate = options.rate ?? 1;
  const pieces: Piece[] = [];
  let durationMs = 200;

  switch (cue) {
    case "select":
      // Fires the moment the touch is ruled a tap, before the outcome is
      // known, so it says nothing about the outcome: a click, and a quiet one.
      pieces.push(
        burst(context, destination, at, {
          filter: "highpass",
          from: 1800,
          q: 0.7,
          peak: 0.12,
          decay: 0.02,
        }),
      );
      durationMs = 40;
      break;

    case "arrowMiss": {
      // An arrow that left the board without hitting anything: the same
      // voice as a hit, thinner and unresolved, so a free flight is heard as
      // a shot that did not land rather than as a second kind of object.
      const work = Math.min(Math.max(options.travel ?? 0.3, 0), 1);
      pieces.push(
        burst(context, destination, at, {
          filter: "bandpass",
          from: 2600,
          to: 1200,
          q: 1.6,
          peak: 0.16,
          decay: 0.05 + work * 0.05,
        }),
      );
      durationMs = 120;
      break;
    }

    case "arrow":
      pieces.push(...peel(context, destination, at, rate));
      durationMs = 150;
      break;

    case "joker":
      // The peel with a shimmer layer over it: the same reward, marked.
      pieces.push(...peel(context, destination, at, rate));
      pieces.push(
        tone(context, destination, at + 0.02, {
          type: "sine",
          from: step(1320, 0),
          to: step(1980, 0),
          peak: 0.1,
          attack: 0.01,
          decay: 0.34,
        }),
      );
      durationMs = 380;
      break;

    case "blockBreak":
      // Fuller than a peel, with a debris tail.
      pieces.push(
        burst(context, destination, at, {
          filter: "highpass",
          from: 900,
          to: 2600,
          peak: 0.3,
          decay: 0.22,
        }),
        burst(context, destination, at + 0.05, {
          filter: "bandpass",
          from: 3200,
          to: 1400,
          q: 0.8,
          peak: 0.12,
          attack: 0.01,
          decay: 0.3,
        }),
      );
      durationMs = 380;
      break;

    case "bounce":
      // Muted, not harsh: it already cost a heart, and the heart has its own
      // sound a beat later.
      pieces.push(
        tone(context, destination, at, {
          type: "sine",
          from: 150,
          to: 82,
          peak: 0.34,
          decay: 0.16,
        }),
        burst(context, destination, at, {
          filter: "lowpass",
          from: 700,
          to: 260,
          peak: 0.1,
          decay: 0.1,
        }),
      );
      durationMs = 200;
      break;

    case "blocked":
      // A locked door, not an error buzzer. The player misread; do not scold.
      pieces.push(
        tone(context, destination, at, {
          type: "triangle",
          from: 190,
          to: 130,
          peak: 0.22,
          decay: 0.07,
        }),
      );
      durationMs = 90;
      break;

    case "heartLost":
      // The one emotionally negative sound in the game, and the only cue that
      // is allowed to be slow.
      pieces.push(
        tone(context, destination, at, {
          type: "sine",
          from: 220,
          to: 110,
          peak: 0.34,
          attack: 0.008,
          decay: 0.42,
        }),
        tone(context, destination, at + 0.01, {
          type: "triangle",
          from: 146,
          to: 73,
          peak: 0.16,
          attack: 0.01,
          decay: 0.38,
        }),
      );
      durationMs = 460;
      break;

    case "comboStep":
      pieces.push(
        tone(context, destination, at, {
          type: "sine",
          from: step(440, 0) * rate,
          peak: 0.16,
          attack: 0.006,
          decay: 0.16,
        }),
      );
      durationMs = 180;
      break;

    case "ghost":
      // It passes through things, so it has no attack to speak of.
      pieces.push(
        burst(context, destination, at, {
          filter: "bandpass",
          from: 900,
          to: 2200,
          q: 2.2,
          peak: 0.12,
          attack: 0.09,
          decay: 0.26,
        }),
      );
      durationMs = 360;
      break;

    case "bomb":
      // Three peels, so three transients — the ear should be able to count
      // them, which is why they are spaced rather than layered. They are the
      // peel itself, pitched down a step each time, and not a drum roll.
      for (let hit = 0; hit < 3; hit += 1) {
        pieces.push(
          ...peel(context, destination, at + hit * 0.075, rate * (1 - hit * 0.08)),
        );
      }
      durationMs = 400;
      break;

    case "hint":
      // Quiet; a hint is not a victory.
      pieces.push(
        tone(context, destination, at, {
          type: "sine",
          from: 880,
          peak: 0.1,
          attack: 0.01,
          decay: 0.3,
        }),
        tone(context, destination, at + 0.06, {
          type: "sine",
          from: 1320,
          peak: 0.07,
          attack: 0.01,
          decay: 0.28,
        }),
      );
      durationMs = 400;
      break;

    case "tick":
      // Never a heartbeat, never an alarm: it informs, it does not panic.
      pieces.push(
        burst(context, destination, at, {
          filter: "bandpass",
          from: 2200,
          q: 3,
          peak: 0.07,
          decay: 0.015,
        }),
      );
      durationMs = 30;
      break;

    case "win": {
      // Once, not a fanfare: three notes and done.
      const notes = [0, 4, 7];
      notes.forEach((semitones, position) => {
        pieces.push(
          tone(context, destination, at + position * 0.09, {
            type: "triangle",
            from: step(523.25, semitones),
            peak: 0.2,
            attack: 0.008,
            decay: 0.26,
          }),
        );
      });
      durationMs = 520;
      break;
    }

    case "star":
      // One note per star, played on the 200 ms stagger the reveal uses.
      pieces.push(
        tone(context, destination, at, {
          type: "sine",
          from: step(659.25, [0, 4, 7][options.index ?? 0] ?? 0),
          peak: 0.2,
          attack: 0.006,
          decay: 0.3,
        }),
      );
      durationMs = 340;
      break;

    case "perfect":
      // One bright note above the third star, and only for a clean clear.
      pieces.push(
        tone(context, destination, at, {
          type: "sine",
          from: step(659.25, 12),
          peak: 0.22,
          attack: 0.005,
          decay: 0.42,
        }),
        tone(context, destination, at + 0.02, {
          type: "sine",
          from: step(659.25, 19),
          peak: 0.1,
          attack: 0.005,
          decay: 0.36,
        }),
      );
      durationMs = 480;
      break;
  }

  return {
    durationMs,
    stop: () => {
      const now = context.currentTime;
      for (const piece of pieces) {
        // Ramped down rather than cut, so a stolen voice does not click.
        piece.gain.gain.cancelScheduledValues(now);
        piece.gain.gain.setValueAtTime(Math.max(piece.gain.gain.value, 0.0001), now);
        piece.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
        for (const source of piece.sources) {
          try {
            source.stop(now + 0.02);
          } catch {
            // Already stopped; a voice that retired on its own is not an error.
          }
        }
      }
    },
  };
}
