/**
 * The purchases facade (`ADS.md` 2.5, 2.6). Two products and no shop screen:
 * `remove_ads`, a non-consumable that kills interstitials and leaves the
 * rewarded ads alone, and `hint_pack`, a consumable offered only from the
 * hint button inside a level (`PROGRESSION.md` 4.1).
 *
 * Like the ads facade it talks to a driver, which is RevenueCat on a device
 * and nothing in the browser — so the entitlement is simply absent in dev
 * rather than mocked into being owned, and every screen is exercised in the
 * state most players are in.
 */

export type ProductId = "remove_ads" | "hint_pack";

/** What a purchase attempt ended as; a cancel is not an error. */
export type PurchaseResult =
  | { status: "purchased"; product: ProductId; price: number; currency: string }
  | { status: "cancelled" }
  | { status: "unavailable" };

export interface IapDriver {
  /** Resolves with the entitlements already owned, e.g. after a reinstall. */
  prepare(): Promise<ProductId[]>;
  purchase(product: ProductId): Promise<PurchaseResult>;
  /** The Settings row (`DESIGN.md` 6); returns what the account owns. */
  restore(): Promise<ProductId[]>;
}

export interface IapServiceOptions {
  driver?: IapDriver | null;
  /** Fire-and-forget, for the `purchase` event (`TELEMETRY.md` 2.3). */
  onPurchase?: (result: Extract<PurchaseResult, { status: "purchased" }>) => void;
}

export class IapService {
  #driver: IapDriver | null;
  #owned = new Set<ProductId>();
  #onPurchase:
    ((result: Extract<PurchaseResult, { status: "purchased" }>) => void) | undefined;

  constructor(options: IapServiceOptions = {}) {
    this.#driver = options.driver ?? null;
    this.#onPurchase = options.onPurchase;
  }

  async prepare(): Promise<void> {
    if (this.#driver === null) return;
    try {
      this.#owned = new Set(await this.#driver.prepare());
    } catch {
      // An unreachable store is not an owned entitlement and not a crash:
      // the player sees the game as it ships and can restore later.
    }
  }

  /** The first line of the interstitial path (`ADS.md` 2.6). */
  adsRemoved(): boolean {
    return this.#owned.has("remove_ads");
  }

  owns(product: ProductId): boolean {
    return this.#owned.has(product);
  }

  /** Available when there is a store to buy from and it is not already owned. */
  canBuy(product: ProductId): boolean {
    if (this.#driver === null) return false;
    return product === "hint_pack" || !this.#owned.has(product);
  }

  async purchase(product: ProductId): Promise<PurchaseResult> {
    if (this.#driver === null) return { status: "unavailable" };

    let result: PurchaseResult;
    try {
      result = await this.#driver.purchase(product);
    } catch {
      return { status: "unavailable" };
    }

    if (result.status === "purchased") {
      // A consumable is spent where it is granted, so only the entitlement
      // is remembered here.
      if (product !== "hint_pack") this.#owned.add(product);
      this.#onPurchase?.(result);
    }
    return result;
  }

  async restore(): Promise<ProductId[]> {
    if (this.#driver === null) return [];
    try {
      const owned = await this.#driver.restore();
      this.#owned = new Set(owned);
      return owned;
    } catch {
      return [...this.#owned];
    }
  }
}
