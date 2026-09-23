import { describe, expect, it, vi } from "vitest";
import { AdService } from "@/services/ads";
import type { AdDriver, AdResult, RewardedPlacement } from "@/services/ads";
import {
  FULLSCREEN_COOLDOWN_MS,
  INTERSTITIAL_FROM_LEVEL,
  LAST_FULLSCREEN_KEY,
  MAX_CONTINUES,
  MAX_HINT_ADS,
  SKIP_AFTER_FAILS,
  canOfferSkip,
  canShowInterstitial,
  createAttemptAds,
  readLastFullscreen,
} from "@/state/adState";
import type { AdStorage } from "@/state/adState";

function memoryStorage(): AdStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

/** A driver that answers what the test asks it to, and counts its calls. */
function stubDriver(results: {
  ready?: boolean;
  interstitial?: AdResult;
  rewarded?: AdResult;
}): AdDriver & { shows: string[] } {
  const shows: string[] = [];
  return {
    shows,
    prepare: async () => results.ready ?? true,
    showInterstitial: async () => {
      shows.push("interstitial");
      return results.interstitial ?? "shown";
    },
    showRewarded: async (placement: RewardedPlacement) => {
      shows.push(placement);
      return results.rewarded ?? "rewarded";
    },
  };
}

describe("ad frequency rules", () => {
  const base = {
    now: 10_000_000,
    lastFullscreenAt: null,
    levelId: 10,
    adsRemoved: false,
    uiBusy: false,
  };

  it("holds every reason an interstitial is refused (ADS.md 1.2)", () => {
    expect(canShowInterstitial(base)).toBe(true);
    expect(canShowInterstitial({ ...base, adsRemoved: true })).toBe(false);
    expect(canShowInterstitial({ ...base, uiBusy: true })).toBe(false);
    expect(canShowInterstitial({ ...base, levelId: INTERSTITIAL_FROM_LEVEL - 1 })).toBe(
      false,
    );
    expect(canShowInterstitial({ ...base, levelId: INTERSTITIAL_FROM_LEVEL })).toBe(true);
  });

  it("keeps five minutes between full-screen ads", () => {
    const lastFullscreenAt = base.now - FULLSCREEN_COOLDOWN_MS + 1;
    expect(canShowInterstitial({ ...base, lastFullscreenAt })).toBe(false);
    expect(canShowInterstitial({ ...base, lastFullscreenAt: lastFullscreenAt - 1 })).toBe(
      true,
    );
  });

  it("treats a broken stamp as no ad yet, never as a lock", () => {
    const storage = memoryStorage();
    const now = 10_000_000;

    for (const raw of ["nonsense", "-1", "0", String(now + 1)]) {
      storage.map.set(LAST_FULLSCREEN_KEY, raw);
      expect(readLastFullscreen(storage, now), raw).toBe(null);
    }

    storage.map.set(LAST_FULLSCREEN_KEY, String(now - 1000));
    expect(readLastFullscreen(storage, now)).toBe(now - 1000);
    // A store that throws is the same case as one that holds nothing.
    expect(
      readLastFullscreen(
        {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => undefined,
        },
        now,
      ),
    ).toBe(null);
  });

  it("offers a skip only after the level has won three times", () => {
    const attempt = createAttemptAds();
    expect(canOfferSkip(attempt, SKIP_AFTER_FAILS - 1)).toBe(false);
    expect(canOfferSkip(attempt, SKIP_AFTER_FAILS)).toBe(true);
    expect(canOfferSkip({ ...attempt, skipUsed: true }, SKIP_AFTER_FAILS)).toBe(false);
  });
});

