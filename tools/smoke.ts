#!/usr/bin/env tsx
/**
 * The end-to-end pass: the game played in a real browser the way a player
 * plays it, from a fresh install through the flows the unit tests cannot see
 * — the home screen, the HUD, the panels, the settings screen, the save
 * across a reload, the back button, and the solver worker answering on the
 * page. Each case starts from an empty save.
 *
 * The board is played through the dev-build hook in `src/main.ts`
 * (`window.__arrowCrack`): it says where an arrow is and which one the
 * solver would fire, and the tap itself is a real pointer event at that
 * point. Buttons are found by their label in `strings.en.json`, so a string
 * key that stops rendering fails here too.
 *
 *   npm run smoke [-- --url http://localhost:5173] [--only win] [--shots DIR]
 *
 * Needs the dev server (`npm run dev`). Exits non-zero on the first failed
 * case, or when anything reached `console.error` or threw on the page.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_URL, SAVE_KEY, flag, launch, requireDevServer, sleep } from "./cdp";
import type { Page } from "./cdp";

const TOOL = "smoke";
const argv = process.argv.slice(2);
const BASE = flag(argv, "url") ?? DEFAULT_URL;
const ONLY = flag(argv, "only");
const SHOTS = flag(argv, "shots");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** The 360dp phone ART.md 10.4 holds the layout to. */
const VIEWPORT = { width: 360, height: 780, deviceScaleFactor: 2 };

const STRINGS = JSON.parse(
  readFileSync(new URL("../src/ui/strings.en.json", import.meta.url), "utf8"),
) as Record<string, string>;

/** The English line for a key, with `{name}` filled in, as `t()` does. */
function t(key: string, params: Record<string, string | number> = {}): string {
  const line = STRINGS[key];
  if (line === undefined) throw new Error(`no string ${key}`);
  return line.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
}

const HOOK = "window.__arrowCrack";

/**
 * A board built to go stuck, because no shipped level can: random legal play
 * across the first 300 levels never reaches an unsolvable position. A wide
 * block covers lanes 1 and 2, orange over blue. The blue arrow waits behind
 * orange `c` in lane 2, so the only clear is `c` then `b`. Firing orange `a`
 * instead is legal — it peels the orange and costs nothing — but leaves `c`
 * facing blue and `b` stuck behind it: no move can clear the board
 * (DESIGN.md 1.7).
 */
const STUCK_BOARD = {
  id: 9001,
  cols: 4,
  rows: 4,
  hearts: 4,
  par: 2,
  palette: ["v", "b"],
  arrows: [
    {
      id: "a",
      color: "v",
      dir: "right",
      path: [
        { col: 2, row: 1 },
        { col: 3, row: 1 },
      ],
    },
    {
      id: "c",
      color: "v",
      dir: "right",
      path: [
        { col: 2, row: 2 },
        { col: 3, row: 2 },
      ],
    },
    {
      id: "b",
      color: "b",
      dir: "right",
      path: [
        { col: 0, row: 2 },
        { col: 1, row: 2 },
      ],
    },
  ],
  blocks: [{ id: "w", side: "right", start: 1, span: 2, layers: ["v", "b"] }],
};

interface View {
  levelId: number;
  hearts: number;
  heartsLeft: number;
  mistakes: number;
  status: "playing" | "won" | "lost" | "stuck";
  stars: number;
  score: number;
  remainingMs: number | null;
  fitted: boolean;
  shotsFired: number;
  multiplier: number;
  maxMultiplier: number;
  showGrid: boolean;
  coach: string | null;
}

interface Save {
  levels: Record<string, { stars: number; bestScore: number; bestTimeMs: number | null }>;
  hints: number;
  settings: Record<string, boolean | string>;
}

type Panel =
  "win" | "lost" | "oneHeart" | "timed" | "outOfTime" | "resume" | "stuck" | null;

