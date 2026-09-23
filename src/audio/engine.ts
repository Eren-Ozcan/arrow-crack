import type { Cue } from "./cues";
import { HAPTIC_CUES, HAPTIC_MS } from "./cues";
import type { MixerSettings } from "./mixer";
import { allows, VoicePool } from "./mixer";
import { MusicLoop } from "./music";
import { SampleBank } from "./samples";
import type { ScheduledCue } from "./script";
import type { PlayOptions } from "./synth";
import { playCue } from "./synth";

/**
 * Owns the one `AudioContext`, the effects and music buses, and the rules in
 * `AUDIO.md` section 4 that need a clock: ducking, the voice cap, and audio
 * focus. The decisions themselves live in `mixer.ts`, which is where they can
 * be tested; this file is the part that has to touch the platform.
 *
 * The context is created on the first cue, not at start-up: a browser will
 * not let one run before the player has touched the screen, and a suspended
 * context created early is a context that never produces a sound.
 */

export interface AudioSettings extends MixerSettings {
  music: boolean;
  haptics: boolean;
}

/** How loud a sampled cue is played, so a file sits where its voice did. */
const SAMPLE_GAIN = 0.85;

/** The cues that duck the music, so a peel always cuts through (`AUDIO.md` 3). */
const DUCKING_CUES: readonly Cue[] = [
  "arrow",
  "blockBreak",
  "bomb",
  "bounce",
  "heartLost",
];
const DUCK_TO = 0.35;
const DUCK_MS = 220;

export class AudioEngine {
  #settings: AudioSettings;
  #context: AudioContext | null = null;
  #effects: GainNode | null = null;
  #musicGain: GainNode | null = null;
  #music: MusicLoop | null = null;
  #samples: SampleBank | null = null;
  #pool = new VoicePool();
  /** True while the loop is meant to be playing, across a focus loss. */
  #musicWanted = false;
  /** Cues waiting on their delay, so leaving a level can drop them. */
  #timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(settings: AudioSettings) {
    this.#settings = settings;
    this.#watchFocus();
  }

  update(settings: AudioSettings): void {
    const wasMusic = this.#settings.music;
    this.#settings = settings;

    if (!settings.sound) this.#pool.stopAll();
    if (wasMusic !== settings.music) {
      if (settings.music) this.startMusic();
      else this.stopMusic();
    }
  }

  /**
   * Plays a cue, or declines to: the settings, the rate limit and the voice
   * cap can each refuse it, and a refused cue is dropped rather than queued.
   */
  play(cue: Cue, options: PlayOptions = {}): void {
    if (import.meta.env.DEV) {
      const log = ((globalThis as Record<string, unknown>).__cues ??= []) as unknown[];
      log.push({ cue, at: Math.round(performance.now()) });
    }
    this.#haptic(cue);
    if (!allows(this.#settings, cue)) return;

    const context = this.#ensureContext();
    if (!context || !this.#effects) return;

    const now = performance.now();
    this.#pool.retire(now, 1000);
    if (this.#pool.rateLimited(cue, now)) return;

    // A sampled cue wins when its file has arrived; until then the cue is
    // synthesised, so nothing is ever silent waiting on a download
    // (`AUDIO.md` 6).
    const sampled = this.#samples?.play(
      cue,
      options.rate ?? 1,
      SAMPLE_GAIN,
      this.#effects,
    );
    const stop = sampled ?? playCue(context, this.#effects, cue, options).stop;

    const admitted = this.#pool.admit({ cue, startedAt: now, stop });
    if (!admitted) {
      stop();
      return;
    }

    if (DUCKING_CUES.includes(cue)) this.#duck();
  }

  /**
   * Plays a scripted sequence — a shot, or the win panel. The delays are what
   * keep two facts from landing as one sound, so they are honoured even when
   * the cue they belong to ends up refused.
   */
  playSequence(cues: readonly ScheduledCue[]): void {
    for (const scheduled of cues) {
      if (scheduled.delayMs <= 0) {
        this.play(scheduled.cue, scheduled.options);
        continue;
      }
      const timer = setTimeout(() => {
        this.#timers.delete(timer);
        this.play(scheduled.cue, scheduled.options);
      }, scheduled.delayMs);
      this.#timers.add(timer);
    }
  }

  startMusic(): void {
    this.#musicWanted = true;
    if (!this.#settings.music) return;

    const context = this.#ensureContext();
    if (!context || !this.#musicGain) return;
    this.#music ??= new MusicLoop(context, this.#musicGain);
    this.#music.start();
  }

  stopMusic(): void {
    this.#musicWanted = false;
    this.#music?.stop();
  }

  /** Leaving a level: nothing that was playing belongs to the next screen. */
  stopAll(): void {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#pool.stopAll();
  }

  #haptic(cue: Cue): void {
    // Paired with the sound, never a substitute for it: a player with the
    // sound off still feels the heart go (`AUDIO.md` 4).
    if (!this.#settings.haptics || !HAPTIC_CUES.includes(cue)) return;
    navigator.vibrate?.(HAPTIC_MS[cue] ?? 15);
  }

  #ensureContext(): AudioContext | null {
    if (this.#context) {
      // A context can be suspended by the platform at any time; a cue is a
      // gesture's own result, so this is the moment it is allowed to resume.
      if (this.#context.state === "suspended") void this.#context.resume();
      return this.#context;
    }

    const Constructor = globalThis.AudioContext;
    if (!Constructor) return null;

    const context = new Constructor();
    const effects = context.createGain();
    const music = context.createGain();

    effects.gain.value = 1;
    music.gain.value = 1;
    effects.connect(context.destination);
    music.connect(context.destination);

    this.#context = context;
    this.#effects = effects;
    this.#musicGain = music;
    this.#samples = new SampleBank(context);
    this.#samples.preload();
    return context;
  }

  /** Dips the music under an impact and lets it back up straight after. */
  #duck(): void {
    const context = this.#context;
    const gain = this.#musicGain;
    if (!context || !gain) return;

    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(DUCK_TO, now + 0.02);
    gain.gain.linearRampToValueAtTime(1, now + DUCK_MS / 1000);
  }

  /**
   * Android audio focus (`AUDIO.md` 4): another app taking the output pauses
   * the music, and it comes back only if it was playing before. The WebView
   * reports that as the page being hidden, which is also what a phone call
   * and a backgrounded game look like.
   */
  #watchFocus(): void {
    if (typeof document === "undefined") return;

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopAll();
        this.#music?.stop();
        void this.#context?.suspend();
        return;
      }

      void this.#context?.resume();
      if (this.#musicWanted && this.#settings.music) this.#music?.start();
    });
  }
}
