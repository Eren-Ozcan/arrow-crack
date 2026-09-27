#!/usr/bin/env tsx
/**
 * What a board costs to keep on screen, and whether playing leaks.
 *
 * The session redraws the canvas every frame, so the board's cost is paid
 * sixty times a second for as long as the player looks at it. The number
 * that matters is **relative**: headless Chrome on a desktop runs far faster
 * than a phone, so an absolute frame budget tuned here would pass everything.
 * What survives the change of machine is the ratio — the busiest board
 * against the smallest one, on the same renderer in the same run. A change
 * that makes arrows expensive moves the ratio; a fast desktop does not.
 *
 * The leak pass is absolute, because DOM nodes and listeners are the same
 * number everywhere: a level opened and left twenty times must not leave
 * listeners, nodes or heap behind (`GameSession.destroy()` is the only thing
 * that stands between a session and the window it listens on).
 *
 * The hint is timed as the player waits for it: the round trip to the solver
 * worker, on the busiest board (TELEMETRY.md 4.2 budgets the search itself).
 *
 *   npm run perf:check [-- --url http://localhost:5173] [--seconds 4]
 *
 * Needs the dev server (`npm run dev`). Exits non-zero when a budget is blown.
 */
import { DEFAULT_URL, flag, launch, requireDevServer, sleep } from "./cdp";
import type { Page } from "./cdp";

const TOOL = "perf:check";
const argv = process.argv.slice(2);
const BASE = flag(argv, "url") ?? DEFAULT_URL;
const SECONDS = Number(flag(argv, "seconds") ?? "4");

const VIEWPORT = { width: 360, height: 780, deviceScaleFactor: 3 };
const HOOK = "window.__arrowCrack";

/** The smallest board, and the one with the most arrows in the bundle. */
const LIGHT_LEVEL = 1;
const HEAVY_LEVEL = 809;

const BUDGET = {
  /** Main-thread time on the heavy board over the light one. */
  heavyOverLight: 3,
  /** Listeners left on the page after the leak loop, beyond the first pass. */
  listenerGrowth: 0,
  /** DOM nodes, same. The home path re-renders, so a little slack. */
  nodeGrowth: 150,
  /** JS heap after a forced GC, in MB. */
  heapGrowthMb: 3,
  /** Hint round trip, ms: the 250 ms search plus the worker hop. */
  hintMs: 600,
};

const LEAK_CYCLES = 20;

/** Main-thread milliseconds per wall-clock second while the board sits idle. */
async function busyPerSecond(page: Page, level: number): Promise<number> {
  await page.goto(`${BASE}/?level=${level}`);
  await page.waitFor(`${HOOK}.view?.levelId === ${level}`, `level ${level}`);
  // Past the pre-level warning, if the level has one: it suspends nothing
  // the renderer does, but it is not what a player looks at for minutes.
  if (await page.eval(`${HOOK}.panel`)) {
    await page.eval(`document.querySelector(".modal .is-primary")?.click()`);
  }
  await sleep(800);

  const read = async (): Promise<number> => {
    const { metrics } = await page.cdp.send("Performance.getMetrics");
    const task = (metrics as { name: string; value: number }[]).find(
      (metric) => metric.name === "TaskDuration",
    );
    return (task?.value ?? 0) * 1000;
  };
  const before = await read();
  const started = Date.now();
  await sleep(SECONDS * 1000);
  const spent = (await read()) - before;
  return spent / ((Date.now() - started) / 1000);
}

interface Counters {
  nodes: number;
  listeners: number;
  heapMb: number;
}

async function counters(page: Page): Promise<Counters> {
  await page.cdp.send("HeapProfiler.collectGarbage");
  await sleep(200);
  const dom = await page.cdp.send("Memory.getDOMCounters");
  const heap = await page.cdp.send("Runtime.getHeapUsage");
  return {
    nodes: dom.nodes as number,
    listeners: dom.jsEventListeners as number,
    heapMb: (heap.usedSize as number) / 1024 / 1024,
  };
}

