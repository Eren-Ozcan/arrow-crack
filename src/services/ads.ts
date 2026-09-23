import type { AdStorage, AttemptAds } from "@/state/adState";
import {
  canOfferContinue,
  canOfferHintAd,
  canOfferSkip,
  canShowInterstitial,
  createAttemptAds,
  readLastFullscreen,
  recordContinue,
  recordHintAd,
  recordSkip,
  writeLastFullscreen,
} from "@/state/adState";

/**
 * The ads facade (`ADS.md` 2.1). Nothing outside this file imports an ad SDK,
 * and this file does not import one either: it talks to an `AdDriver`, which
 * is the native plugin on a device and nothing at all in the browser, in a
 * test and in the level tools. Ads are therefore never the reason a build
 * cannot run, and every rule above them is testable without a network.
 *
 * The rules themselves are in `state/adState.ts`; this owns the calling — the
 * consent order, the in-flight lock, and the promise that never hangs.
 */

export type AdPlacement =
  "level_complete" | "continue" | "timed_continue" | "hint" | "skip_level";

export type RewardedPlacement = Exclude<AdPlacement, "level_complete">;

/** What a show ended as. `unavailable` covers no fill and no network. */
export type AdResult = "shown" | "rewarded" | "dismissed" | "unavailable";

export interface AdDriver {
  /**
   * `requestConsentInfo()` → the Google form when it is REQUIRED and
   * available → `initialize()`, in that order and no other (`ADS.md` 2.4).
   * Returns whether ads may be requested at all; a false here is a game that
   * runs without ads, never a game that does not start.
   */
  prepare(): Promise<boolean>;
  showInterstitial(): Promise<AdResult>;
  showRewarded(placement: RewardedPlacement): Promise<AdResult>;
}

/**
 * A plugin that never settles its promise would lock the button for the rest
 * of the session, so every show races this (`ADS.md` 1.3).
 */
export const AD_TIMEOUT_MS = 60_000;

export interface AdServiceOptions {
  driver?: AdDriver | null;
  storage?: AdStorage | null;
  now?: () => number;
  /** `remove_ads`, asked of the IAP facade rather than cached here. */
  adsRemoved?: () => boolean;
  /** True while a modal, coach line or toast owns the screen. */
  uiBusy?: () => boolean;
  /** Fire-and-forget, for the `ad_shown` event (`TELEMETRY.md` 2.3). */
  onResult?: (placement: AdPlacement, result: AdResult) => void;
}

export class AdService {
  #driver: AdDriver | null;
  #storage: AdStorage | null;
  #now: () => number;
  #adsRemoved: () => boolean;
  #uiBusy: () => boolean;
  #onResult: ((placement: AdPlacement, result: AdResult) => void) | undefined;

  /** Null until `prepare()` has answered; false means: run without ads. */
  #ready: boolean | null = null;
  /** One show at a time, whatever the format. */
  #inFlight = false;
  #attempt: AttemptAds = createAttemptAds();

  constructor(options: AdServiceOptions = {}) {
    this.#driver = options.driver ?? null;
    this.#storage = options.storage ?? null;
    this.#now = options.now ?? (() => Date.now());
    this.#adsRemoved = options.adsRemoved ?? ((): boolean => false);
    this.#uiBusy = options.uiBusy ?? ((): boolean => false);
    this.#onResult = options.onResult;
  }

  /** Consent, then init. Never throws, never blocks the first level. */
  async prepare(): Promise<boolean> {
    if (this.#driver === null) {
      this.#ready = false;
      return false;
    }
    try {
      this.#ready = await this.#driver.prepare();
    } catch {
      this.#ready = false;
    }
    return this.#ready;
  }

  /** A fresh attempt at a level: the per-attempt caps start over. */
  startAttempt(): void {
    this.#attempt = createAttemptAds();
  }

  get attempt(): AttemptAds {
    return this.#attempt;
  }

  get busy(): boolean {
    return this.#inFlight;
  }

  /** Whether the out-of-hearts screen may draw each of its rewarded rows. */
  offersContinue(): boolean {
    return this.#rewardedAvailable() && canOfferContinue(this.#attempt);
  }

  offersHintAd(): boolean {
    return this.#rewardedAvailable() && canOfferHintAd(this.#attempt);
  }

  offersSkip(failsOnLevel: number): boolean {
    return this.#rewardedAvailable() && canOfferSkip(this.#attempt, failsOnLevel);
  }

  /**
   * The one way an interstitial is ever shown (`ADS.md` 1.1), reached by the
   * win screen's buttons and by Android back alike. It resolves after the ad
   * closes, so the caller can open the next screen behind it.
   */
  async maybeShowInterstitial(levelId: number): Promise<AdResult> {
    const now = this.#now();
    const allowed = canShowInterstitial({
      now,
      lastFullscreenAt: readLastFullscreen(this.#storage, now),
      levelId,
      adsRemoved: this.#adsRemoved(),
      uiBusy: this.#uiBusy(),
    });
    if (!allowed || this.#ready !== true || this.#driver === null || this.#inFlight) {
      return "unavailable";
    }

    const result = await this.#show(() => this.#driver!.showInterstitial());
    this.#report("level_complete", result);
    return result;
  }

  /**
   * Rewarded shows never read the cooldown — the player asked for this one —
   * but they do write it, so a watched ad buys five minutes free of the
   * forced one (`ADS.md` 1.3). The reward is granted by the caller only on
   * `rewarded`; a dismissal grants nothing and is not an error.
   */
  async showRewarded(placement: RewardedPlacement): Promise<AdResult> {
    if (!this.#rewardedAvailable() || this.#inFlight) return "unavailable";

    const result = await this.#show(() => this.#driver!.showRewarded(placement));
    if (result === "rewarded") this.#countReward(placement);
    this.#report(placement, result);
    return result;
  }

  /** Rewarded ads outlive `remove_ads` on purpose (`ADS.md` 1.3). */
  #rewardedAvailable(): boolean {
    return this.#ready === true && this.#driver !== null;
  }

  #countReward(placement: RewardedPlacement): void {
    switch (placement) {
      case "continue":
      case "timed_continue":
        this.#attempt = recordContinue(this.#attempt);
        break;
      case "hint":
        this.#attempt = recordHintAd(this.#attempt);
        break;
      case "skip_level":
        this.#attempt = recordSkip(this.#attempt);
        break;
    }
  }

  async #show(run: () => Promise<AdResult>): Promise<AdResult> {
    this.#inFlight = true;
    // The stamp is written before the show rather than after it: a player who
    // backgrounds the app mid-ad has still been served one.
    writeLastFullscreen(this.#storage, this.#now());

    try {
      return await withTimeout(run(), AD_TIMEOUT_MS);
    } catch {
      return "unavailable";
    } finally {
      this.#inFlight = false;
    }
  }

  #report(placement: AdPlacement, result: AdResult): void {
    if (result === "unavailable") return;
    this.#onResult?.(placement, result);
  }
}

/** Resolves to `unavailable` rather than hanging on a silent plugin. */
async function withTimeout(promise: Promise<AdResult>, ms: number): Promise<AdResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AdResult>((resolve) => {
    timer = setTimeout(() => resolve("unavailable"), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
