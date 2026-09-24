import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * The Android hardware/gesture back button (`ADS.md` 1.1). It is the one
 * exit a web build does not have, and the one cengeBulmaca left outside the
 * ad trigger — so here it is routed into the same doors the on-screen
 * buttons use rather than being handled on its own.
 *
 * The app answers whether it consumed the press. An unconsumed press is the
 * home screen with nothing above it, which is the only place back should
 * leave the game.
 */
export function watchBackButton(onBack: () => boolean): void {
  if (!Capacitor.isNativePlatform()) return;

  void App.addListener("backButton", () => {
    if (onBack()) return;
    void App.exitApp();
  });
}
