/**
 * Android audio focus (`AUDIO.md` 4). Web Audio in a WebView never asks the
 * platform for focus, so without this the music plays over a call and over
 * another app's podcast, and nothing tells us to get out of the way. The
 * native half is a small plugin in `android/`; this is the part that decides
 * what to do about what it says, which is why it is a pure function and not
 * a branch buried in the engine.
 *
 * The four changes are Android's own, named the way it names them:
 *
 * - `gained` — the output is ours again.
 * - `lost` — permanently; someone else owns it now. Focus is abandoned,
 *   and the music comes back only when the player brings it back.
 * - `lostTransient` — a call, a navigation prompt. Stop, and expect a
 *   `gained` after it.
 * - `ducked` — a transient loss we are allowed to play under. The music
 *   drops rather than stopping, which is what a notification should cost.
 */
export type FocusChange = "gained" | "lost" | "lostTransient" | "ducked";

export interface FocusResponse {
  /** What the music loop should do about it. */
  music: "resume" | "pause" | "keep";
  /** True while another app is talking over us. */
  duck: boolean;
  /** Whether to hand the focus back rather than wait for it to return. */
  abandon: boolean;
}

export function focusResponse(change: FocusChange): FocusResponse {
  switch (change) {
    case "gained":
      return { music: "resume", duck: false, abandon: false };
    case "lost":
      return { music: "pause", duck: false, abandon: true };
    case "lostTransient":
      return { music: "pause", duck: false, abandon: false };
    case "ducked":
      // Still ours, still playing, just quieter: stopping here would turn
      // every notification into a gap in the loop.
      return { music: "keep", duck: true, abandon: false };
  }
}

/** How far the music drops while another app is ducking us. */
export const FOCUS_DUCK_GAIN = 0.25;

/** The native plugin's shape; the web has no such thing and says so. */
export interface AudioFocusBridge {
  request(): Promise<{ granted: boolean }>;
  abandon(): Promise<void>;
  addListener(
    event: "audioFocusChange",
    handler: (data: { change: FocusChange }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}
