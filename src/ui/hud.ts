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

  constructor(handlers: HudHandlers) {
    this.root = element("div", "hud");

    this.#level = element("div", "hud-level");
    this.#hearts = element("div", "hud-hearts");
    this.#clock = element("div", "hud-clock");
    this.#badge = element("div", "hud-badge");
    this.#score = element("div", "hud-score");

    const back = button(t("hud.back"), handlers.onBack);
    const restart = button(t("hud.restart"), handlers.onRestart);
    this.#grid = button(t("hud.grid"), handlers.onToggleGrid);
    this.#fit = button(t("hud.fit"), handlers.onFit);

    const left = element("div", "hud-group");
    left.append(this.#level, this.#hearts, this.#clock);

    const right = element("div", "hud-group");
    right.append(this.#badge, this.#score);

    const controls = element("div", "hud-controls");
    controls.append(back, this.#grid, this.#fit, restart);

    this.root.append(left, right, controls);
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
    this.#score.textContent = view.score.toLocaleString("en-US");

    this.#grid.classList.toggle("is-on", view.showGrid);
    this.#fit.hidden = view.fitted;
  }
}

/** The clock turns urgent here, which is also the narrow-escape threshold. */
const LOW_CLOCK_MS = 5_000;

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
