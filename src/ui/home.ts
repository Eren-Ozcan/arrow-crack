import { LEVEL_COUNT, LEVEL_IDS } from "@/levels";
import { currentLevelId, isUnlocked, levelRecord, totalStars } from "@/state/save";
import type { SaveData } from "@/state/save";
import { button, element } from "./hud";
import { t } from "./strings";

/** Levels drawn on the path before and after the current one. */
const PATH_BEHIND = 60;
const PATH_AHEAD = 30;

export interface HomeHandlers {
  onPlay: (levelId: number) => void;
  onSettings: () => void;
}

/**
 * The home screen and the level path in one (DESIGN.md 6): the progression
 * spine is the screen, not a separate map behind it. A level is a node with
 * its stars; the next one to play is the one the screen scrolls to.
 */
export class HomeScreen {
  readonly root: HTMLElement;

  #handlers: HomeHandlers;
  #stars: HTMLElement;
  #play: HTMLButtonElement;
  #path: HTMLElement;
  /** The level the screen last scrolled to, so it only scrolls on a change. */
  #focused: number | null = null;
  /** Where the Play button goes: the first open level that is not cleared. */
  #current: number | null = null;

  constructor(handlers: HomeHandlers) {
    this.#handlers = handlers;
    this.root = element("div", "home");
    this.root.hidden = true;

    const title = element("h1", "home-title");
    title.textContent = t("app.title");

    this.#stars = element("div", "home-stars");
    this.#play = button(t("home.play"), () => this.#playCurrent());
    this.#play.classList.add("home-play");

    const header = element("header", "home-header");
    header.append(title, this.#stars, button(t("home.settings"), handlers.onSettings));

    this.#path = element("div", "home-path");
    this.root.append(header, this.#path, this.#play);
  }

  show(save: SaveData): void {
    this.root.hidden = false;
    this.render(save);
  }

  hide(): void {
    this.root.hidden = true;
  }

  render(save: SaveData): void {
    const order = LEVEL_IDS;
    const current = currentLevelId(save, order);
    this.#current = current;

    // The big button is the whole navigation for a player who never scrolls
    // the path: it always opens where they are up to.
    this.#play.textContent = t(totalStars(save) === 0 ? "home.play" : "home.continue");
    this.#play.hidden = current === null;

    this.#stars.textContent = t("home.stars", {
      stars: totalStars(save),
      total: LEVEL_COUNT * 3,
    });

    // Two thousand nodes would be two thousand buttons in the DOM; the path
    // shows a window around where the player is instead, which is all of it
    // anyone scrolls in practice.
    const at = current === null ? order.length - 1 : order.indexOf(current);
    const shown = order.slice(
      Math.max(0, at - PATH_BEHIND),
      Math.min(order.length, at + PATH_AHEAD + 1),
    );
    this.#path.replaceChildren(
      ...shown.map((id) => this.#node(save, id, id === current)),
    );

    if (current !== null && current !== this.#focused) {
      this.#focused = current;
      // A level the player has never seen is off the bottom of a long path;
      // the screen opens on it rather than at level 1.
      this.#path.children[shown.indexOf(current)]?.scrollIntoView({ block: "center" });
    }
  }

  #playCurrent(): void {
    if (this.#current !== null) this.#handlers.onPlay(this.#current);
  }

  #node(save: SaveData, levelId: number, isCurrent: boolean): HTMLElement {
    const unlocked = isUnlocked(save, levelId, LEVEL_IDS);
    const record = levelRecord(save, levelId);

    const node = element("button", "home-node");
    node.type = "button";
    node.disabled = !unlocked;
    node.classList.toggle("is-current", isCurrent);
    node.classList.toggle("is-locked", !unlocked);

    const label = element("span", "home-node-label");
    label.textContent = String(levelId);

    const stars = element("span", "home-node-stars");
    stars.setAttribute("aria-label", unlocked ? "" : t("home.locked"));
    for (let index = 0; index < 3; index += 1) {
      const star = element("span", "star");
      star.textContent = index < (record?.stars ?? 0) ? "★" : "☆";
      stars.append(star);
    }

    node.append(label, stars);
    if (unlocked) node.addEventListener("click", () => this.#handlers.onPlay(levelId));

    return node;
  }
}