describe("AdService", () => {
  it("shows nothing at all without a driver", async () => {
    const ads = new AdService();
    expect(await ads.prepare()).toBe(false);
    expect(await ads.maybeShowInterstitial(30)).toBe("unavailable");
    expect(await ads.showRewarded("continue")).toBe("unavailable");
    expect(ads.offersContinue()).toBe(false);
  });

  it("runs without ads when consent is refused", async () => {
    const driver = stubDriver({ ready: false });
    const ads = new AdService({ driver, storage: memoryStorage() });

    expect(await ads.prepare()).toBe(false);
    expect(await ads.maybeShowInterstitial(30)).toBe("unavailable");
    expect(driver.shows).toEqual([]);
  });

  it("writes the shared stamp on a rewarded show and never reads it", async () => {
    const storage = memoryStorage();
    let now = 5_000_000;
    const driver = stubDriver({});
    const ads = new AdService({ driver, storage, now: () => now });
    await ads.prepare();

    // The interstitial is pushed out by the ad the player chose to watch...
    expect(await ads.showRewarded("hint")).toBe("rewarded");
    expect(await ads.maybeShowInterstitial(30)).toBe("unavailable");

    // ...and a second rewarded is still offered inside that window.
    now += 1000;
    expect(await ads.showRewarded("continue")).toBe("rewarded");

    now += FULLSCREEN_COOLDOWN_MS;
    expect(await ads.maybeShowInterstitial(30)).toBe("shown");
    expect(driver.shows).toEqual(["hint", "continue", "interstitial"]);
  });

  it("caps the rewards in the game, not in the panel", async () => {
    const ads = new AdService({ driver: stubDriver({}), storage: memoryStorage() });
    await ads.prepare();

    for (let index = 0; index < MAX_CONTINUES; index += 1) {
      expect(ads.offersContinue()).toBe(true);
      await ads.showRewarded("continue");
    }
    expect(ads.offersContinue()).toBe(false);

    for (let index = 0; index < MAX_HINT_ADS; index += 1) {
      expect(ads.offersHintAd()).toBe(true);
      await ads.showRewarded("hint");
    }
    expect(ads.offersHintAd()).toBe(false);

    // A restart is free, so a fresh attempt starts the caps over.
    ads.startAttempt();
    expect(ads.offersContinue()).toBe(true);
    expect(ads.offersHintAd()).toBe(true);
  });

  it("counts a dismissal against nothing", async () => {
    const ads = new AdService({
      driver: stubDriver({ rewarded: "dismissed" }),
      storage: memoryStorage(),
    });
    await ads.prepare();

    expect(await ads.showRewarded("continue")).toBe("dismissed");
    expect(ads.attempt.continuesUsed).toBe(0);
    expect(ads.offersContinue()).toBe(true);
  });

  it("keeps rewarded ads alive once the ads are removed", async () => {
    const ads = new AdService({
      driver: stubDriver({}),
      storage: memoryStorage(),
      adsRemoved: () => true,
    });
    await ads.prepare();

    expect(await ads.maybeShowInterstitial(30)).toBe("unavailable");
    expect(await ads.showRewarded("continue")).toBe("rewarded");
  });

  it("never hangs on a plugin that does not answer", async () => {
    vi.useFakeTimers();
    try {
      const driver: AdDriver = {
        prepare: async () => true,
        showInterstitial: () => new Promise<AdResult>(() => undefined),
        showRewarded: () => new Promise<AdResult>(() => undefined),
      };
      const ads = new AdService({ driver, storage: memoryStorage() });
      await ads.prepare();

      const pending = ads.showRewarded("hint");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await pending).toBe("unavailable");
      // The lock is released, so the button comes back.
      expect(ads.busy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports every show that happened, and nothing that did not", async () => {
    const seen: string[] = [];
    const ads = new AdService({
      driver: stubDriver({}),
      storage: memoryStorage(),
      onResult: (placement, result) => void seen.push(`${placement}:${result}`),
    });
    await ads.prepare();

    await ads.showRewarded("skip_level");
    await ads.maybeShowInterstitial(2); // Before level 6: never happens.
    expect(seen).toEqual(["skip_level:rewarded"]);
  });
});
