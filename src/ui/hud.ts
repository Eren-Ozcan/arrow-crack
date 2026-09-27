import type { SessionView } from "@/game/session";
import { t } from "./strings";

/**
 * The HUD (DESIGN.md 3, ART.md 6): hearts, the level number, the multiplier
 * badge, and the controls. There is no move counter, because there are no
 * moves to count — only mistakes cost anything.
 *
 * A timed level shows a clock where the hearts would be and nothing else: two
 * failure currencies in one level would be unreadable, so it has exactly one
 * (PROGRESSION.md 3).
 */
export interface HudHandlers {
  onRestart: () => void;
  /** Back to the home screen; the attempt is abandoned (DESIGN.md 1.9). */
  onBack: () => void;
  onToggleGrid: () => void;
  onFit: () => void;
  /** Spends a hint, or plays the ad that buys one (PROGRESSION.md 4). */
  onHint: () => void;
  onSettings: () => void;
}

/**
 * What the hint button is about to do, decided by the app and not here. The
 * button says which of the two it is before it is touched: a rewarded ad
 * nobody expected is the fastest way to become the thing this game is
 * positioned against (`ADS.md` 1.4).
 */
export interface HintState {
  /** Hints in the balance; a tap spends one when there are any. */
  hints: number;
  /** True when a tap would instead play a rewarded ad for one. */
  ad: boolean;
  /** True while an ad or a search is in flight: the button waits it out. */
  busy: boolean;
}

export class Hud {
  readonly root: HTMLElement;

  #hearts: HTMLElement;
  #clock: HTMLElement;
  #level: HTMLElement;
  #badge: HTMLElement;
  #score: HTMLElement;
  #grid: HTMLButtonElement;
  #fit: HTMLButtonElement;
  #hint: HTMLButtonElement;
  #comboFlash: HTMLElement;
  /** The remaining-ms last drawn, to tell a fresh chain from the same one still ticking down. */
  #comboLastRemaining: number | null = null;
  /** True once the near-lapse flash has fired for the chain running right now. */
  #comboWarned = false;

