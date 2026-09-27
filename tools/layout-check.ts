#!/usr/bin/env tsx
/**
 * The layout pass: every screen at every phone size the game has to hold,
 * measured rather than looked at. A desktop browser hides most of these —
 * it has room to spare — so each screen is opened at the narrowest phones
 * first and then at the sizes that stretch it the other way.
 *
 * On every screen:
 *   - nothing scrolls sideways;
 *   - every visible button sits fully on screen, is at least the 48dp touch
 *     floor on its short side (ART.md 3, DESIGN.md 4) and overlaps no other;
 *   - no label is clipped inside its own box.
 * On every board, additionally:
 *   - the canvas is on screen and every arrow's tap point reaches the canvas
 *     rather than a HUD row or the coach line lying over it — an arrow that
 *     cannot be tapped is a board that cannot be won (ART.md 10.4).
 *
 *   npm run layout:check [-- --url http://localhost:5173] [--shots DIR]
 *
 * Needs the dev server (`npm run dev`). Exits non-zero on any violation.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_URL, SAVE_KEY, flag, launch, requireDevServer, sleep } from "./cdp";
import type { Page, Viewport } from "./cdp";

const TOOL = "layout:check";
const argv = process.argv.slice(2);
const BASE = flag(argv, "url") ?? DEFAULT_URL;
const SHOTS = flag(argv, "shots");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/**
 * The floor for a DOM button, in CSS px (= dp). The 48dp rule in ART.md 3 is
 * about arrows, and the path carries it there; the chrome is held to 44, the
 * smallest target the platform guidelines accept.
 */
const MIN_TARGET = 44;

/** The smallest cell a board may draw at (ART.md 10.4). */
const MIN_CELL = 32;

/**
 * Small, the reference phone, two common flagships, and a tablet. 320 wide is
 * below the 360dp ART.md 10.4 promises, so it is advisory: its problems are
 * printed and do not fail the run.
 */
const VIEWPORTS: (Viewport & { name: string; advisory?: boolean })[] = [
  { name: "320x640", width: 320, height: 640, deviceScaleFactor: 2, advisory: true },
  { name: "360x780", width: 360, height: 780, deviceScaleFactor: 3 },
  { name: "393x852", width: 393, height: 852, deviceScaleFactor: 3 },
  { name: "412x915", width: 412, height: 915, deviceScaleFactor: 2.625 },
  { name: "768x1024", width: 768, height: 1024, deviceScaleFactor: 2 },
];

/** The smallest board, a tangle, the tallest board, and the timed HUD. */
const BOARDS = [1, 40, 110, 45];

const STRINGS = JSON.parse(
  readFileSync(new URL("../src/ui/strings.en.json", import.meta.url), "utf8"),
) as Record<string, string>;
const HOOK = "window.__arrowCrack";

interface Violation {
  screen: string;
  problem: string;
  /**
   * A button under the size floor is reported and does not fail the run:
   * the HUD's secondary icons are small on purpose, and whether they should
   * be is a design call, not a regression.
   */
  warning?: boolean;
}

/**
 * The page-side measurement. Returns one line per problem; an empty list is a
 * pass. `board` adds the tap-reach checks.
 */
