import { describe, expect, it } from "vitest";
import {
  Analytics,
  MAX_MISTAKE_EVENTS_PER_ATTEMPT,
  levelBand,
} from "@/services/analytics";
import type { AnalyticsDriver, EventName } from "@/services/analytics";
import { IapService } from "@/services/iap";
import type { IapDriver, ProductId } from "@/services/iap";

function recorder(): AnalyticsDriver & {
  logged: { name: EventName; params: Record<string, string | number> }[];
  enabled: boolean | null;
} {
  const sink = {
    logged: [] as { name: EventName; params: Record<string, string | number> }[],
    enabled: null as boolean | null,
    setEnabled: async (enabled: boolean) => void (sink.enabled = enabled),
    log: async (name: EventName, params: Record<string, string | number>) =>
      void sink.logged.push({ name, params }),
  };
  return sink;
}

describe("analytics", () => {
  it("bands every level the schema carries one for", () => {
    expect(levelBand(1)).toBe("1-30");
    expect(levelBand(30)).toBe("1-30");
    expect(levelBand(31)).toBe("31-49");
    expect(levelBand(49)).toBe("31-49");
    expect(levelBand(50)).toBe("50+");
    expect(levelBand(80)).toBe("50+");
  });

  it("sends nothing until consent has resolved, and nothing when it is denied", () => {
    const driver = recorder();
    const analytics = new Analytics({ driver });

    analytics.log({ name: "level_quit", level_id: 7, shots_fired: 3, mistakes: 1 });
    expect(driver.logged).toEqual([]);
    expect(analytics.enabled).toBe(false);

    analytics.setConsent(false);
    analytics.log({ name: "level_quit", level_id: 7, shots_fired: 3, mistakes: 1 });
    expect(driver.logged).toEqual([]);
    expect(driver.enabled).toBe(false);

    analytics.setConsent(true);
    analytics.log({ name: "level_quit", level_id: 7, shots_fired: 3, mistakes: 1 });
    expect(driver.logged.map((entry) => entry.name)).toEqual(["level_quit"]);
    expect(driver.logged[0]!.params["level_band"]).toBe("1-30");
  });

  it("caps the mistake event per attempt and starts over on the next one", () => {
    const driver = recorder();
    const analytics = new Analytics({ driver });
    analytics.setConsent(true);

    const mistake = {
      name: "mistake",
      level_id: 55,
      kind: "color_mismatch",
      shots_fired: 1,
      hearts_left: 2,
    } as const;

    for (let index = 0; index < MAX_MISTAKE_EVENTS_PER_ATTEMPT + 5; index += 1) {
      analytics.log(mistake);
    }
    expect(driver.logged).toHaveLength(MAX_MISTAKE_EVENTS_PER_ATTEMPT);
    expect(driver.logged[0]!.params["level_band"]).toBe("50+");

    // The cap is per attempt; every other event is uncapped throughout.
    analytics.log({
      name: "ad_shown",
      format: "rewarded",
      placement: "hint",
      result: "rewarded",
    });
    analytics.startAttempt();
    analytics.log(mistake);
    expect(driver.logged).toHaveLength(MAX_MISTAKE_EVENTS_PER_ATTEMPT + 2);
  });

  it("survives a driver that rejects", () => {
    const analytics = new Analytics({
      driver: {
        setEnabled: async () => Promise.reject(new Error("no")),
        log: async () => Promise.reject(new Error("no")),
      },
    });
    analytics.setConsent(true);
    expect(() =>
      analytics.log({ name: "skip_used", level_id: 44, fails_before: 3 }),
    ).not.toThrow();
  });
});

describe("purchases", () => {
  function driverOwning(owned: ProductId[]): IapDriver {
    return {
      prepare: async () => owned,
      purchase: async (product) => ({
        status: "purchased",
        product,
        price: 149.99,
        currency: "TRY",
      }),
      restore: async () => owned,
    };
  }

  it("owns nothing without a store", async () => {
    const iap = new IapService();
    await iap.prepare();
    expect(iap.adsRemoved()).toBe(false);
    expect(iap.canBuy("remove_ads")).toBe(false);
    expect(await iap.purchase("remove_ads")).toEqual({ status: "unavailable" });
    expect(await iap.restore()).toEqual([]);
  });

  it("remembers the entitlement but never the consumable", async () => {
    const purchases: string[] = [];
    const iap = new IapService({
      driver: driverOwning([]),
      onPurchase: (result) => void purchases.push(result.product),
    });
    await iap.prepare();

    expect(iap.canBuy("remove_ads")).toBe(true);
    await iap.purchase("remove_ads");
    expect(iap.adsRemoved()).toBe(true);
    expect(iap.canBuy("remove_ads")).toBe(false);

    await iap.purchase("hint_pack");
    expect(iap.owns("hint_pack")).toBe(false);
    // A hint pack can always be bought again; that is what consumable means.
    expect(iap.canBuy("hint_pack")).toBe(true);
    expect(purchases).toEqual(["remove_ads", "hint_pack"]);
  });

  it("restores what the account owns after a reinstall", async () => {
    const iap = new IapService({ driver: driverOwning(["remove_ads"]) });
    await iap.prepare();
    expect(iap.adsRemoved()).toBe(true);

    const failing = new IapService({
      driver: {
        prepare: async () => Promise.reject(new Error("offline")),
        purchase: async () => Promise.reject(new Error("offline")),
        restore: async () => Promise.reject(new Error("offline")),
      },
    });
    await failing.prepare();
    expect(failing.adsRemoved()).toBe(false);
    expect(await failing.purchase("remove_ads")).toEqual({ status: "unavailable" });
    expect(await failing.restore()).toEqual([]);
  });
});
