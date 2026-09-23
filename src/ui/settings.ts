import type { Settings } from "@/state/save";
import { button, element } from "./hud";
import { t } from "./strings";
import type { StringKey } from "./strings";

/** Studio-wide page, not a per-game one (STORE.md 6). */
export const PRIVACY_URL = "https://yilkgames.com/privacy-policy/";

export interface SettingsHandlers {
  onChange: (patch: Partial<Settings>) => void;
  /** Wipes stars, scores and the hint balance (DESIGN.md 6). */
  onDeleteData: () => void;
  onClose: () => void;
}

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
  #hints: HTMLElement;
  /** Deleting everything asks once; it is the only irreversible button here. */
  #confirming = false;
  #settings: Settings | null = null;
  #hintBalance = 0;

  constructor(handlers: SettingsHandlers) {
    this.#handlers = handlers;
    this.root = element("div", "settings");
    this.root.hidden = true;

    const title = element("h2");
    title.textContent = t("settings.title");

    this.#hints = element("p", "settings-hints");
    this.#rows = element("div", "settings-rows");

    const card = element("div", "settings-card");
    card.append(
      title,
      this.#hints,
      this.#rows,
      button(t("settings.close"), handlers.onClose),
    );
    this.root.append(card);
  }

  show(settings: Settings, hints: number): void {
    this.#confirming = false;
    this.root.hidden = false;
    this.render(settings, hints);
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(settings: Settings, hints: number): void {
    this.#settings = settings;
    this.#hintBalance = hints;
    this.#hints.textContent = `${t("settings.hints")} ${hints}`;

    this.#rows.replaceChildren(
      this.#toggle("settings.sound", "sound"),
      this.#toggle("settings.music", "music"),
      this.#toggle("settings.haptics", "haptics"),
      this.#toggle("settings.reducedAudio", "reducedAudio"),
      this.#toggle("settings.reducedMotion", "reducedMotion"),
      this.#toggle("settings.colourBlindMode", "colourBlindMode"),
      this.#language(),
      this.#privacy(),
      ...this.#deleteRows(),
    );
  }

  #toggle(labelKey: StringKey, field: BooleanSetting): HTMLElement {
    const value = this.#settings?.[field] ?? true;
    const row = element("div", "settings-row");

    const label = element("span");
    label.textContent = t(labelKey);

    const control = button(t(value ? "settings.on" : "settings.off"), () => {
      this.#handlers.onChange({ [field]: !value });
    });
    control.classList.toggle("is-on", value);
    control.setAttribute("aria-pressed", String(value));

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