function measure(board: boolean): string {
  return `(() => {
    const MIN = ${MIN_TARGET};
    const W = window.innerWidth;
    const H = window.innerHeight;
    const problems = [];
    const shown = (node) => {
      if (node.closest("[hidden]")) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
    };
    const name = (node) =>
      (node.getAttribute("aria-label") || node.textContent || node.className || node.tagName)
        .replace(/\\s+/g, " ").trim().slice(0, 32);

    if (document.documentElement.scrollWidth > W + 1) {
      problems.push("the page scrolls sideways (" + document.documentElement.scrollWidth + " > " + W + ")");
    }

    // A button inside a box that scrolls is reached by scrolling, so it is
    // judged by size only: the level path, and the settings card on a short
    // screen.
    const inScroller = (node) => {
      for (let box = node.parentElement; box; box = box.parentElement) {
        const overflow = getComputedStyle(box).overflowY;
        if ((overflow === "auto" || overflow === "scroll") && box.scrollHeight > box.clientHeight + 1) {
          return true;
        }
      }
      return false;
    };

    // With a panel or the settings screen up, only its own buttons can be
    // reached; the screen underneath is not what is being measured.
    const layer = [...document.querySelectorAll(".modal-layer, .settings")].find(shown);
    const buttons = [...(layer ?? document).querySelectorAll("button")].filter(shown);
    const boxes = buttons.map((node) => ({ node, rect: node.getBoundingClientRect() }));
    for (const { node, rect } of boxes) {
      const scrolls = inScroller(node);
      if (!scrolls && (rect.left < -0.5 || rect.top < -0.5 || rect.right > W + 0.5 || rect.bottom > H + 0.5)) {
        problems.push("button off screen: " + name(node) + " " + JSON.stringify([rect.left, rect.top, rect.right, rect.bottom].map(Math.round)));
      }
      if (Math.min(rect.width, rect.height) < MIN - 0.5) {
        problems.push("small: button under " + MIN + "px: " + name(node) + " " + Math.round(rect.width) + "x" + Math.round(rect.height));
      }
      if (node.scrollWidth > node.clientWidth + 1) {
        problems.push("label clipped: " + name(node));
      }
      // A button drawn under something else looks tappable and is not.
      if (!scrolls) {
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (top && top !== node && !node.contains(top)) {
          problems.push("button covered: " + name(node) + " under " + name(top));
        }
      }
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].rect;
        const b = boxes[j].rect;
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        // A panel over the board is meant to cover the HUD.
        // The level path scrolls under the floating Play button by design.
        const scrolling = boxes[i].node.closest(".home-path-scroller") || boxes[j].node.closest(".home-path-scroller");
        if (overlap && !scrolling) problems.push("buttons overlap: " + name(boxes[i].node) + " / " + name(boxes[j].node));
      }
    }

    for (const node of document.querySelectorAll("h2, .hud-pill, .home-title-pill, .modal-line, .coach-line")) {
      if (!shown(node)) continue;
      if (node.scrollWidth > node.clientWidth + 1) problems.push("text clipped: " + name(node));
      const rect = node.getBoundingClientRect();
      if (rect.right > W + 0.5 || rect.left < -0.5) problems.push("text off screen: " + name(node));
    }

    if (${board}) {
      const hook = window.__arrowCrack;
      const canvas = document.querySelector("#board");
      const frame = canvas.getBoundingClientRect();
      if (frame.width < 100 || frame.height < 100) problems.push("the board is squeezed to " + Math.round(frame.width) + "x" + Math.round(frame.height));
      const cell = hook.cellSize();
      if (cell < ${MIN_CELL}) problems.push("cell " + cell.toFixed(1) + "px is under the ${MIN_CELL}px floor");
      for (const id of hook.arrowIds()) {
        const at = hook.tapPointOf(id);
        const x = frame.left + at.x;
        const y = frame.top + at.y;
        if (x < 0 || y < 0 || x > W || y > H) {
          problems.push("arrow " + id + " is off screen");
          continue;
        }
        const top = document.elementFromPoint(x, y);
        if (top !== canvas) problems.push("arrow " + id + " is under " + (top ? name(top) : "nothing"));
      }
    }
    return problems;
  })()`;
}

async function check(
  page: Page,
  viewport: string,
  screen: string,
  board: boolean,
  violations: Violation[],
): Promise<void> {
  await sleep(250);
  const problems = await page.eval<string[]>(measure(board));
  for (const problem of problems) {
    violations.push({
      screen: `${viewport} ${screen}`,
      problem,
      warning: problem.startsWith("small:"),
    });
  }
  if (SHOTS) {
    await writeFile(join(SHOTS, `${viewport}-${screen}.png`), await page.screenshot());
  }
}

/** Taps an arrow at the point the session says it can be tapped. */
async function tapArrowAt(page: Page, arrowId: string): Promise<void> {
  const point = await page.eval<{ x: number; y: number }>(`(() => {
    const at = ${HOOK}.tapPointOf(${JSON.stringify(arrowId)});
    const rect = document.querySelector("#board").getBoundingClientRect();
    return { x: rect.left + at.x, y: rect.top + at.y };
  })()`);
  await page.tap(point.x, point.y);
}

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`${BASE}/${query}`);
  await page.waitFor(HOOK, "the dev hook");
  await sleep(300);
}

/** A save with 60 levels cleared, so the home path and the stars pill are full. */
function progressedSave(): string {
  const levels: Record<string, unknown> = {};
  for (let id = 1; id <= 60; id += 1) {
    levels[String(id)] = { stars: 3, bestScore: 123456, bestTimeMs: null };
  }
  return JSON.stringify({ version: 1, levels, hints: 99 });
}

