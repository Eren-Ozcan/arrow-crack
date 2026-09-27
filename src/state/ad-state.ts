/**
 * The frequency guards behind every full-screen ad (`ADS.md` 2.2). They live
 * apart from the ads facade for two reasons: the rules are what the studio
 * ad policy binds and they have to be readable on their own, and they are
 * pure enough to test without a plugin, a network or a device.
 *
 * Two clocks, deliberately different in lifetime:
 *
 * - The **shared cooldown** is persistent. Every full-screen format writes
 *   it and only the interstitial reads it, so a rewarded ad the player chose
 *   to watch pushes the forced one away rather than the other way round.
 *   It survives a cold start, because an app kill is not an ad slot.
 * - The **per-attempt caps** are not persisted at all. They belong to one
 *   attempt at one level, and a restart is always free (`DESIGN.md` 1.5).
 */

/** Written by every full-screen show, read only by the interstitial. */
export const FULLSCREEN_COOLDOWN_MS = 5 * 60 * 1000;
export const LAST_FULLSCREEN_KEY = "arrowCrack.ads.lastFullscreen";
/** The tutorial is not for sale: no interstitial before this level. */
export const INTERSTITIAL_FROM_LEVEL = 6;
/** `ADS.md` 1.4: past two, a hard level becomes a slot machine. */
export const MAX_CONTINUES = 2;
/** `ADS.md` 1: three watched hints in one attempt is already a walkthrough. */
export const MAX_HINT_ADS = 3;
/** A skip is offered only once the level has beaten the player this often. */
export const SKIP_AFTER_FAILS = 3;

/** The storage this needs; `localStorage` satisfies it, and so does a Map. */
export interface AdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CooldownInput {
  now: number;
  /** Milliseconds since the epoch of the last full-screen ad, or null. */
  lastFullscreenAt: number | null;
}

/**
 * A stored stamp that is corrupt, negative, or in the future because the
 * device clock moved, is treated as "no ad yet" rather than as a lock: the
 * failure mode of a bad clock must be a shown ad, never a game that can
 * never show one again (`ADS.md` 2.2).
 */
export function readLastFullscreen(
  storage: AdStorage | null,
  now: number,
): number | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(LAST_FULLSCREEN_KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > now) return null;
  return value;
}

export function writeLastFullscreen(storage: AdStorage | null, now: number): void {
  try {
    storage?.setItem(LAST_FULLSCREEN_KEY, String(now));
  } catch {
    // A blocked or full store means the next interstitial comes early. That
    // is a worse ad experience, not a broken game, and nothing to crash on.
  }
}

export function cooldownRemainingMs({ now, lastFullscreenAt }: CooldownInput): number {
  if (lastFullscreenAt === null) return 0;
  return Math.max(0, lastFullscreenAt + FULLSCREEN_COOLDOWN_MS - now);
}

export interface InterstitialInput extends CooldownInput {
  levelId: number;
  /** True once `remove_ads` is owned: the interstitial path ends here. */
  adsRemoved: boolean;
  /** Any modal, coach line or toast still on screen (`ADS.md` 1.2). */
  uiBusy: boolean;
}

/**
 * Every reason an interstitial is not shown, in one place, so the trigger is
 * one function with no back door — the win screen's buttons and the Android
 * back button reach the same answer (`ADS.md` 1.1).
 */
export function canShowInterstitial(input: InterstitialInput): boolean {
  if (input.adsRemoved) return false;
  if (input.uiBusy) return false;
  if (input.levelId < INTERSTITIAL_FROM_LEVEL) return false;
  return cooldownRemainingMs(input) === 0;
}

/** What one attempt at one level has already spent. Never persisted. */
export interface AttemptAds {
  continuesUsed: number;
  hintAdsUsed: number;
  skipUsed: boolean;
}

export function createAttemptAds(): AttemptAds {
  return { continuesUsed: 0, hintAdsUsed: 0, skipUsed: false };
}

/**
 * The caps are enforced here rather than in the AdMob panel (`ADS.md` 1.3):
 * a panel-side cap lets the player watch the whole ad and then lose the
 * reward, which is the one outcome the rewarded format cannot survive. When
 * one of these returns false the button is not rendered at all.
 */
export function canOfferContinue(attempt: AttemptAds): boolean {
  return attempt.continuesUsed < MAX_CONTINUES;
}

export function canOfferHintAd(attempt: AttemptAds): boolean {
  return attempt.hintAdsUsed < MAX_HINT_ADS;
}

/** Offered only once the same level has been failed enough times over. */
export function canOfferSkip(attempt: AttemptAds, failsOnLevel: number): boolean {
  return !attempt.skipUsed && failsOnLevel >= SKIP_AFTER_FAILS;
}

export function recordContinue(attempt: AttemptAds): AttemptAds {
  return { ...attempt, continuesUsed: attempt.continuesUsed + 1 };
}

export function recordHintAd(attempt: AttemptAds): AttemptAds {
  return { ...attempt, hintAdsUsed: attempt.hintAdsUsed + 1 };
}

export function recordSkip(attempt: AttemptAds): AttemptAds {
  return { ...attempt, skipUsed: true };
}