  constructor(handlers: HudHandlers) {
    this.root = element("div", "hud");

    this.#level = element("div", "hud-level hud-pill");
    this.#hearts = element("div", "hud-hearts hud-pill");
    this.#clock = element("div", "hud-clock hud-pill");
    this.#badge = element("div", "hud-badge");
    this.#score = element("div", "hud-score");
    this.#comboFlash = element("div", "hud-combo-flash");

    const back = iconButton(chevronLeftIcon(), t("hud.back"), handlers.onBack);
    const settingsBtn = iconButton(hamburgerIcon(), t("home.settings"), handlers.onSettings);
    this.#grid = iconButton(gridIcon(), t("hud.grid"), handlers.onToggleGrid, "hud-icon-btn-sm");
    this.#fit = iconButton(fitIcon(), t("hud.fit"), handlers.onFit, "hud-icon-btn-sm");

    const top = element("div", "hud-row hud-row-top");
    top.append(back, this.#level, this.#grid, this.#fit, settingsBtn);

    const scoreGroup = element("div", "hud-score-group");
    scoreGroup.append(this.#score, this.#badge, this.#comboFlash);

    const stats = element("div", "hud-row hud-row-stats");
    stats.append(this.#hearts, this.#clock, scoreGroup);

    const restart = button(t("hud.restart"), handlers.onRestart);
    this.#hint = button(t("hud.hint", { hints: 0 }), handlers.onHint);
    this.#hint.hidden = true;
    this.#hint.classList.add("is-primary");

    const controls = element("div", "hud-controls");
    controls.append(restart, this.#hint);

    const rows = element("div", "hud-rows");
    rows.append(top, stats);

    this.root.append(rows, controls);
  }

  update(view: SessionView): void {
    this.#level.textContent = t("hud.level", { level: view.levelId });

    const timed = view.remainingMs !== null;
    this.#hearts.hidden = timed;
    this.#clock.hidden = !timed;
    if (view.remainingMs !== null) {
      this.#clock.textContent = formatClock(view.remainingMs);
      this.#clock.classList.toggle("is-low", view.remainingMs <= LOW_CLOCK_MS);
    }

    // A lost heart drains but stays visible as an outline, so the cost is
    // legible at a glance (ART.md 6). The shape is drawn, not typed: the
    // character renders as a system emoji on some devices, which throws away
    // the palette colour.
    this.#hearts.replaceChildren(
      ...Array.from({ length: view.hearts }, (_, index) =>
        heartIcon(index < view.heartsLeft),
      ),
    );

    this.#badge.textContent = t("hud.multiplier", { multiplier: view.multiplier });
    this.#badge.classList.toggle("hud-badge-hot", view.multiplier > 1);
    this.#updateComboRing(view.multiplier, view.comboRemainingMs);
    if (view.steppedTo !== null) {
      this.#flash(t("hud.multiplier", { multiplier: view.steppedTo }), false);
    }
    this.#score.textContent = view.score.toLocaleString("en-US");

    this.#grid.classList.toggle("is-on", view.showGrid);
    this.#fit.hidden = view.fitted;
  }

  /**
   * The badge glides from its hot, oversized state down to a small red one
   * over exactly the decay window (PROGRESSION.md 1), so the shrink finishes
   * the instant the chain actually lapses. A fresh shot restarts the glide
   * rather than fighting a run already in flight, which is why this only
   * touches the DOM when the remaining time jumps back up.
   */
  #updateComboRing(multiplier: number, remainingMs: number | null): void {
    const badge = this.#badge;

    if (remainingMs === null || multiplier <= 1) {
      this.#comboWarned = false;
      if (this.#comboLastRemaining === null) return;
      this.#comboLastRemaining = null;
      badge.style.transitionDuration = "0s";
      badge.classList.remove("hud-badge-decaying");
      void badge.offsetWidth;
      badge.style.transitionDuration = "";
      return;
    }

    const fresh = this.#comboLastRemaining === null || remainingMs > this.#comboLastRemaining;
    this.#comboLastRemaining = remainingMs;

    if (fresh) {
      this.#comboWarned = false;
      badge.style.transitionDuration = "0s";
      badge.classList.remove("hud-badge-decaying");
      void badge.offsetWidth;
      badge.style.transitionDuration = `${remainingMs}ms`;
      badge.classList.add("hud-badge-decaying");
    }

    // One flash, right as the chain enters its last stretch — same beat the
    // tension tick plays at, so the warning is seen and heard together.
    if (!this.#comboWarned && remainingMs <= COMBO_WARN_MS) {
      this.#comboWarned = true;
      this.#flash(t("hud.multiplier", { multiplier }), true);
    }
  }

  /** A quick pop of the stepped-to (or about-to-lapse) multiplier, then gone. */
  #flash(text: string, warn: boolean): void {
    const flash = this.#comboFlash;
    flash.textContent = text;
    flash.classList.remove("hud-combo-flash-show");
    void flash.offsetWidth;
    flash.classList.toggle("hud-combo-flash-warn", warn);
    flash.classList.add("hud-combo-flash-show");
  }

  /**
   * A button with nothing behind it is worse than no button: when the balance
   * is empty and the attempt has spent its ad cap, the hint is not drawn at
   * all rather than drawn and refused (`ADS.md` 1.3).
   */
  setHint(state: HintState): void {
    const spends = state.hints > 0;
    this.#hint.hidden = !spends && !state.ad;
    this.#hint.disabled = state.busy;
    this.#hint.classList.toggle("is-ad", !spends);
    this.#hint.textContent = spends
      ? t("hud.hint", { hints: state.hints })
      : t("hud.hintAd");
  }
}

/** The clock turns urgent here, which is also the narrow-escape threshold. */
const LOW_CLOCK_MS = 5_000;

/**
 * Where the multiplier's own warning flash fires — kept equal to the tension
 * tick's own threshold in `main.ts` so the chain's last stretch is seen and
 * heard on the same beat.
 */
const COMBO_WARN_MS = 2_000;

/** m:ss, rounded up, so the last second is shown as a second and not as zero. */
export function formatClock(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const HEART_PATH =
  "M12 21s-7.5-4.7-9.4-9.1C1.1 8.3 3 4.8 6.4 4.1c2-.4 3.9.4 5.1 2 1.2-1.6 3.1-2.4 5.1-2 3.4.7 5.3 4.2 3.8 7.8C19.5 16.3 12 21 12 21z";

function heartIcon(filled: boolean): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", filled ? "heart" : "heart heart-spent");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", HEART_PATH);
  svg.append(path);

  return svg;
}

/** A round white pill button carrying one glyph, the candy chrome's icon control. */
export function iconButton(
  icon: SVGSVGElement,
  label: string,
  onClick: () => void,
  extraClass?: string,
): HTMLButtonElement {
  const node = element("button", extraClass ? `hud-icon-btn ${extraClass}` : "hud-icon-btn");
  node.type = "button";
  node.setAttribute("aria-label", label);
  node.append(icon);
  node.addEventListener("click", onClick);
  return node;
}

const STAR_POINTS = "12,2 14.9,8.6 22,9.3 16.6,14 18.2,21 12,17.3 5.8,21 7.4,14 2,9.3 9.1,8.6";

/** The candy direction's star mark, shared by the win panel and the home path. */
export function starIcon(earned: boolean): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", earned ? "star-mark star-mark-earned" : "star-mark");
  svg.setAttribute("aria-hidden", "true");

  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", STAR_POINTS);
  polygon.setAttribute("fill", earned ? "#FFC933" : "#E2D6C3");
  polygon.setAttribute("stroke", earned ? "#C98A00" : "#C9BBA5");
  polygon.setAttribute("stroke-width", "1.5");
  polygon.setAttribute("stroke-linejoin", "round");
  svg.append(polygon);

