import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AudioFocusBridge } from "./focus";

/**
 * The bridge to the `AudioFocus` plugin in `android/` (`AUDIO.md` 4). It is
 * the only file that knows Capacitor exists on the audio side: the engine
 * takes an `AudioFocusBridge` and does not care whether one is real.
 *
 * On the web there is nothing to talk to — a browser tab has no focus to
 * hold — so this answers null and the engine keeps the visibility signal it
 * has always had.
 */
export function audioFocusBridge(): AudioFocusBridge | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Capacitor.isPluginAvailable("AudioFocus")) return null;
  return registerPlugin<AudioFocusBridge>("AudioFocus");
}
