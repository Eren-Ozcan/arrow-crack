import type { SessionView } from "@/game/session";

/**
 * The HUD (DESIGN.md 3, ART.md 6): hearts, the level number, the multiplier
 * badge, and the controls. There is no move counter, because there are no
 * moves to count — only mistakes cost anything.
 */
export interface HudHandlers {
  onRestart: () => void;
  onToggleGrid: () => void;
  onFit: () => void;
}

export class Hud {
  readonly root: HTMLElement;

  #hearts: HTMLElement;
  #level: HTMLElement;
  #badge: HTMLElement;
  #score: HTMLElement;
  #grid: HTMLButtonElement;
  #fit: HTMLButtonElement;

  constructor(handlers: HudHandlers) {
    this.root = element("div", "hud");

    this.#level = element("div", "hud-level");
    this.#hearts = element("div", "hud-hearts");
    this.#badge = element("div", "hud-badge");
    this.#score = element("div", "hud-score");

    const restart = button("Restart", handlers.onRestart);
    this.#grid = button("Grid", handlers.onToggleGrid);
    this.#fit = button("Fit", handlers.onFit);

    const left = element("div", "hud-group");
    left.append(this.#level, this.#hearts);

    const right = element("div", "hud-group");
    right.append(this.#badge, this.#score);

    const controls = element("div", "hud-controls");
    controls.append(this.#grid, this.#fit, restart);

    this.root.append(left, right, controls);
  }

  update(view: SessionView): void {
    this.#level.textContent = `Level ${view.levelId}`;

    // A lost heart drains but stays visible as an outline, so the cost is
    // legible at a glance (ART.md 6). The shape is drawn, not typed: the
    // character renders as a system emoji on some devices, which throws away
    // the palette colour.
    this.#hearts.replaceChildren(
      ...Array.from({ length: view.hearts }, (_, index) =>
        heartIcon(index < view.heartsLeft),
      ),
    );

    this.#badge.textContent = `x${view.multiplier}`;
    this.#badge.classList.toggle("hud-badge-hot", view.multiplier > 1);
    this.#score.textContent = view.score.toLocaleString("en-US");

    this.#grid.classList.toggle("is-on", view.showGrid);
    this.#fit.hidden = view.fitted;
  }
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
