import type { Cue } from "./cues";
import { SAMPLE_LADDER_DEPTH } from "./mixer";

/**
 * Cues that are a recorded file rather than a synthesised voice
 * (`AUDIO.md` 6). The set is synthesised by default and this is the list of
 * exceptions — each one is a licence line in `THIRD-PARTY-NOTICES.md`, so
 * the list stays short and every entry has to have earned its place by
 * sounding better than the code did.
 *
 * A file that is missing or will not decode is not an error: the cue falls
 * back to its synthesised voice, which is why every cue still has one.
 */
export const SAMPLE_SOURCES: Partial<Record<Cue, string>> = {
  arrow: "/audio/arrow.mp3",
  arrowMiss: "/audio/arrow.mp3",
};

/**
 * How each cue wears the shared arrow recording. One file, one sound: a
 * shot that hit nothing is the same arrow, thinner and further away. What
 * the arrow hit is a separate cue, not a different arrow (`AUDIO.md` 1).
 */
export const SAMPLE_SHAPE: Partial<Record<Cue, { rate: number; gain: number }>> = {
  // Played under its recorded speed: the swoosh is short, and at 1.0 it was
  // gone before the arrow had crossed the board.
  arrow: { rate: 0.82, gain: 1 },
  // Identical. An arrow that hit nothing is the same arrow leaving — the
  // shading that was here was heard as the sound going missing, and what
  // the arrow met is the block's own cue to report, not the arrow's.
  arrowMiss: { rate: 0.82, gain: 1 },
};

/**
 * Loads the sampled cues once and plays them. Pitch is the playback rate, so
 * the combo ladder works on a file exactly as it worked on a voice — one
 * sound, five tiers, no second file (`AUDIO.md` 2).
 */
export class SampleBank {
  #context: AudioContext;
  // Keyed by URL, not by cue: several cues share the one arrow recording,
  // and each of them asking for it separately was three downloads of the
  // same file.
  #buffers = new Map<string, AudioBuffer>();
  #loading = new Map<string, Promise<void>>();

  constructor(context: AudioContext) {
    this.#context = context;
  }

  /** Starts loading every sampled cue; failures are silent by design. */
  preload(): void {
    for (const url of new Set(Object.values(SAMPLE_SOURCES))) void this.#load(url);
  }

  has(cue: Cue): boolean {
    const url = SAMPLE_SOURCES[cue];
    return url !== undefined && this.#buffers.has(url);
  }

  /**
   * Plays the sample for this cue, or returns null when there is none yet —
   * the caller then synthesises it, so the first shot of a session is never
   * silent while a file is still in flight.
   */
  play(
    cue: Cue,
    rate: number,
    gain: number,
    destination: AudioNode,
  ): (() => void) | null {
    const url = SAMPLE_SOURCES[cue];
    const buffer = url === undefined ? undefined : this.#buffers.get(url);
    if (!buffer) {
      if (url !== undefined) void this.#load(url);
      return null;
    }

    const shape = SAMPLE_SHAPE[cue] ?? { rate: 1, gain: 1 };
    // `rate` arrives as the full musical interval the synthesised voices are
    // built at. A recording is resampled rather than rebuilt, so it takes
    // only a fraction of that climb (`SAMPLE_LADDER_DEPTH`).
    const laddered = 1 + (rate - 1) * SAMPLE_LADDER_DEPTH;
    const source = this.#context.createBufferSource();
    const level = this.#context.createGain();

    source.buffer = buffer;
    source.playbackRate.value = laddered * shape.rate;
    level.gain.value = gain * shape.gain;
    source.connect(level).connect(destination);
    source.start();

    return () => {
      const now = this.#context.currentTime;
      level.gain.cancelScheduledValues(now);
      level.gain.setValueAtTime(Math.max(level.gain.value, 0.0001), now);
      level.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
      try {
        source.stop(now + 0.02);
      } catch {
        // Already ended; a voice that retired on its own is not an error.
      }
    };
  }

  async #load(url: string): Promise<void> {
    if (this.#buffers.has(url)) return;

    const existing = this.#loading.get(url);
    if (existing) return existing;

    const loading = (async (): Promise<void> => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        this.#buffers.set(
          url,
          await this.#context.decodeAudioData(await response.arrayBuffer()),
        );
      } catch {
        // No file, or not audio this browser decodes: the voice covers it.
      } finally {
        this.#loading.delete(url);
      }
    })();

    this.#loading.set(url, loading);
    return loading;
  }
}
