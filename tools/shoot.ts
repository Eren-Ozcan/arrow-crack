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
import { writeFile } from "node:fs/promises";
import { SAVE_KEY, launch, sleep } from "./cdp";

/** The narrowest phone ART.md 10.4 holds the layout to, in CSS pixels. */
const VIEWPORT = { width: 360, height: 800 };
const DEVICE_SCALE_FACTOR = 2;

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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const browser = await launch({
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  try {
    const { page } = browser;
    const url = `${options.url}/?level=${options.level}`;
    if (options.colourBlind) {
      // The setting lives in the save, so it has to be there before the app
      // reads it — which means before the first navigation to the app origin.
      await page.goto(`${options.url}/`);
      await page.eval(
        `localStorage.setItem(${JSON.stringify(SAVE_KEY)}, JSON.stringify({ version: 1, settings: { colourBlindMode: true } }))`,
      );
    }
    await page.goto(url);
    await sleep(options.settleMs);

    await page.eval(filterScript(options.filter));
    // One more frame so the filtered page is composited before the shutter.
    await sleep(300);

    await writeFile(options.out, await page.screenshot());
    console.log(`shoot: ${options.out} — level ${options.level}, ${options.filter}`);
  } finally {
    await browser.close();
  }
}

await main();
process.exit(0);
