#!/usr/bin/env tsx
/**
 * Screenshot a level as a phone sees it, for the eye half of the ART.md
 * section 10 validation. The mechanical assertions live in
 * `tests/art-validation.test.ts`; this produces the stills a person has to
 * look at — grayscale (10.1), the three colour-vision filters (10.2), the
 * tangle still (10.5) — so that pass is repeatable instead of a one-off.
 *
 * It drives a headless Chrome over the DevTools protocol: device metrics are
 * the real 360dp phone, and a filter is applied to the page itself, so the
 * pixels are what the renderer draws rather than a post-processed guess.
 *
 *   npx tsx tools/shoot.ts --level 67 --filter deuteranopia --out shot.png
 *
 * The dev server must already be running (`npm run dev`).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The narrowest phone ART.md 10.4 holds the layout to, in CSS pixels. */
const VIEWPORT = { width: 360, height: 800 };
const DEVICE_SCALE_FACTOR = 2;
/** `STORAGE_KEY` in `src/state/save.ts`; duplicated so this stays a CLI. */
const SAVE_KEY = "arrowcrack.save";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}/Google/Chrome/Application/chrome.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/**
 * Colour-vision matrices, the linear approximations used by the common
 * simulation filters. `none` is the unfiltered board; `grayscale` is the
 * 10.1 desaturation, run through the same path so the two stills are
 * comparable.
 */
const FILTERS = {
  none: null,
  grayscale: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
  protanopia: [0.567, 0.433, 0.0, 0.558, 0.442, 0.0, 0.0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0.0, 0.7, 0.3, 0.0, 0.0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0.0, 0.0, 0.433, 0.567, 0.0, 0.475, 0.525],
} satisfies Record<string, number[] | null>;

type FilterName = keyof typeof FILTERS;

interface Options {
  level: number;
  filter: FilterName;
  out: string;
  url: string;
  /** Extra milliseconds to let the board settle before the shutter. */
  settleMs: number;
  /** Seed the save with colour-blind mode on (ART.md 2.2). */
  colourBlind: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    level: 1,
    filter: "none",
    out: "shot.png",
    url: "http://localhost:5173",
    settleMs: 1200,
    colourBlind: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--colour-blind") {
      options.colourBlind = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined) fail(`missing value for ${flag}`);
    index += 1;

    switch (flag) {
      case "--level":
        options.level = Number(value);
        break;
      case "--filter":
        if (!(value in FILTERS)) fail(`unknown filter ${value}`);
        options.filter = value as FilterName;
        break;
      case "--out":
        options.out = value;
        break;
      case "--url":
        options.url = value;
        break;
      case "--settle":
        options.settleMs = Number(value);
        break;
      default:
        fail(`unknown flag ${flag}`);
    }
  }
  return options;
}

function fail(message: string): never {
  console.error(`shoot: ${message}`);
  process.exit(1);
}

/**
 * The page-side filter. An SVG colour matrix on the root element, which
 * catches the canvas as well as the HUD — the point of 10.1 and 10.2 is that
 * the whole screen has to survive the filter, not only the board.
 */
function filterScript(name: FilterName): string {
  const matrix = FILTERS[name];
  if (matrix === null) return "true";

  const [rr, rg, rb, gr, gg, gb, br, bg, bb] = matrix as number[];
  const values = [
    rr,
    rg,
    rb,
    0,
    0,
    gr,
    gg,
    gb,
    0,
    0,
    br,
    bg,
    bb,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ].join(" ");

  return `(() => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    const filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", "cvd");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    const matrix = document.createElementNS(ns, "feColorMatrix");
    matrix.setAttribute("type", "matrix");
    matrix.setAttribute("values", "${values}");
    filter.append(matrix);
    svg.append(filter);
    document.body.append(svg);
    document.documentElement.style.filter = "url(#cvd)";
    return true;
  })()`;
}

/** Whatever a DevTools command answers with; each caller reads its own keys. */
type CdpResult = Record<string, string | undefined>;

/** A CDP session over the browser's WebSocket endpoint. */
class Session {
  #socket: WebSocket;
  #nextId = 1;
  #pending = new Map<
    number,
    { resolve: (value: CdpResult) => void; reject: (error: Error) => void }
  >();

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async open(endpoint: string): Promise<Session> {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("cdp connect failed")), {
        once: true,
      });
    });
    return new Session(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<CdpResult> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.#socket.close();
  }
}

function chromePath(): string {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) fail("no Chrome found — set one of the paths in CHROME_CANDIDATES");
  return found;
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function targetEndpoint(port: number): Promise<string> {
  // Chrome needs a moment to write its listening socket.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const body = (await response.json()) as { webSocketDebuggerUrl: string };
      return body.webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  return fail("Chrome did not open a debugging port");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const port = 9222 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(join(tmpdir(), "arrow-shoot-"));

  const chrome = spawn(
    chromePath(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const browser = await Session.open(await targetEndpoint(port));
    const { targetId } = await browser.send("Target.createTarget", {
      url: "about:blank",
    });
    if (targetId === undefined) fail("Chrome opened no page to drive");
    const page = await Session.open(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);

    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      mobile: true,
    });

    const url = `${options.url}/?level=${options.level}`;
    if (options.colourBlind) {
      // The setting lives in the save, so it has to be there before the app
      // reads it — which means before the first navigation to the app origin.
      await page.send("Page.navigate", { url: `${options.url}/` });
      await sleep(400);
      await page.send("Runtime.evaluate", {
        expression: `localStorage.setItem(${JSON.stringify(SAVE_KEY)}, JSON.stringify({ version: 1, settings: { colourBlindMode: true } }))`,
      });
    }
    await page.send("Page.navigate", { url });
    await sleep(options.settleMs);

    await page.send("Runtime.evaluate", {
      expression: filterScript(options.filter),
      awaitPromise: false,
    });
    // One more frame so the filtered page is composited before the shutter.
    await sleep(300);

    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    if (data === undefined) fail("Chrome returned no screenshot");
    await writeFile(options.out, Buffer.from(data, "base64"));
    console.log(`shoot: ${options.out} — level ${options.level}, ${options.filter}`);

    page.close();
    browser.close();
  } finally {
    chrome.kill();
  }
}

await main();
process.exit(0);