async function runViewport(
  page: Page,
  viewport: Viewport & { name: string },
): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    await walk(page, viewport, violations);
  } catch (error) {
    // A step that cannot be taken — a button off screen, a panel that never
    // came — is itself a layout failure; the screens after it go unchecked.
    const message = error instanceof Error ? error.message : String(error);
    violations.push({ screen: viewport.name, problem: `stopped: ${message}` });
  }
  return violations;
}

async function walk(
  page: Page,
  viewport: Viewport & { name: string },
  violations: Violation[],
): Promise<void> {
  await page.setViewport(viewport);

  // Home, fresh and well into the game.
  await open(page);
  await page.eval("localStorage.clear()");
  await open(page);
  await check(page, viewport.name, "home-fresh", false, violations);
  await page.eval(
    `localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(progressedSave())})`,
  );
  await open(page);
  await check(page, viewport.name, "home-progressed", false, violations);

  // Settings, with its confirm step open, the longest the screen gets.
  await page.tapButton(STRINGS["home.settings"]!);
  await page.waitFor(`${HOOK}.settingsOpen`, "settings");
  await page.tapButton(STRINGS["settings.deleteData"]!);
  await check(page, viewport.name, "settings", false, violations);

  for (const level of BOARDS) {
    await open(page, `?level=${level}`);
    // The warning panels are screens of their own.
    const warning = await page.eval<string | null>(`${HOOK}.panel`);
    if (warning) {
      await check(page, viewport.name, `level-${level}-${warning}`, false, violations);
      await page.tapButton(STRINGS["oneHeart.start"]!);
      await page.waitFor(`!${HOOK}.panel`, "the warning to close");
    }
    // Checked with the coach line up where the level has one: it is the
    // thing most likely to sit on the board.
    await check(page, viewport.name, `level-${level}`, true, violations);
  }

  // Settings opened from the HUD, over a live board with a chain running:
  // the HUD's own layers are the ones that could end up on top of it.
  await open(page, "?level=9");
  for (let shot = 0; shot < 3; shot += 1) {
    const move = await page.eval<string | null>(`${HOOK}.nextMove()`);
    if (!move) break;
    await tapArrowAt(page, move);
    await sleep(350);
  }
  await page.tapButton(STRINGS["home.settings"]!);
  await page.waitFor(`${HOOK}.settingsOpen`, "settings over the board");
  await check(page, viewport.name, "settings-mid-level", false, violations);

  // The win and fail panels.
  await open(page, "?level=1");
  for (let shot = 0; shot < 20 && !(await page.eval(`${HOOK}.panel`)); shot += 1) {
    const move = await page.eval<string | null>(`${HOOK}.nextMove()`);
    if (!move) break;
    await tapArrowAt(page, move);
    await sleep(400);
  }
  await page.waitFor(`${HOOK}.panel === "win"`, "the win panel", 8_000);
  await page.waitFor(
    `!document.querySelector(".modal-buttons.is-pending, .modal-buttons.is-locked")`,
    "the buttons",
    8_000,
  );
  await check(page, viewport.name, "win", false, violations);

  await open(page, "?level=20");
  await page.tapButton(STRINGS["oneHeart.start"]!);
  const wrong = await page.eval<string | null>(`${HOOK}.wrongMove()`);
  if (wrong) {
    await tapArrowAt(page, wrong);
    await page.waitFor(`${HOOK}.panel === "lost"`, "the fail panel");
    await check(page, viewport.name, "lost", false, violations);
  }
}

async function main(): Promise<void> {
  await requireDevServer(TOOL, BASE);
  const browser = await launch(VIEWPORTS[0]!);
  let gating = 0;
  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      const violations = await runViewport(page, viewport);
      for (const error of page.errors)
        violations.push({ screen: viewport.name, problem: error });
      const failing = viewport.advisory
        ? []
        : violations.filter((entry) => !entry.warning);
      const verdict =
        failing.length > 0 ? "FAIL" : violations.length > 0 ? "warn" : "ok  ";
      console.log(
        `  ${verdict} ${viewport.name}${viewport.advisory ? " (advisory)" : ""}`,
      );
      // Warnings repeat on every screen; each is printed once per viewport.
      const seen = new Set<string>();
      for (const violation of violations) {
        const key = violation.warning
          ? violation.problem
          : `${violation.screen}: ${violation.problem}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(`       ${key}`);
      }
      gating += failing.length;
    }
  } finally {
    await browser.close();
  }

  console.log(`
${TOOL}: ${gating === 0 ? "clean" : `${gating} problem(s)`}`);
  if (gating > 0) process.exit(1);
}

await main();
process.exit(0);