const view = (page: Page): Promise<View | null> => page.eval(`${HOOK}.view`);
const save = (page: Page): Promise<Save> => page.eval(`${HOOK}.save`);
const panel = (page: Page): Promise<Panel> => page.eval(`${HOOK}.panel`);
const stored = (page: Page): Promise<Save | null> =>
  page.eval(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)}) ?? "null")`);

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectEqual<T>(actual: T, expected: T, what: string): void {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

/** Opens the app on an empty save, optionally straight into a level (dev `?level=`). */
async function fresh(page: Page, level?: number): Promise<void> {
  await page.goto(`${BASE}/`);
  await page.eval("localStorage.clear()");
  await page.goto(level === undefined ? `${BASE}/` : `${BASE}/?level=${level}`);
  await page.waitFor(`${HOOK}`, "the dev hook");
  if (level === undefined)
    await page.waitFor(`!document.querySelector(".home").hidden`, "home");
  else await page.waitFor(`${HOOK}.view?.levelId === ${level}`, `level ${level}`);
}

/** The screen point of an arrow: the canvas offset plus the session's own answer. */
async function arrowPoint(
  page: Page,
  arrowId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.eval<{ x: number; y: number } | null>(`(() => {
    const at = ${HOOK}.tapPointOf(${JSON.stringify(arrowId)});
    if (!at) return null;
    const rect = document.querySelector("#board").getBoundingClientRect();
    return { x: rect.left + at.x, y: rect.top + at.y };
  })()`);
  expect(point, `arrow ${arrowId} is not on the board`);
  return point;
}

/**
 * Taps an arrow and waits for the shot to be answered. The pause keeps two
 * taps from being read as a double tap (`DOUBLE_TAP_MS` in `src/input`).
 */
async function tapArrow(page: Page, arrowId: string): Promise<void> {
  const before = (await view(page))?.shotsFired ?? 0;
  const point = await arrowPoint(page, arrowId);
  await page.tap(point.x, point.y);
  await page.waitFor(
    `(${HOOK}.view?.shotsFired ?? 0) > ${before} || ${HOOK}.view?.mistakes > 0 || ${HOOK}.panel`,
    `the shot at ${arrowId} to land`,
  );
  await sleep(330);
}

/** Plays the board to the end with the solver's moves; the level must be won. */
async function solve(page: Page): Promise<View> {
  for (let shot = 0; shot < 60; shot += 1) {
    if ((await panel(page)) === "win") break;
    const status = (await view(page))?.status;
    if (status === "won") {
      await page.waitFor(`${HOOK}.panel === "win"`, "the win panel", 8_000);
      break;
    }
    const move = await page.eval<string | null>(`${HOOK}.nextMove()`);
    expect(move, `the solver found no move on level ${(await view(page))?.levelId}`);
    await tapArrow(page, move);
  }
  await page.waitFor(`${HOOK}.panel === "win"`, "the win panel", 8_000);
  const final = await view(page);
  expect(final, "no view after the win");
  return final;
}

/** Fires arrows that cost a heart until `count` mistakes are on the board. */
async function misfire(
  page: Page,
  count: number,
  kind?: "blocked" | "bounced",
): Promise<void> {
  const asked = kind === undefined ? "" : JSON.stringify(kind);
  for (let index = 0; index < count; index += 1) {
    const wrong = await page.eval<string | null>(`${HOOK}.wrongMove(${asked})`);
    expect(wrong, `no arrow on this board would be a ${kind ?? "mistake"}`);
    const before = (await view(page))!.mistakes;
    const point = await arrowPoint(page, wrong);
    await page.tap(point.x, point.y);
    await page.waitFor(`${HOOK}.view.mistakes > ${before}`, "the mistake to register");
    await sleep(330);
  }
}

async function visibleText(page: Page, selector: string): Promise<string> {
  return page.eval<string>(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    return node && !node.closest("[hidden]") ? node.textContent.replace(/\\s+/g, " ").trim() : "";
  })()`);
}

async function tapSelector(page: Page, selector: string): Promise<void> {
  const point = await page.eval<{ x: number; y: number } | null>(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node || node.closest("[hidden]")) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  expect(point, `nothing visible at ${selector}`);
  await page.tap(point.x, point.y);
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await writeFile(join(SHOTS, `${name}.png`), await page.screenshot());
}

type Case = { name: string; run: (page: Page) => Promise<void> };

