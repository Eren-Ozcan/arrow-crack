import type { Settings } from "@/state/save";
import { button, element, iconButton } from "./hud";
import { t } from "./strings";
import type { StringKey } from "./strings";

/** Studio-wide page, not a per-game one (STORE.md 6). */
export const PRIVACY_URL = "https://yilkgames.com/privacy-policy/";

export interface SettingsHandlers {
  onChange: (patch: Partial<Settings>) => void;
  /** Wipes stars, scores and the hint balance (DESIGN.md 6). */
  onDeleteData: () => void;
  onClose: () => void;
  /** `remove_ads`, the purchase we actually want (`ADS.md` 2.6). */
  onBuyRemoveAds: () => void;
  /** The Settings row a reinstalled player needs (`ADS.md` 2.6). */
  onRestore: () => void;
}

/** What the purchases row needs to know, asked of `IapService` (`ADS.md` 2.6). */
export interface SettingsIapState {
  removeAdsOwned: boolean;
  /** A store to buy from exists and `remove_ads` is not already owned. */
  canBuyRemoveAds: boolean;
  /** A store to buy from exists at all — restore has nothing to do with ownership. */
  canRestore: boolean;
  /** A purchase or restore is in flight; both rows wait for it. */
  busy: boolean;
}

const REMOVE_ADS_PRICE = "₺149,99";

/** Every setting that is a plain on/off row. */
type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

/**
 * The settings screen (DESIGN.md 6): sound, music, haptics, language, the
 * privacy policy and deleting the save, plus the three accessibility rows —
 * reduced audio, reduced motion and colour-blind mode (ART.md 2.2, 7,
 * AUDIO.md 5). Language is a row
 * rather than a
 * chooser in v1 — English only, and a row that lies about being a choice is
 * worse than one that states the fact (STORE.md).
 */
export class SettingsScreen {
  readonly root: HTMLElement;

  #handlers: SettingsHandlers;
  #rows: HTMLElement;
  #rows2: HTMLElement;
  #hints: HTMLElement;
  /** Deleting everything asks once; it is the only irreversible button here. */
  #confirming = false;
  #settings: Settings | null = null;
  #hintBalance = 0;
  #iap: SettingsIapState = {
    removeAdsOwned: false,
    canBuyRemoveAds: false,
    canRestore: false,
    busy: false,
  };

  constructor(handlers: SettingsHandlers) {
    this.#handlers = handlers;
    this.root = element("div", "settings");
    this.root.hidden = true;

    const title = element("h2");
    title.textContent = t("settings.title");

    const close = iconButton(closeIcon(), t("settings.close"), handlers.onClose);
    const header = element("div", "settings-header");
    header.append(title, close);

    this.#hints = element("p", "settings-hints");
    this.#rows = element("div", "settings-rows");
    this.#rows2 = element("div", "settings-rows");

    const card = element("div", "settings-card");
    card.append(header, this.#hints, this.#rows, this.#rows2);
    this.root.append(card);
  }

  show(settings: Settings, hints: number, iap: SettingsIapState): void {
    this.#confirming = false;
    this.root.hidden = false;
    this.render(settings, hints, iap);
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** True while the screen owns the display; Android back closes it first. */
  get isOpen(): boolean {
    return !this.root.hidden;
  }

  render(settings: Settings, hints: number, iap: SettingsIapState = this.#iap): void {
    this.#settings = settings;
    this.#hintBalance = hints;
    this.#iap = iap;
    this.#hints.textContent = `${t("settings.hints")} ${hints}`;

    this.#rows.replaceChildren(
      ...this.#purchaseRows(),
      this.#toggle("settings.sound", "sound"),
      this.#toggle("settings.music", "music"),
      this.#toggle("settings.haptics", "haptics"),
      this.#toggle("settings.reducedAudio", "reducedAudio"),
      this.#toggle("settings.reducedMotion", "reducedMotion"),
      this.#toggle("settings.colourBlindMode", "colourBlindMode"),
    );
    this.#rows2.replaceChildren(this.#language(), this.#privacy(), ...this.#deleteRows());
  }

  /**
   * Remove Ads and Restore purchases (`ADS.md` 2.6). Each row is drawn only
   * when it could actually do something: bought already, the buy row is gone
   * rather than shown and disabled, and with no store to talk to — the web
   * build, a refused-consent session — neither row appears at all.
   */
  #purchaseRows(): HTMLElement[] {
    const rows: HTMLElement[] = [];

    if (this.#iap.canBuyRemoveAds) {
      const row = element("div", "settings-row");
      const label = element("span");
      label.textContent = t("settings.removeAds");
      const buy = button(t("settings.removeAdsBuy", { price: REMOVE_ADS_PRICE }), () =>
        this.#handlers.onBuyRemoveAds(),
      );
      buy.disabled = this.#iap.busy;
      row.append(label, buy);
      rows.push(row);
    } else if (this.#iap.removeAdsOwned) {
      const row = element("div", "settings-row");
      const label = element("span");
      label.textContent = t("settings.removeAdsOwned");
      row.append(label);
      rows.push(row);
    }

    if (this.#iap.canRestore) {
      const row = element("div", "settings-row");
      const restore = button(t("settings.restore"), () => this.#handlers.onRestore());
      restore.disabled = this.#iap.busy;
      row.append(restore);
      rows.push(row);
    }

    return rows;
  }

  #toggle(labelKey: StringKey, field: BooleanSetting): HTMLElement {
    const value = this.#settings?.[field] ?? true;
    const row = element("div", "settings-row");

    const label = element("span");
    label.textContent = t(labelKey);

    const control = button(t(value ? "settings.on" : "settings.off"), () => {
      this.#handlers.onChange({ [field]: !value });
    });
    control.classList.add("switch");
    control.classList.toggle("is-on", value);
    control.setAttribute("aria-pressed", String(value));
    control.setAttribute("aria-label", label.textContent ?? "");
    control.append(element("span", "switch-knob"));

    row.append(label, control);
    return row;
  }

  #language(): HTMLElement {
    const row = element("div", "settings-row");

    const label = element("span");
    label.textContent = t("settings.language");

    const value = element("span", "settings-value");
    value.textContent = t("settings.languageValue");
    value.title = t("settings.languageNote");

    row.append(label, value);
    return row;
  }

  #privacy(): HTMLElement {
    const row = element("div", "settings-row");

    const link = element("a", "settings-link");
    link.href = PRIVACY_URL;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = t("settings.privacy");

    row.append(link);
    return row;
  }

  #deleteRows(): HTMLElement[] {
    if (!this.#confirming) {
      const row = element("div", "settings-row");
      row.append(
        danger(t("settings.deleteData"), () => {
          this.#confirming = true;
          if (this.#settings) this.render(this.#settings, this.#hintBalance);
        }),
      );
      return [row];
    }

    const line = element("p", "settings-line");
    line.textContent = t("settings.deleteConfirmLine");

    const row = element("div", "settings-row");
    row.append(
      button(t("settings.cancel"), () => {
        this.#confirming = false;
        if (this.#settings) this.render(this.#settings, this.#hintBalance);
      }),
      danger(t("settings.deleteConfirm"), () => {
        this.#confirming = false;
        this.#handlers.onDeleteData();
      }),
    );

    return [line, row];
  }
}

function danger(label: string, onClick: () => void): HTMLButtonElement {
  const node = button(label, onClick);
  node.classList.add("is-danger");
  return node;
}

function closeIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 18 18");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<path d="M3 3 L15 15 M15 3 L3 15" stroke="#1F1B16" stroke-width="3.2" stroke-linecap="round"></path>';
  return svg;
}
