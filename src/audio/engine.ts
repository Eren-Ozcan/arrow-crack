import type { Cue } from "./cues";
import { HAPTIC_CUES, HAPTIC_MS } from "./cues";
import type { AudioFocusBridge, FocusChange } from "./focus";
import { FOCUS_DUCK_GAIN, focusResponse } from "./focus";
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

export interface AudioEngineOptions {
  /**
   * The native audio-focus plugin. Absent in the browser and in tests, where
   * there is no focus to hold — the engine then behaves exactly as it did
   * before, on the visibility signal alone.
   */
  focus?: AudioFocusBridge | null;
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
  #focus: AudioFocusBridge | null;
  /** True while another app is ducking us, so the loop plays quieter. */
  #ducked = false;
  /** True once focus has been asked for, so it is asked for once. */
  #focusHeld = false;

  constructor(settings: AudioSettings, options: AudioEngineOptions = {}) {
    this.#settings = settings;
    this.#focus = options.focus ?? null;
    this.#watchVisibility();
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

    // Asked for at the first note rather than at start-up: focus held over a
    // silent menu is focus taken from whatever the player was listening to.
    void this.#requestFocus();

    const context = this.#ensureContext();
    if (!context || !this.#musicGain) return;
    this.#music ??= new MusicLoop(context, this.#musicGain);
    this.#music.start();
  }

  stopMusic(): void {
    this.#musicWanted = false;
    this.#music?.stop();
    void this.#abandonFocus();
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
    const resting = this.#ducked ? FOCUS_DUCK_GAIN : 1;
    gain.gain.linearRampToValueAtTime(Math.min(DUCK_TO, resting), now + 0.02);
    gain.gain.linearRampToValueAtTime(resting, now + DUCK_MS / 1000);
  }

  async #requestFocus(): Promise<void> {
    if (!this.#focus || this.#focusHeld) return;
    this.#focusHeld = true;
    try {
      await this.#focus.request();
    } catch {
      // No focus is a game that still makes noise, which is the same place
      // the browser build lives; it is never a reason to fail a cue.
      this.#focusHeld = false;
    }
  }

  async #abandonFocus(): Promise<void> {
    if (!this.#focus || !this.#focusHeld) return;
    this.#focusHeld = false;
    try {
      await this.#focus.abandon();
    } catch {
      // Nothing to do about it and nothing the player can hear.
    }
  }

  /**
   * The native focus signal (`AUDIO.md` 4). What each change means is decided
   * in `focus.ts`; this applies it.
   */
  #watchFocus(): void {
    if (!this.#focus) return;
    void this.#focus
      .addListener("audioFocusChange", ({ change }) => this.#onFocusChange(change))
      .catch(() => undefined);
  }

  #onFocusChange(change: FocusChange): void {
    const response = focusResponse(change);

    this.#ducked = response.duck;
    this.#applyMusicGain();

    if (response.music === "pause") {
      this.stopAll();
      this.#music?.stop();
      void this.#context?.suspend();
    } else if (response.music === "resume") {
      void this.#context?.resume();
      if (this.#musicWanted && this.#settings.music) this.#music?.start();
    }

    if (response.abandon) {
      this.#focusHeld = false;
      void this.#focus?.abandon().catch(() => undefined);
    }
  }

  /** The resting level of the music bus: full, or down under another app. */
  #applyMusicGain(): void {
    const gain = this.#musicGain;
    const context = this.#context;
    if (!gain || !context) return;

    const target = this.#ducked ? FOCUS_DUCK_GAIN : 1;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(target, context.currentTime + 0.12);
  }

  /**
   * The page being hidden: a backgrounded game, a call, the task switcher.
   * It is not audio focus — a WebView is never told about another app taking
   * the output while we are still on screen, which is what the plugin above
   * is for — but it is the one signal the browser build also has.
   */
  #watchVisibility(): void {
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