  return svg;
}

function svgIcon(viewBox: string, inner: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = inner;
  return svg;
}

function chevronLeftIcon(): SVGSVGElement {
  return svgIcon(
    "0 0 20 20",
    '<path d="M13 3 L6 10 L13 17" stroke="#1F1B16" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>',
  );
}

function hamburgerIcon(): SVGSVGElement {
  return svgIcon(
    "0 0 20 20",
    '<line x1="3" y1="5" x2="17" y2="5" stroke="#1F1B16" stroke-width="2.4" stroke-linecap="round"></line>' +
      '<line x1="3" y1="10" x2="17" y2="10" stroke="#1F1B16" stroke-width="2.4" stroke-linecap="round"></line>' +
      '<line x1="3" y1="15" x2="17" y2="15" stroke="#1F1B16" stroke-width="2.4" stroke-linecap="round"></line>',
  );
}

function gridIcon(): SVGSVGElement {
  return svgIcon(
    "0 0 20 20",
    '<rect x="2" y="2" width="7" height="7" rx="1.5" fill="none" stroke="#1F1B16" stroke-width="2"></rect>' +
      '<rect x="11" y="2" width="7" height="7" rx="1.5" fill="none" stroke="#1F1B16" stroke-width="2"></rect>' +
      '<rect x="2" y="11" width="7" height="7" rx="1.5" fill="none" stroke="#1F1B16" stroke-width="2"></rect>' +
      '<rect x="11" y="11" width="7" height="7" rx="1.5" fill="none" stroke="#1F1B16" stroke-width="2"></rect>',
  );
}

function fitIcon(): SVGSVGElement {
  return svgIcon(
    "0 0 20 20",
    '<path d="M2 7 V2 H7 M13 2 H18 V7 M18 13 V18 H13 M7 18 H2 V13" fill="none" stroke="#1F1B16" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>',
  );
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = element("button", "button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}
