import type { Cue } from "./cues";
import { ESSENTIAL_CUES } from "./cues";

/**
 * The mixing rules in `AUDIO.md` section 4, kept free of the Web Audio API so
 * they can be asserted directly: which cue is allowed to sound right now, at
 * what pitch, and which voice is cut to make room. Nothing here makes a
 * sound; `engine.ts` is what turns a decision into nodes.
 */

/** At most this many effect voices sound at once; the newest wins. */
export const MAX_VOICES = 4;
/** The same cue may not retrigger inside this window, so a chain is not a rattle. */
export const RATE_LIMIT_MS = 60;

/**
 * The combo ladder (`AUDIO.md` 2). Pentatonic steps, so any run of peels
 * sounds intentional rather than like a siren, and a broken chain drops back
 * to the base note on its own without a "combo lost" sting.
 */
export const LADDER_SEMITONES = [0, 2, 4, 7, 9] as const;

export interface MixerSettings {
  sound: boolean;
  /** Collapses the set to the essentials (`AUDIO.md` 5). */
  reducedAudio: boolean;
}

export interface Voice {
  cue: Cue;
  startedAt: number;
  /** Called when the voice is cut early to make room for a newer one. */
  stop: () => void;
}

/** Playback rate for a cue at this multiplier, as a ratio of the base pitch. */
export function ladderRate(multiplier: number): number {
  const tier = Math.min(Math.max(Math.round(multiplier), 1), LADDER_SEMITONES.length);
  return 2 ** (LADDER_SEMITONES[tier - 1]! / 12);
}

/**
 * How much of the ladder a **recording** takes. A synthesised voice is built
 * at the pitch it is asked for, but a sample is resampled: the full ladder
 * played the arrow 68% fast at the cap, which shortened it and dragged its
 * whole spectrum up — heard as the sound getting sharper and more clipped
 * the better the player was doing, which is the opposite of a reward.
 *
 * A third of the interval is still an audible climb and leaves the recording
 * recognisably itself (`AUDIO.md` 2).
 */
export const SAMPLE_LADDER_DEPTH = 0.34;

/** The ladder as a recording should take it: the same climb, flattened. */
export function sampleLadderRate(multiplier: number): number {
  return 1 + (ladderRate(multiplier) - 1) * SAMPLE_LADDER_DEPTH;
}

/** True when this cue survives the current settings. */
export function allows(settings: MixerSettings, cue: Cue): boolean {
  if (!settings.sound) return false;
  return !settings.reducedAudio || ESSENTIAL_CUES.includes(cue);
}

/**
 * The voice book-keeping: which voices are still sounding, and which one is
 * cut when a new cue arrives. A rate-limited cue is refused outright rather
 * than queued — a sound that lands 60 ms late is feedback for nothing.
 */
export class VoicePool {
  #voices: Voice[] = [];
  #lastPlayed = new Map<Cue, number>();

  get size(): number {
    return this.#voices.length;
  }

  /** Drops voices that have finished, so the cap counts what is audible. */
  retire(now: number, lifetimeMs: number): void {
    this.#voices = this.#voices.filter((voice) => now - voice.startedAt < lifetimeMs);
  }

  rateLimited(cue: Cue, now: number): boolean {
    const last = this.#lastPlayed.get(cue);
    return last !== undefined && now - last < RATE_LIMIT_MS;
  }

  /**
   * Takes a slot for a new voice, cutting the oldest if the pool is full.
   * Returns false when the cue is rate-limited and must not sound at all.
   */
  admit(voice: Voice): boolean {
    if (this.rateLimited(voice.cue, voice.startedAt)) return false;

    while (this.#voices.length >= MAX_VOICES) {
      const oldest = this.#voices.shift();
      oldest?.stop();
    }

    this.#voices.push(voice);
    this.#lastPlayed.set(voice.cue, voice.startedAt);
    return true;
  }

  /** Cuts everything, for leaving a level or losing audio focus. */
  stopAll(): void {
    for (const voice of this.#voices) voice.stop();
    this.#voices = [];
  }
}