/** Opens a level from home and backs out of it, the way a player dithers. */
async function cycle(page: Page, level: number): Promise<void> {
  await page.eval(`document.querySelector(".home-play").click()`);
  await page.waitFor(
    `${HOOK}.view?.levelId === ${level} && !document.querySelector("#board").hidden`,
    "the level",
  );
  const move = await page.eval<string | null>(`${HOOK}.nextMove()`);
  if (move) {
    const point = await page.eval<{ x: number; y: number }>(`(() => {
      const at = ${HOOK}.tapPointOf(${JSON.stringify(move)});
      const rect = document.querySelector("#board").getBoundingClientRect();
      return { x: rect.left + at.x, y: rect.top + at.y };
    })()`);
    await page.tap(point.x, point.y);
    await sleep(100);
  }
  await page.eval(`${HOOK}.back()`);
  await page.waitFor(`!document.querySelector(".home").hidden`, "home");
}

async function hintRoundTrip(page: Page, level: number): Promise<number> {
  await page.goto(`${BASE}/?level=${level}`);
  await page.waitFor(`${HOOK}.view?.levelId === ${level}`, `level ${level}`);
  if (await page.eval(`${HOOK}.panel`)) {
    await page.eval(`document.querySelector(".modal .is-primary")?.click()`);
  }
  // The first call also spins the worker up; the player pays that once.
  await page.eval(`${HOOK}.nextMove()`);
  const times = await page.eval<number[]>(`(async () => {
    const times = [];
    for (let i = 0; i < 5; i += 1) {
      const started = performance.now();
      await ${HOOK}.nextMove();
      times.push(performance.now() - started);
    }
    return times;
  })()`);
  return Math.max(...times);
}

async function main(): Promise<void> {
  await requireDevServer(TOOL, BASE);
  const browser = await launch(VIEWPORT);
  const failures: string[] = [];
  const report = (label: string, value: string, ok: boolean, budget: string): void => {
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${label.padEnd(34)} ${value.padStart(10)}   (budget ${budget})`,
    );
    if (!ok) failures.push(label);
  };

  try {
    const page = browser.page;
    await page.cdp.send("Performance.enable");

    const light = await busyPerSecond(page, LIGHT_LEVEL);
    const heavy = await busyPerSecond(page, HEAVY_LEVEL);
    const ratio = heavy / Math.max(light, 1);
    console.log(
      `  info main thread, level ${LIGHT_LEVEL} idle           ${light.toFixed(1).padStart(10)} ms/s`,
    );
    console.log(
      `  info main thread, level ${HEAVY_LEVEL} idle         ${heavy.toFixed(1).padStart(10)} ms/s`,
    );
    report(
      "heavy board over light board",
      `${ratio.toFixed(2)}x`,
      ratio <= BUDGET.heavyOverLight,
      `${BUDGET.heavyOverLight}x`,
    );

    // The leak loop runs from a fresh save, so the Play button opens level 1.
    await page.goto(`${BASE}/`);
    await page.eval("localStorage.clear()");
    await page.goto(`${BASE}/`);
    await page.waitFor(`${HOOK} && !document.querySelector(".home").hidden`, "home");
    // One pass first: the HUD, the coach and the panels are built once, lazily.
    await cycle(page, 1);
    const first = await counters(page);
    for (let index = 0; index < LEAK_CYCLES; index += 1) await cycle(page, 1);
    const last = await counters(page);
    report(
      `listeners after ${LEAK_CYCLES} level exits`,
      `+${last.listeners - first.listeners}`,
      last.listeners - first.listeners <= BUDGET.listenerGrowth,
      `+${BUDGET.listenerGrowth}`,
    );
    report(
      `DOM nodes after ${LEAK_CYCLES} level exits`,
      `+${last.nodes - first.nodes}`,
      last.nodes - first.nodes <= BUDGET.nodeGrowth,
      `+${BUDGET.nodeGrowth}`,
    );
    const heapGrowth = last.heapMb - first.heapMb;
    report(
      `heap after ${LEAK_CYCLES} level exits`,
      `${heapGrowth >= 0 ? "+" : ""}${heapGrowth.toFixed(2)} MB`,
      heapGrowth <= BUDGET.heapGrowthMb,
      `+${BUDGET.heapGrowthMb} MB`,
    );

    const hint = await hintRoundTrip(page, HEAVY_LEVEL);
    report(
      `hint round trip, level ${HEAVY_LEVEL}`,
      `${hint.toFixed(0)} ms`,
      hint <= BUDGET.hintMs,
      `${BUDGET.hintMs} ms`,
    );

    if (page.errors.length > 0) {
      for (const error of page.errors) console.log(`  FAIL ${error}`);
      failures.push("page errors");
    }
  } finally {
    await browser.close();
  }

  console.log(
    `\n${TOOL}: ${failures.length === 0 ? "within budget" : `${failures.length} over`}`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
process.exit(0);
