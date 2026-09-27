import { LEVEL_COUNT, LEVEL_IDS } from "@/levels";
import { currentLevelId, isUnlocked, levelRecord, totalStars } from "@/state/save";
import type { SaveData } from "@/state/save";
import { button, element, iconButton, starIcon } from "./hud";
import { t } from "./strings";

export interface HomeHandlers {
  onPlay: (levelId: number) => void;
  onSettings: () => void;
}

/** One node's position along the winding path, in the path SVG's own units. */
interface PathPoint {
  /** 0-100, the path SVG's horizontal unit (percent of the lane width). */
  xPct: number;
  /** Pixels down the (taller-than-wide) scrolling path. */
  y: number;
}

const ROW_STEP = 92;
const TOP_PAD = 70;
/** Levels drawn on the path before and after the current one. */
const PATH_BEHIND = 60;
const PATH_AHEAD = 30;
const AMPLITUDE = 27;
const CENTRE = 50;

/**
 * A deterministic left-right wander down the path, standing in for the
 * mockup's hand-drawn polyline: there is no per-level coordinate in the save
 * data (and none should be added just for this), so every node's position is
 * computed from its index alone. Two runs with the same level count always
 * draw the same path.
 */
function pathPoint(index: number): PathPoint {
  return {
    xPct: CENTRE + AMPLITUDE * Math.sin(index * 0.9 + 0.4),
    y: TOP_PAD + index * ROW_STEP,
  };
}

function pathSvg(count: number, height: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 100 ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "home-path-line");
  svg.setAttribute("aria-hidden", "true");

  const points = Array.from({ length: count }, (_, i) => pathPoint(i));
  const d = points.map((p) => `${p.xPct},${p.y}`).join(" ");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", d);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#FFFFFF");
  polyline.setAttribute("stroke-width", "3");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  polyline.setAttribute("stroke-dasharray", "0 7");
  polyline.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(polyline);

  return svg;
}

/** The home header's decorative arrow-and-block mark (ART.md 8: the app icon motif). */
function markIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("class", "home-mark");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<rect width="200" height="200" rx="44" fill="#FFFFFF"></rect>' +
    '<rect x="108" y="50" width="64" height="100" rx="26" fill="#004B75"></rect>' +
    '<rect x="114" y="56" width="52" height="88" rx="21" fill="#0072B2"></rect>' +
    '<line x1="30" y1="100" x2="92" y2="100" stroke="#986900" stroke-width="30" stroke-linecap="round"></line>' +
    '<line x1="30" y1="100" x2="92" y2="100" stroke="#E69F00" stroke-width="20" stroke-linecap="round"></line>' +
    '<path d="M72 76 L98 100 L72 124" stroke="#986900" stroke-width="30" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '<path d="M72 76 L98 100 L72 124" stroke="#E69F00" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>';
  return svg;
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
  #playText: HTMLElement;
  #playLevel: HTMLElement;
  #path: HTMLElement;
  /** The level the screen last scrolled to, so it only scrolls on a change. */
  #focused: number | null = null;
  /** Where the Play button goes: the first open level that is not cleared. */
  #current: number | null = null;

  constructor(handlers: HomeHandlers) {
    this.#handlers = handlers;
    this.root = element("div", "home");
    this.root.hidden = true;

    const title = element("div", "home-title-pill");
    title.textContent = t("app.title");

    this.#stars = element("div", "home-stars home-stars-pill");
    const settingsBtn = iconButton(hamburgerBars(), t("home.settings"), handlers.onSettings);

    const header = element("header", "home-header");
    header.append(markIcon(), title, this.#stars, settingsBtn);

    const playLabel = element("span", "home-play-label");
    this.#playLevel = element("span", "home-play-level");
    this.#play = button("", () => this.#playCurrent());
    this.#play.classList.add("home-play");
    this.#play.replaceChildren(playLabel, this.#playLevel);
    this.#playText = playLabel;

    this.#path = element("div", "home-path");
    const pathScroller = element("div", "home-path-scroller");
    pathScroller.append(this.#path);
    this.root.append(header, pathScroller, this.#play);
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
    this.#playText.textContent = t(totalStars(save) === 0 ? "home.play" : "home.continue");
    this.#playLevel.textContent =
      current === null ? "" : t("home.levelLabel", { level: current });
    this.#play.hidden = current === null;

    this.#stars.replaceChildren(
      starIcon(true),
      document.createTextNode(
        t("home.stars", { stars: totalStars(save), total: LEVEL_COUNT * 3 }),
      ),
    );

    // Two thousand nodes would be two thousand buttons in the DOM; the path
    // shows a window around where the player is instead, which is all of it
    // anyone scrolls in practice.
    const at = current === null ? order.length - 1 : order.indexOf(current);
    const shown = order.slice(
      Math.max(0, at - PATH_BEHIND),
      Math.min(order.length, at + PATH_AHEAD + 1),
    );
    const height = TOP_PAD + shown.length * ROW_STEP;
    this.#path.style.height = `${height}px`;
    this.#path.replaceChildren(
      pathSvg(shown.length, height),
      ...shown.map((id, index) => this.#node(save, id, id === current, index)),
    );

    if (current !== null && current !== this.#focused) {
      this.#focused = current;
      // A level the player has never seen is off the bottom of a long path;
      // the screen opens on it rather than at level 1.
      const node = this.#path.children[shown.indexOf(current) + 1];
      node?.scrollIntoView({ block: "center" });
    }
  }

  #playCurrent(): void {
    if (this.#current !== null) this.#handlers.onPlay(this.#current);
  }

  #node(save: SaveData, levelId: number, isCurrent: boolean, index: number): HTMLElement {
    const unlocked = isUnlocked(save, levelId, LEVEL_IDS);
    const record = levelRecord(save, levelId);
    const point = pathPoint(index);

    const wrap = element("div", "home-node-wrap");
    wrap.style.left = `${point.xPct}%`;
    wrap.style.top = `${point.y}px`;

    if (record && record.stars > 0) {
      const stars = element("div", "home-node-stars");
      for (let i = 0; i < 3; i += 1) stars.append(starIcon(i < record.stars));
      wrap.append(stars);
    }

    const node = element("button", "home-node");
    node.type = "button";
    node.disabled = !unlocked;
    node.classList.toggle("is-current", isCurrent);
    node.classList.toggle("is-locked", !unlocked);

    const label = element("span", "home-node-label");
    label.textContent = String(levelId);
    node.append(label);
    node.setAttribute("aria-label", unlocked ? String(levelId) : t("home.locked"));

    if (unlocked) node.addEventListener("click", () => this.#handlers.onPlay(levelId));

    wrap.append(node);
    return wrap;
  }
}

function hamburgerBars(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<line x1="3" y1="5" x2="17" y2="5" stroke="#1F1B16" stroke-width="2.4" stroke-linecap="round"></line>' +
    '<line x1="3" y1="10" x2="17" y2="10" stroke="#1F1B16" stroke-width="2.4" stroke-linecap="round"></line>' +
    '<line x1="3" y1="15" x2="17" y2="15" stroke="#1F1B16" stroke-width="2.4" stroke-linecap="round"></line>';
  return svg;
}
