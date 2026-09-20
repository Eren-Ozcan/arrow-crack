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
    // legible at a glance (ART.md 6).
    this.#hearts.replaceChildren(
      ...Array.from({ length: view.hearts }, (_, index) => {
        const heart = element("span", "heart");
        heart.textContent = "♥";
        if (index >= view.heartsLeft) heart.classList.add("heart-spent");
        return heart;
      }),
    );

    this.#badge.textContent = `x${view.multiplier}`;
    this.#badge.classList.toggle("hud-badge-hot", view.multiplier > 1);
    this.#score.textContent = view.score.toLocaleString("en-US");

    this.#grid.classList.toggle("is-on", view.showGrid);
    this.#fit.hidden = view.fitted;
  }
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