const CASES: Case[] = [
  {
    name: "first launch: home on level 1, nothing earned",
    async run(page) {
      await fresh(page);
      await shot(page, "01-home-fresh");
      expectEqual(
        await visibleText(page, ".home-play-label"),
        t("home.play"),
        "play label",
      );
      expectEqual(
        await visibleText(page, ".home-play-level"),
        t("home.levelLabel", { level: 1 }),
        "play level",
      );
      expect(
        (await visibleText(page, ".home-stars")).startsWith("0 / "),
        "a fresh save shows zero stars",
      );
      const locked = await page.eval<number>(
        `document.querySelectorAll(".home-node.is-locked").length`,
      );
      expect(locked > 0, "levels past 1 are locked on a fresh save");
      expectEqual(await stored(page), null, "no save written before anything happened");
    },
  },
  {
    name: "win: level 1 from the Play button to three stars and a banked hint",
    async run(page) {
      await fresh(page);
      await tapSelector(page, ".home-play");
      await page.waitFor(`${HOOK}.view?.levelId === 1`, "level 1");
      expectEqual(
        await visibleText(page, ".hud-row-top"),
        t("hud.level", { level: 1 }),
        "HUD",
      );
      await shot(page, "02-level-1");

      const final = await solve(page);
      await shot(page, "03-win");
      expectEqual(final.stars, 3, "stars on a clean clear");
      expectEqual(final.mistakes, 0, "mistakes");
      expect(final.score > 0, "a clear scores");

      const saved = await stored(page);
      expect(saved, "the win reached localStorage");
      expectEqual(saved.levels["1"]?.stars, 3, "saved stars");
      expectEqual(
        saved.hints,
        1,
        "a first perfect clear pays one hint (PROGRESSION.md 4.1)",
      );
    },
  },
  {
    name: "win panel: Next level opens level 2, Home shows the new progress",
    async run(page) {
      await fresh(page, 1);
      await solve(page);
      await page.tapButton(t("win.next"));
      await page.waitFor(`${HOOK}.view?.levelId === 2 && !${HOOK}.panel`, "level 2");
      await solve(page);
      await page.tapButton(t("win.home"));
      await page.waitFor(`!document.querySelector(".home").hidden`, "home");
      await shot(page, "04-home-progress");
      expectEqual(
        await visibleText(page, ".home-play-label"),
        t("home.continue"),
        "play label",
      );
      expectEqual(
        await visibleText(page, ".home-play-level"),
        t("home.levelLabel", { level: 3 }),
        "the Play button opens where the player is up to",
      );
      expect(
        (await visibleText(page, ".home-stars")).startsWith("6 / "),
        "six stars counted",
      );
    },
  },
  {
    name: "replay: a worse run keeps the best stars",
    async run(page) {
      await fresh(page, 8);
      await solve(page);
      await page.tapButton(t("win.replay"));
      await page.waitFor(
        `${HOOK}.view?.status === "playing" && !${HOOK}.panel`,
        "the replay",
      );
      await misfire(page, 2);
      const final = await solve(page);
      expect(final.stars < 3, "two mistakes cost stars");
      expectEqual(
        (await save(page)).levels["8"]?.stars,
        3,
        "best stars survive a worse replay",
      );
    },
  },
  {
    name: "mistakes: each costs a heart, the last one opens the fail panel",
    async run(page) {
      await fresh(page, 8);
      const start = (await view(page))!;
      expectEqual(start.heartsLeft, start.hearts, "full hearts at the start");
      await misfire(page, 1);
      expectEqual(
        (await view(page))!.heartsLeft,
        start.hearts - 1,
        "hearts after one mistake",
      );
      await misfire(page, start.hearts - 1);
      await page.waitFor(`${HOOK}.panel === "lost"`, "the fail panel");
      await shot(page, "05-lost");
      expectEqual((await view(page))!.status, "lost", "status");
      expectEqual((await save(page)).levels["8"], undefined, "a loss writes nothing");

      await page.tapButton(t("lost.restart"));
      await page.waitFor(
        `!${HOOK}.panel && ${HOOK}.view.status === "playing"`,
        "the restart",
      );
      const again = (await view(page))!;
      expectEqual(again.heartsLeft, again.hearts, "restart refills the hearts");
      expectEqual(again.mistakes, 0, "restart clears the mistakes");
    },
  },
  {
    name: "tutorial forgives: a wrong tap on level 2 costs nothing",
    async run(page) {
      await fresh(page, 2);
      const wrong = await page.eval<string | null>(`${HOOK}.wrongMove()`);
      if (wrong === null) return; // The board has no wrong tap to make.
      const point = await arrowPoint(page, wrong);
      await page.tap(point.x, point.y);
      await sleep(500);
      const after = (await view(page))!;
      expectEqual(after.heartsLeft, after.hearts, "hearts on a forgiving level");
      expectEqual(await panel(page), null, "no panel for a forgiven mistake");
    },
  },
  {
    name: "HUD restart: the board and the score start over",
    async run(page) {
      await fresh(page, 9);
      const move = await page.eval<string>(`${HOOK}.nextMove()`);
      await tapArrow(page, move);
      await misfire(page, 1);
      await page.tapButton(t("hud.restart"));
      await page.waitFor(`${HOOK}.view.shotsFired === 0`, "the restart");
      const after = (await view(page))!;
      expectEqual(after.mistakes, 0, "mistakes after restart");
      expectEqual(after.score, 0, "score after restart");
      const arrows = await page.eval<string[]>(`${HOOK}.arrowIds()`);
      expect(arrows.includes(move), "the fired arrow is back on the board");
    },
  },
  {
    name: "one-heart level: the warning comes first and holds the board",
    async run(page) {
      await fresh(page, 20);
      await page.waitFor(`${HOOK}.panel === "oneHeart"`, "the one-heart warning");
      await shot(page, "06-one-heart");
      expect(
        (await visibleText(page, ".modal h2")) === t("oneHeart.title", { level: 20 }),
        "the warning names the level",
      );
      await page.tapButton(t("oneHeart.start"));
      await page.waitFor(`!${HOOK}.panel`, "the warning to close");
      expectEqual((await view(page))!.hearts, 1, "hearts");
      await misfire(page, 1);
      await page.waitFor(`${HOOK}.panel === "lost"`, "one mistake ends it");
    },
  },
  {
    name: "timed level: the clock waits for Start, runs, and a mistake costs 5 s",
    async run(page) {
      await fresh(page, 45);
      await page.waitFor(`${HOOK}.panel === "timed"`, "the timed warning");
      const limit = (await view(page))!.remainingMs!;
      expectEqual(limit, 45_000, "time limit");
      await sleep(800);
      expectEqual(
        (await view(page))!.remainingMs,
        limit,
        "the clock is stopped behind the warning",
      );

      await page.tapButton(t("oneHeart.start"));
      // Level 45 opens on a coach line, and the clock does not run while one
      // is up: nothing is read on the clock (PROGRESSION.md 3.1).
      await page.waitFor(`!document.querySelector(".coach").hidden`, "the coach line");
      await sleep(800);
      expectEqual(
        (await view(page))!.remainingMs,
        limit,
        "the clock is stopped behind the coach",
      );
      await tapSelector(page, ".coach");
      await page.waitFor(`document.querySelector(".coach").hidden`, "the coach to go");
      await sleep(1_200);
      const running = (await view(page))!.remainingMs!;
      expect(running < limit - 500, `the clock runs after Start (${running})`);
      expectEqual(
        await visibleText(page, ".hud-hearts"),
        "",
        "no hearts on a timed level",
      );

      const before = (await view(page))!.remainingMs!;
      await misfire(page, 1);
      const after = (await view(page))!.remainingMs!;
      expect(
        before - after >= 5_000,
        `a mistake costs five seconds (${before} -> ${after})`,
      );

      // Backgrounding stops the clock and asks for a tap before it restarts
      // (PROGRESSION.md 3.1). The page cannot really be hidden headless, so
      // the event is raised with the property it reads.
      await page.eval(`(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      })()`);
      const frozen = (await view(page))!.remainingMs!;
      await sleep(800);
      expectEqual(
        (await view(page))!.remainingMs,
        frozen,
        "the clock is stopped in the background",
      );
      await page.eval(`(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
      })()`);
      await page.waitFor(`${HOOK}.panel === "resume"`, "the resume panel");
      await page.tapButton(t("resume.button"));
      await page.waitFor(`!${HOOK}.panel`, "the resume panel to close");

      const final = await solve(page);
      expect(final.remainingMs! > 0, "a timed win leaves time on the clock");
      expect(
        (await save(page)).levels["45"]?.bestTimeMs !== null,
        "the best time is saved",
      );
    },
  },
  {
    name: "hint: spends one from the balance and costs no heart",
    async run(page) {
      await fresh(page, 1);
      await solve(page); // Banks the hint a first perfect clear pays.
      expectEqual((await save(page)).hints, 1, "hint balance");
      await page.tapButton(t("win.next"));
      await page.waitFor(`${HOOK}.view?.levelId === 2 && !${HOOK}.panel`, "level 2");
      await page.tapButton(t("hud.hint", { hints: 1 }));
      await page.waitFor(`${HOOK}.save.hints === 0`, "the hint to be spent");
      const after = (await view(page))!;
      expectEqual(after.mistakes, 0, "a hint is not a mistake");
      expectEqual(after.shotsFired, 0, "a hint fires nothing");
      expectEqual((await stored(page))?.hints, 0, "the spend reached the save");
    },
  },
  {
    name: "camera: double tap zooms off the board, Fit brings it back",
    async run(page) {
      await fresh(page, 9);
      const corner = await page.eval<{ x: number; y: number }>(`(() => {
        const rect = document.querySelector("#board").getBoundingClientRect();
        return { x: rect.left + 6, y: rect.top + 6 };
      })()`);
      await page.tap(corner.x, corner.y);
      await sleep(80);
      await page.tap(corner.x, corner.y);
      await page.waitFor(`${HOOK}.view.fitted === false`, "the zoom");
      expectEqual(
        (await view(page))!.shotsFired,
        0,
        "a double tap on the empty board fires nothing",
      );

      await page.tapButton(t("hud.fit"));
      await page.waitFor(`${HOOK}.view.fitted === true`, "fit");
      // A tap after all that still lands on the arrow it points at.
      const move = await page.eval<string>(`${HOOK}.nextMove()`);
      await tapArrow(page, move);
      expectEqual((await view(page))!.shotsFired, 1, "shots after refit");
    },
  },
  {
    name: "settings: a switch persists across a reload",
    async run(page) {
      await fresh(page);
      await page.tapButton(t("home.settings"));
      await page.waitFor(`${HOOK}.settingsOpen`, "settings");
      await shot(page, "07-settings");
      expectEqual(
        await visibleText(page, ".settings-hints"),
        `${t("settings.hints")} 0`,
        "hints row",
      );

      await page.tapButton(t("settings.colourBlindMode"));
      await page.waitFor(`${HOOK}.save.settings.colourBlindMode === true`, "the switch");
      await page.tapButton(t("settings.music"));
      await page.waitFor(`${HOOK}.save.settings.music === false`, "the music switch");
      await page.tapButton(t("settings.close"));
      await page.waitFor(`!${HOOK}.settingsOpen`, "settings to close");

      await page.goto(`${BASE}/`);
      await page.waitFor(`${HOOK}`, "the reload");
      const settings = (await save(page)).settings;
      expectEqual(settings.colourBlindMode, true, "colour-blind mode after reload");
      expectEqual(settings.music, false, "music after reload");
    },
  },
  {
    name: "settings: Delete my data asks first, then wipes the save",
    async run(page) {
      await fresh(page, 1);
      await solve(page);
      await page.tapButton(t("win.home"));
      await page.waitFor(`!document.querySelector(".home").hidden`, "home");
      await page.tapButton(t("home.settings"));
      await page.waitFor(`${HOOK}.settingsOpen`, "settings");

      await page.tapButton(t("settings.deleteData"));
      await page.tapButton(t("settings.cancel"));
      expectEqual((await save(page)).levels["1"]?.stars, 3, "cancel keeps the save");

      await page.tapButton(t("settings.deleteData"));
      await page.tapButton(t("settings.deleteConfirm"));
      await page.waitFor(`Object.keys(${HOOK}.save.levels).length === 0`, "the wipe");
      expectEqual((await save(page)).hints, 0, "hints after the wipe");
    },
  },
  {
    name: "back: settings, then a live board, then home is not consumed",
    async run(page) {
      await fresh(page);
      await page.tapButton(t("home.settings"));
      await page.waitFor(`${HOOK}.settingsOpen`, "settings");
      expectEqual(await page.eval(`${HOOK}.back()`), true, "back closes settings");
      expectEqual(await page.eval(`${HOOK}.settingsOpen`), false, "settings closed");

      await tapSelector(page, ".home-play");
      await page.waitFor(`${HOOK}.view?.levelId === 1`, "level 1");
      expectEqual(await page.eval(`${HOOK}.back()`), true, "back leaves the board");
      await page.waitFor(`!document.querySelector(".home").hidden`, "home");
      expectEqual(
        await page.eval(`${HOOK}.back()`),
        false,
        "back on home leaves the app",
      );
    },
  },
  {
    name: "back from the win panel goes home and keeps the win",
    async run(page) {
      await fresh(page, 1);
      await solve(page);
      expectEqual(await page.eval(`${HOOK}.back()`), true, "back is consumed");
      await page.waitFor(`!document.querySelector(".home").hidden`, "home");
      expectEqual((await save(page)).levels["1"]?.stars, 3, "the win is kept");
    },
  },
  {
    name: "HUD back mid-level returns home without saving the attempt",
    async run(page) {
      await fresh(page, 9);
      const move = await page.eval<string>(`${HOOK}.nextMove()`);
      await tapArrow(page, move);
      await page.tapButton(t("hud.back"));
      await page.waitFor(`!document.querySelector(".home").hidden`, "home");
      expectEqual(await stored(page), null, "an abandoned attempt writes nothing");
    },
  },
  {
    name: "save: progress survives a reload and unlocks the next level",
    async run(page) {
      await fresh(page, 1);
      await solve(page);
      await page.goto(`${BASE}/`);
      await page.waitFor(`!document.querySelector(".home").hidden`, "home");
      expectEqual(
        await visibleText(page, ".home-play-level"),
        t("home.levelLabel", { level: 2 }),
        "the next level after a reload",
      );
      expectEqual(
        await page.eval<number>(
          `document.querySelectorAll(".home-node:not(.is-locked)").length`,
        ),
        2,
        "levels 1 and 2 open",
      );
    },
  },
  {
    name: "save: a corrupt save starts fresh instead of crashing",
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.eval(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, "{not json")`);
      await page.goto(`${BASE}/`);
      await page.waitFor(`${HOOK} && !document.querySelector(".home").hidden`, "home");
      expectEqual(
        await visibleText(page, ".home-play-label"),
        t("home.play"),
        "a fresh start",
      );
    },
  },
  {
    name: "locked levels do not open from the path",
    async run(page) {
      await fresh(page);
      await tapSelector(page, ".home-node.is-locked");
      await sleep(300);
      expectEqual(await page.eval(`${HOOK}.view`), null, "no level started");
      expect(
        !(await page.eval<boolean>(`document.querySelector(".home").hidden`)),
        "still on home",
      );
    },
  },
  {
    name: "gestures: a pan across an arrow never fires it (ART.md 4.1)",
    async run(page) {
      await fresh(page, 9);
      const move = await page.eval<string>(`${HOOK}.nextMove()`);
      const point = await arrowPoint(page, move);
      // Starts on the arrow and moves well past the 8dp tap slop, quickly.
      await page.drag(point, { x: point.x + 40, y: point.y + 10 }, 4);
      await sleep(400);
      const after = (await view(page))!;
      expectEqual(after.shotsFired, 0, "shots after a pan");
      expectEqual(after.mistakes, 0, "mistakes after a pan");
      expect(
        (await page.eval<string[]>(`${HOOK}.arrowIds()`)).includes(move),
        "the arrow stays",
      );
    },
  },
  {
    name: "gestures: a long press shows the guide and never fires",
    async run(page) {
      await fresh(page, 9);
      const wrong = await page.eval<string>(`${HOOK}.wrongMove()`);
      const point = await arrowPoint(page, wrong);
      await page.hold(point.x, point.y, 700);
      await sleep(300);
      const after = (await view(page))!;
      expectEqual(after.shotsFired, 0, "shots after a hold");
      expectEqual(
        after.heartsLeft,
        after.hearts,
        "a hold on a blocked arrow costs nothing",
      );
    },
  },
  {
    name: "HUD: the Grid button toggles the grid lines",
    async run(page) {
      await fresh(page, 9);
      expectEqual((await view(page))!.showGrid, false, "grid off at the start");
      await page.tapButton(t("hud.grid"));
      await page.waitFor(`${HOOK}.view.showGrid === true`, "the grid on");
      await page.tapButton(t("hud.grid"));
      await page.waitFor(`${HOOK}.view.showGrid === false`, "the grid off");
    },
  },
  {
    name: "combo: a clean chain raises the multiplier, a mistake resets it",
    async run(page) {
      await fresh(page, 9);
      for (let shot = 0; shot < 3; shot += 1) {
        await tapArrow(page, await page.eval<string>(`${HOOK}.nextMove()`));
      }
      await page.waitFor(`${HOOK}.view.multiplier >= 2`, "x2 after three clean shots");
      await misfire(page, 1);
      await page.waitFor(`${HOOK}.view.multiplier === 1`, "the chain to break");
      expect((await view(page))!.maxMultiplier >= 2, "the best multiplier is remembered");
    },
  },
  {
    name: "timed level: running the clock out opens the out-of-time panel",
    async run(page) {
      await fresh(page, 45);
      await page.tapButton(t("oneHeart.start"));
      await page.waitFor(`!document.querySelector(".coach").hidden`, "the coach line");
      await tapSelector(page, ".coach");
      // Each mistake is five seconds; nine of them and the clock is gone.
      for (let index = 0; index < 12 && !(await panel(page)); index += 1) {
        await misfire(page, 1);
      }
      await page.waitFor(`${HOOK}.panel === "outOfTime"`, "the out-of-time panel");
      await shot(page, "08-out-of-time");
      expectEqual((await view(page))!.remainingMs, 0, "no time left");
      await page.tapButton(t("lost.restart"));
      await page.waitFor(
        `${HOOK}.view.remainingMs === 45000`,
        "a full clock after restart",
      );
    },
  },
  {
    name: "timed level: the settings screen stops the clock",
    async run(page) {
      await fresh(page, 45);
      await page.tapButton(t("oneHeart.start"));
      await page.waitFor(`!document.querySelector(".coach").hidden`, "the coach line");
      await tapSelector(page, ".coach");
      await sleep(600);
      await page.tapButton(t("home.settings"));
      await page.waitFor(`${HOOK}.settingsOpen`, "settings");
      const before = (await view(page))!.remainingMs!;
      await sleep(2_200);
      const after = (await view(page))!.remainingMs!;
      expectEqual(
        after,
        before,
        "the clock under the settings screen (PROGRESSION.md 3.1: anything that is not play is off the clock)",
      );

      await page.tapButton(t("settings.close"));
      await page.waitFor(`!${HOOK}.settingsOpen`, "settings to close");
      await sleep(2_200);
      const resumed = (await view(page))!.remainingMs!;
      expect(
        resumed < after - 1_000,
        `the clock runs again after Close (${after} -> ${resumed})`,
      );
    },
  },
  {
    name: "settings mid-level: closing it returns to the same board",
    async run(page) {
      await fresh(page, 9);
      await tapArrow(page, await page.eval<string>(`${HOOK}.nextMove()`));
      const before = await page.eval<string[]>(`${HOOK}.arrowIds()`);
      await page.tapButton(t("home.settings"));
      await page.waitFor(`${HOOK}.settingsOpen`, "settings");
      await page.tapButton(t("settings.close"));
      await page.waitFor(`!${HOOK}.settingsOpen`, "settings to close");
      expectEqual((await view(page))!.shotsFired, 1, "shots kept");
      expectEqual(
        JSON.stringify(await page.eval<string[]>(`${HOOK}.arrowIds()`)),
        JSON.stringify(before),
        "the board is untouched",
      );
    },
  },
  {
    name: "colour-blind nudge: the third wrong-colour tap points at the setting",
    async run(page) {
      await fresh(page, 11);
      await misfire(page, 3, "bounced");
      await page.waitFor(
        `${HOOK}.view.coach === "coach.colourBlind"`,
        "the colour-blind line",
      );
      expectEqual(
        await visibleText(page, ".coach-line"),
        t("coach.colourBlind"),
        "the line",
      );
      expectEqual(
        (await save(page)).settings.colourBlindMode,
        false,
        "the mode is only offered",
      );
    },
  },
  {
    name: "reduced motion: the win panel skips the celebration",
    async run(page) {
      await fresh(page);
      await page.tapButton(t("home.settings"));
      await page.tapButton(t("settings.reducedMotion"));
      await page.waitFor(`${HOOK}.save.settings.reducedMotion === true`, "the switch");
      await page.goto(`${BASE}/?level=1`);
      await page.waitFor(`${HOOK}.view?.levelId === 1`, "level 1");
      await solve(page);
      const pending = await page.eval<number>(
        `document.querySelectorAll(".modal .is-pending").length`,
      );
      expectEqual(pending, 0, "nothing on the win panel waits to animate in");
      // The buttons keep a short input guard, which is not motion
      // (PROGRESSION.md 2.2); it lifts well inside a second.
      await page.waitFor(
        `!document.querySelector(".modal .is-locked")`,
        "the tap guard to lift",
        1_000,
      );
    },
  },
  {
    name: "progression: levels 1-12 back to back through Next level",
    async run(page) {
      await fresh(page);
      await tapSelector(page, ".home-play");
      for (let level = 1; level <= 12; level += 1) {
        await page.waitFor(`${HOOK}.view?.levelId === ${level}`, `level ${level}`);
        if ((await panel(page)) !== null) await page.tapButton(t("oneHeart.start"));
        const final = await solve(page);
        expectEqual(final.stars, 3, `stars on level ${level}`);
        if (level < 12) await page.tapButton(t("win.next"));
      }
      expectEqual(Object.keys((await stored(page))!.levels).length, 12, "levels saved");
    },
  },
  {
    name: "stuck: a legal move into a dead end opens the stuck panel, restart is free",
    async run(page) {
      await fresh(page);
      await page.eval(`${HOOK}.playBoard(${JSON.stringify(STUCK_BOARD)})`);
      await page.waitFor(
        `${HOOK}.view?.levelId === ${STUCK_BOARD.id}`,
        "the stuck board",
      );
      // The board starts solvable, and the solver knows the way.
      expectEqual(
        await page.eval<string>(`${HOOK}.nextMove()`),
        "c",
        "the only first move",
      );

      await tapArrow(page, "a");
      await page.waitFor(`${HOOK}.panel === "stuck"`, "the stuck panel", 6_000);
      await shot(page, "09-stuck");
      const stuck = (await view(page))!;
      expectEqual(stuck.status, "stuck", "status");
      expectEqual(stuck.mistakes, 0, "a legal move into a dead end is not a mistake");
      expectEqual(
        stuck.heartsLeft,
        stuck.hearts,
        "being stuck costs no heart (DESIGN.md 1.7)",
      );
      expectEqual(await visibleText(page, ".modal h2"), t("stuck.title"), "panel title");
      const adButtons = await page.eval<number>(
        `document.querySelectorAll(".modal .is-ad-cta").length`,
      );
      expectEqual(adButtons, 0, "no ad is offered for being stuck");

      await page.tapButton(t("stuck.restart"));
      await page.waitFor(
        `!${HOOK}.panel && ${HOOK}.view.status === "playing"`,
        "the restart",
      );
      expectEqual(
        JSON.stringify((await page.eval<string[]>(`${HOOK}.arrowIds()`)).sort()),
        JSON.stringify(["a", "b", "c"]),
        "the board is back",
      );

      // The right order clears it, and no stuck panel gets in the way.
      await tapArrow(page, "c");
      await tapArrow(page, "b");
      await page.waitFor(`${HOOK}.panel === "win"`, "the win after the restart", 8_000);
    },
  },
  {
    name: "stuck: the Home button on the stuck panel leaves the board",
    async run(page) {
      await fresh(page);
      await page.eval(`${HOOK}.playBoard(${JSON.stringify(STUCK_BOARD)})`);
      await page.waitFor(
        `${HOOK}.view?.levelId === ${STUCK_BOARD.id}`,
        "the stuck board",
      );
      await tapArrow(page, "a");
      await page.waitFor(`${HOOK}.panel === "stuck"`, "the stuck panel", 6_000);
      await page.tapButton(t("win.home"));
      await page.waitFor(`!document.querySelector(".home").hidden`, "home");
      expectEqual(await stored(page), null, "a stuck attempt writes nothing");
    },
  },
  {
    name: "generated levels: boards rebuilt on the device open and solve",
    async run(page) {
      // Levels past 10 are a seed the generator rebuilds on load; a board
      // that differs from what CI validated shows up here as unsolvable.
      for (const level of [150, 777, 1500, 2000]) {
        await fresh(page, level);
        if ((await panel(page)) !== null) await page.tapButton(t("oneHeart.start"));
        const final = await solve(page);
        expectEqual(final.status, "won", `level ${level}`);
      }
    },
  },
];

async function main(): Promise<void> {
  await requireDevServer(TOOL, BASE);
  const cases = ONLY ? CASES.filter((entry) => entry.name.includes(ONLY)) : CASES;
  if (cases.length === 0) throw new Error(`no case matches "${ONLY}"`);

  const browser = await launch(VIEWPORT);
  const failures: string[] = [];
  try {
    for (const entry of cases) {
      // A fresh page per case: listeners and page state do not leak across.
      const page = await browser.newPage();
      const started = Date.now();
      try {
        await entry.run(page);
        if (page.errors.length > 0)
          throw new Error(`page errors:\n    ${page.errors.join("\n    ")}`);
        console.log(`  ok   ${entry.name} (${Date.now() - started} ms)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${entry.name}: ${message}`);
        console.log(`  FAIL ${entry.name}\n       ${message}`);
        if (SHOTS) await shot(page, `fail-${failures.length}`).catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${TOOL}: ${cases.length - failures.length}/${cases.length} passed`);
  if (failures.length > 0) process.exit(1);
}

await main();
process.exit(0);
