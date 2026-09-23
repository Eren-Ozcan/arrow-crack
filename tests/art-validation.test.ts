import { describe, expect, it } from "vitest";
import { fire } from "@/engine/fire";
import { createState } from "@/engine/level";
import { clearRay } from "@/engine/rays";
import type { LevelDef } from "@/engine/types";
import { LEVELS } from "@/levels";
import { renderBoard } from "@/render/board-renderer";
import { fitCamera } from "@/render/camera";
import { planAnimation } from "@/render/animation";
import { blockRect, computeLayout, cellCentre } from "@/render/layout";
import {
  contrastRatio,
  glyphInk,
  luminance,
  PALETTE,
  paletteEntry,
  THEME,
} from "@/render/palette";
import {
  backingWidth,
  edgeColour,
  drawGlyph,
  glyphWidth,
  outlineWidth,
  pipeWidth,
  tailWidth,
} from "@/render/shapes";
import type { Glyph } from "@/render/palette";

/**
 * The six acceptance tests in ART.md section 10. Four of them are mechanical
 * and live here; the two that need a real pair of eyes — the sunlight test and
 * a first-time player reading a blocked arrow — are checked here only as far
 * as the numbers they rest on go, and the rest is done on a device.
 *
 * Every rule these assert is a rule the game's difficulty depends on: a
 * misread costs a heart (DESIGN.md 1.5), so readability is not a preference.
 */

/** Records what was drawn, so a still frame can be asserted without a canvas. */
interface Call {
  method: string;
  args: unknown[];
}

function recorder(): { context: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const properties: Record<string, unknown> = {};

  const context = new Proxy(
    {},
    {
      get(_target, property: string) {
        if (property in properties) return properties[property];
        // A gradient is a shade of the colour it is built from, so the
        // recorder answers with the stops themselves: a style assertion can
        // then read a gradient exactly as it reads a flat colour.
        if (property === "createLinearGradient" || property === "createRadialGradient") {
          return (...args: unknown[]): CanvasGradient => {
            calls.push({ method: property, args });
            const stops: string[] = [];
            return {
              addColorStop: (_offset: number, colour: string) => {
                stops.push(colour);
                calls.push({ method: "addColorStop", args: [colour] });
              },
              stops,
            } as unknown as CanvasGradient;
          };
        }
        return (...args: unknown[]): undefined => {
          calls.push({ method: property, args });
          return undefined;
        };
      },
      set(_target, property: string, value: unknown) {
        properties[property] = value;
        calls.push({ method: `set:${property}`, args: [value] });
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  return { context, calls };
}

const VIEWPORT = { width: 360, height: 720 };

/**
 * One block per colour with an arrow aimed at it, plus a second arrow parked
 * in front of the first — the tangle the still tests are about.
 */
const BOARD: LevelDef = {
  id: 900,
  cols: 4,
  rows: 4,
  hearts: 3,
  par: 3,
  palette: ["v", "b", "g"],
  arrows: [
    { id: "a1", color: "v", dir: "up", path: [{ col: 0, row: 3 }] },
    {
      id: "a2",
      color: "b",
      dir: "up",
      path: [
        { col: 1, row: 3 },
        { col: 1, row: 2 },
      ],
    },
    // Parallel and adjacent to a2, same colour: the tangle failure mode.
    {
      id: "a3",
      color: "b",
      dir: "up",
      path: [
        { col: 2, row: 3 },
        { col: 2, row: 2 },
      ],
    },
    // Sits across a1's lane, so a1 is blocked and something on the board says so.
    {
      id: "a4",
      color: "g",
      dir: "right",
      path: [
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ],
    },
  ],
  blocks: [
    { id: "b1", side: "top", start: 0, span: 1, layers: ["v", "b"] },
    { id: "b2", side: "top", start: 1, span: 1, layers: ["b"] },
    { id: "b3", side: "top", start: 2, span: 1, layers: ["g"] },
    { id: "b4", side: "right", start: 1, span: 1, layers: ["g"] },
  ],
};

function render(options: { colourBlindMode?: boolean } = {}): Call[] {
  const state = createState(BOARD);
  const layout = computeLayout(BOARD, VIEWPORT);
  const { context, calls } = recorder();

  renderBoard(context, {
    state,
    layout,
    camera: fitCamera(),
    viewport: VIEWPORT,
    showGrid: false,
    ...options,
  });

  return calls;
}

/**
 * A glyph is the only mark drawn around its own origin, so the translate
 * calls a render makes are the board's own transforms plus one per glyph
 * (ART.md 2.2). Counting them off one render says nothing; the difference
 * between the two modes is the glyph count.
 */
function glyphDraws(calls: Call[]): number {
  return calls.filter((call) => call.method === "translate").length;
}

describe("ART.md 10.1 — grayscale", () => {
  // Desaturated, the palette is not separable by lightness and was never
  // meant to be: green against purple is 1.12. The glyphs carry it, which
  // is why they are always on and never a toggle (ART.md 2.3).
  it("does not rely on lightness to tell two colours apart", () => {
    const entries = Object.values(PALETTE);
    const pairs = entries.flatMap((first, index) =>
      entries.slice(index + 1).map((second) => ({
        first,
        second,
        ratio: contrastRatio(first.fill, second.fill),
      })),
    );

    const ambiguous = pairs.filter((pair) => pair.ratio < 1.3);
    expect(ambiguous.length).toBeGreaterThan(0);
    for (const pair of ambiguous) {
      expect(
        pair.first.glyph,
        `${pair.first.name} and ${pair.second.name} are ${pair.ratio.toFixed(2)}:1 apart in grayscale`,
      ).not.toBe(pair.second.glyph);
    }
  });

  it("draws a different path for every glyph", () => {
    const paths = new Map<Glyph, string>();
    const layout = computeLayout(BOARD, VIEWPORT);

    for (const entry of Object.values(PALETTE)) {
      const { context, calls } = recorder();
      drawGlyph(context, { x: 0, y: 0 }, entry.glyph, layout, THEME.ink);
      paths.set(
        entry.glyph,
        calls
          .filter((call) => call.method !== "set:globalAlpha")
          .map((call) => `${call.method}(${call.args.join(",")})`)
          .join("|"),
      );
    }

    expect(new Set(paths.values()).size).toBe(paths.size);
  });

  it("puts a glyph on every arrow and every block in colour-blind mode", () => {
    // With the mode on, matching has to be possible on shape alone, so
    // nothing carrying a colour may be drawn without the shape it owns.
    const marks = glyphDraws(render({ colourBlindMode: true })) - glyphDraws(render());

    expect(marks).toBeGreaterThanOrEqual(BOARD.arrows.length + BOARD.blocks.length);
  });

  it("gives the glyph a tail wide enough to be read at the smallest cell", () => {
    // The glyph used to ride the pipe, which on the narrowest shipped board
    // left it under 4dp — a mark nobody can match a colour by. It sits on a
    // widened tail knob instead, and the knob has to hold the larger
    // high-contrast glyph with an ink edge to spare (ART.md 3).
    const layout = computeLayout(widestShipped(), VIEWPORT);
    const glyph = glyphWidth(layout);

    expect(tailWidth(layout)).toBeGreaterThan(pipeWidth(layout));
    expect(glyph).toBeLessThanOrEqual(tailWidth(layout) - outlineWidth(layout));
    expect(glyph).toBeGreaterThanOrEqual(5);
  });

  it("keeps the tail knob inside its own cell", () => {
    // A knob that spilled past the cell would touch the arrow in the next
    // lane, which is the tangle failure ART.md 10.5 exists to catch.
    const layout = computeLayout(widestShipped(), VIEWPORT);
    expect(tailWidth(layout) + 2 * outlineWidth(layout)).toBeLessThan(layout.cell);
  });

  it("keeps a glyph readable against its own fill", () => {
    // A glyph is only drawn in colour-blind mode, where it is the signal
    // rather than a hint under the colour: full ink, no embossed floor. Dark
    // ink on blue was 3.30, which the grayscale pass read as an unmarked
    // knob, so the ink is picked per fill and the floor is text contrast.
    for (const entry of Object.values(PALETTE)) {
      expect(
        contrastRatio(glyphInk(entry.fill), entry.fill),
        entry.name,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("prints the glyph in paper on the fill too dark to take ink", () => {
    // Only blue flips; the rule is stated as the comparison rather than as
    // the colour, so a palette change cannot quietly reintroduce the blank
    // knob that ART.md 10.1 caught.
    expect(glyphInk(PALETTE.b!.fill)).toBe(THEME.board);
    expect(glyphInk(PALETTE.g!.fill)).toBe(THEME.ink);
  });
});

/** The board that produces the smallest cell any shipped level can ask for. */
function widestShipped(): LevelDef {
  return LEVELS.reduce((worst, level) =>
    level.cols * level.rows > worst.cols * worst.rows ? level : worst,
  );
}

describe("ART.md 10.2 — colour vision deficiency", () => {
  // Viénot, Brettel and Mollon (1999) dichromat simulation, applied in linear
  // RGB. The numbers are CIE76 distances in Lab.
  const SIMULATIONS = {
    protanopia: [
      [0.11238, 0.88762, 0],
      [0.07276, 0.92724, 0],
      [0.00399, -0.00399, 1],
    ],
    deuteranopia: [
      [0.29275, 0.70725, 0],
      [0.30323, 0.69677, 0],
      [-0.02426, 0.02426, 1],
    ],
    tritanopia: [
      [1.01354, 0.14268, -0.15622],
      [-0.01181, 0.87561, 0.13619],
      [0.07707, 0.81208, 0.11085],
    ],
  } as const;

  /** Nothing in the palette may collapse onto anything else, for anyone. */
  const FLOOR = 10;
  /** The level 1-30 triad has to be more than merely distinguishable. */
  const TRIAD_FLOOR = 30;
  const TRIAD = ["v", "b", "g"] as const;

  function separations(matrix: readonly (readonly number[])[]): Map<string, number> {
    const entries = Object.values(PALETTE);
    const result = new Map<string, number>();

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const first = entries[i]!;
        const second = entries[j]!;
        result.set(
          `${first.key}${second.key}`,
          deltaE(simulate(first.fill, matrix), simulate(second.fill, matrix)),
        );
      }
    }
    return result;
  }

  for (const [name, matrix] of Object.entries(SIMULATIONS)) {
    it(`keeps every pair distinguishable under ${name}`, () => {
      for (const [pair, distance] of separations(matrix)) {
        expect(distance, `${pair} under ${name}`).toBeGreaterThanOrEqual(FLOOR);
      }
    });
  }

  it("keeps the level-1 triad far apart for the two common types", () => {
    for (const name of ["protanopia", "deuteranopia"] as const) {
      const distances = separations(SIMULATIONS[name]);
      for (let i = 0; i < TRIAD.length; i += 1) {
        for (let j = i + 1; j < TRIAD.length; j += 1) {
          expect(
            distances.get(`${TRIAD[i]}${TRIAD[j]}`)!,
            `${TRIAD[i]}${TRIAD[j]} under ${name}`,
          ).toBeGreaterThanOrEqual(TRIAD_FLOOR);
        }
      }
    }
  });

  it("records that blue and green lean on their glyphs under tritanopia", () => {
    // The one measured weakness in the set, kept as a number so a palette
    // edit that makes it worse fails rather than passes quietly (ART.md 2.1).
    const distance = separations(SIMULATIONS.tritanopia).get("bg")!;
    expect(distance).toBeGreaterThan(12);
    expect(distance).toBeLessThan(TRIAD_FLOOR);
    expect(PALETTE.b!.glyph).not.toBe(PALETTE.g!.glyph);
  });
});

describe("ART.md 10.3 — a blocked arrow is read off the board", () => {
  it("stops the hold guide at the obstruction, in the disabled ink", () => {
    const state = createState(BOARD);
    const layout = computeLayout(BOARD, VIEWPORT);
    const blocked = state.arrows.find((arrow) => arrow.id === "a1")!;
    const clear = clearRay(state, blocked);
    const { context, calls } = recorder();

    renderBoard(context, {
      state,
      layout,
      camera: fitCamera(),
      viewport: VIEWPORT,
      showGrid: false,
      guides: [
        {
          arrowId: blocked.id,
          clear: [...clear],
          blocked: true,
          targetBlockId: null,
        },
      ],
    });

    // The ray never reaches the frame: it ends against the thing that stopped
    // it, half a cell past the last cell it can cross, which is the cell the
    // player has to look at.
    const stop = cellCentre(layout, clear[clear.length - 1]!);
    const guide = guideStroke(calls);

    expect(guide.strokeStyle).toBe(THEME.disabledInk);
    expect(guide.to.x).toBeCloseTo(stop.x);
    expect(guide.to.y).toBeCloseTo(stop.y - layout.cell / 2);
    expect(guide.to.y).toBeGreaterThan(layout.origin.y);
  });

  it("still draws a line when the obstruction is in the very next cell", () => {
    // With nothing clear ahead there is no cell to draw to, and the guide
    // came out as a dot on the arrow's own head — which reads as no guide at
    // all, on exactly the arrows a player most needs one for.
    const state = createState(BOARD);
    const layout = computeLayout(BOARD, VIEWPORT);
    const blocked = state.arrows.find((arrow) => arrow.id === "a1")!;
    const { context, calls } = recorder();

    renderBoard(context, {
      state,
      layout,
      camera: fitCamera(),
      viewport: VIEWPORT,
      showGrid: false,
      guides: [{ arrowId: blocked.id, clear: [], blocked: true, targetBlockId: null }],
    });

    const guide = guideStroke(calls);
    const length = Math.hypot(guide.to.x - guide.from.x, guide.to.y - guide.from.y);
    expect(length).toBeCloseTo(layout.cell / 2);
  });

  it("runs a clear ray off the screen, not to the frame", () => {
    // Where a clear shot ends up is not on the board, so the line that says
    // so does not stop at its edge: a ray that leaves the screen is read as
    // "this one is out of here" without following it (ART.md 3.2).
    const state = createState(BOARD);
    const layout = computeLayout(BOARD, VIEWPORT);
    const free = state.arrows.find((arrow) => arrow.id === "a2")!;
    const { context, calls } = recorder();

    renderBoard(context, {
      state,
      layout,
      camera: fitCamera(),
      viewport: VIEWPORT,
      showGrid: false,
      guides: [
        {
          arrowId: free.id,
          clear: [...clearRay(state, free)],
          blocked: false,
          targetBlockId: "b2",
        },
      ],
    });

    const guide = guideStroke(calls);
    expect(guide.strokeStyle).toBe(paletteEntry(free.color).fill);
    // Past the top of the board, and past the top of the screen with it.
    expect(guide.to.y).toBeLessThan(layout.bounds.y);
    expect(guide.to.y).toBeLessThan(0);
  });

  it("draws the blocked arrow exactly like any other (ART.md 6.1)", () => {
    // Nothing on a blocked arrow is drawn in the disabled ink: a board full
    // of drained colours reads as broken rather than as informative.
    const calls = render();
    const drained = calls.filter(
      (call) =>
        (call.method === "set:strokeStyle" || call.method === "set:fillStyle") &&
        call.args[0] === THEME.disabledInk,
    );
    expect(drained).toHaveLength(0);
  });
});

/** The dashed stroke the hold guide is drawn with, and where it ended. */
function guideStroke(calls: Call[]): {
  strokeStyle: unknown;
  from: { x: number; y: number };
  to: { x: number; y: number };
} {
  // The guide is the last line drawn on the board — arrows and blocks are
  // done by then, and nothing after it draws a straight segment. Reading it
  // as "the last moveTo/lineTo pair" keeps the helper honest whether the
  // ray is the dashed blocked one or the hairline clear one.
  const moveAt = calls.reduce(
    (found, call, index) => (call.method === "moveTo" ? index : found),
    -1,
  );
  expect(moveAt).toBeGreaterThan(-1);

  const before = calls.slice(0, moveAt).reverse();
  const strokeStyle = before.find((call) => call.method === "set:strokeStyle")?.args[0];
  const moveTo = calls[moveAt]!;
  const lineTo = calls.slice(moveAt).find((call) => call.method === "lineTo");

  return {
    strokeStyle,
    from: { x: moveTo.args[0] as number, y: moveTo.args[1] as number },
    to: { x: lineTo!.args[0] as number, y: lineTo!.args[1] as number },
  };
}

describe("ART.md 10.4 — 360dp", () => {
  const widest = LEVELS.reduce((worst, level) =>
    level.cols * level.rows > worst.cols * worst.rows ? level : worst,
  );

  it("fits the most crowded shipped board with no scrolling", () => {
    const layout = computeLayout(widest, VIEWPORT);

    expect(layout.bounds.width).toBeLessThanOrEqual(VIEWPORT.width);
    expect(layout.bounds.height).toBeLessThanOrEqual(VIEWPORT.height);
    expect(layout.bounds.x).toBeGreaterThanOrEqual(0);
  });

  it("keeps the HUD clear of the frame", () => {
    // The HUD is a band at the top of the screen; the board is centred, so
    // what protects it is the margin above the frame.
    const layout = computeLayout(widest, VIEWPORT);
    expect(layout.bounds.y).toBeGreaterThanOrEqual(HUD_BAND_DP);
  });

  it("holds the cell above the floor the tap targets rest on", () => {
    // A 48dp cell is impossible on a board this wide — 8 cells plus the frame
    // do not fit into 360dp — so the cell floor is what the layout can hold
    // and the 48dp rule is met by the path, which is many cells, and by the
    // zoom (ART.md 3, 4). A level that would break this floor is too big.
    const layout = computeLayout(widest, VIEWPORT);
    expect(layout.cell).toBeGreaterThanOrEqual(MIN_CELL_DP);
  });
});

/** Height of the HUD band at the top of the screen, in dp. */
const HUD_BAND_DP = 96;
/** The smallest cell the layout may produce on the narrowest phone. */
const MIN_CELL_DP = 32;

describe("ART.md 10.5 — tangle", () => {
  const layout = computeLayout(BOARD, VIEWPORT);

  it("leaves a gutter between two parallel runs", () => {
    // Two same-coloured arrows lying side by side must still read as two
    // objects, and the outline is what solves it — so pipe plus both outlines
    // has to stay inside the cell with room left over.
    const drawn = pipeWidth(layout) + 2 * outlineWidth(layout);
    expect(drawn).toBeLessThan(layout.cell);
    expect(layout.cell - drawn).toBeGreaterThanOrEqual(layout.cell * 0.15);
  });

  it("draws every arrow on its own dark edge, whatever else is on the board", () => {
    // The edge is the colour's own dark, never black (ART.md 1), and it is
    // what separates two same-coloured arrows lying side by side.
    const calls = render();
    for (const arrow of BOARD.arrows) {
      const edge = edgeColour(paletteEntry(arrow.color).fill);
      const edged = calls.filter(
        (call) => call.method === "set:strokeStyle" && call.args[0] === edge,
      );
      expect(edged.length, `${arrow.id} (${arrow.color})`).toBeGreaterThan(0);
    }
  });
});

describe("ART.md 10.6 — sunlight", () => {
  it("holds the ink far clear of the board, for the glyphs and the type", () => {
    expect(contrastRatio(THEME.ink, THEME.board)).toBeGreaterThanOrEqual(7);
  });

  it("keeps the board the lighter surface, so the edge is what is read", () => {
    expect(luminance(THEME.board)).toBeGreaterThan(luminance(THEME.ink));
  });

  it("never lets the edge backing thin out below a hairline", () => {
    for (const width of [200, 360, 1024]) {
      const layout = computeLayout(BOARD, { width, height: width * 2 });
      expect(outlineWidth(layout)).toBeGreaterThanOrEqual(1.5);
      // The edge each side of the coloured stroke (ART.md 3): it is what
      // separates two same-coloured arrows, so it may never round away.
      expect(outlineWidth(layout)).toBeGreaterThanOrEqual(layout.cell * 0.05 - 1e-9);
      expect(backingWidth(layout)).toBeGreaterThan(pipeWidth(layout));
    }
  });
});

describe("ART.md 2.1 — red means damage, and only damage", () => {
  it("keeps the damage red out of the arrow palette", () => {
    for (const entry of Object.values(PALETTE)) {
      expect(entry.fill).not.toBe(THEME.wrong);
    }
  });

  it("spends one red on both signals it carries", () => {
    // Hearts and a wrong tap are the same message, so they are the same red:
    // red on this board only ever means "this cost you".
    expect(THEME.heart).toBe(THEME.wrong);
  });

  it("holds the damage red clear of the ink it is drawn over", () => {
    expect(contrastRatio(THEME.wrong, THEME.ink)).toBeGreaterThanOrEqual(3);
  });
});

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function linear(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function simulate(
  hex: string,
  matrix: readonly (readonly number[])[],
): [number, number, number] {
  const rgb = channels(hex).map(linear);
  return matrix.map((row) =>
    row.reduce((sum, weight, index) => sum + weight * rgb[index]!, 0),
  ) as [number, number, number];
}

/** Linear RGB to CIE Lab, D65. */
function lab([r, g, b]: [number, number, number]): [number, number, number] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(first: [number, number, number], second: [number, number, number]) {
  const a = lab(first);
  const b = lab(second);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("ART.md 6 — the block comes apart when the arrow reaches it", () => {
  /** One arrow, one matching single-layer block: a tap that destroys it. */
  const SHOT_BOARD: LevelDef = {
    id: 901,
    cols: 3,
    rows: 4,
    hearts: 3,
    par: 1,
    palette: ["v"],
    arrows: [{ id: "s1", color: "v", dir: "up", path: [{ col: 1, row: 3 }] }],
    blocks: [{ id: "sb", side: "top", start: 1, span: 1, layers: ["v"] }],
  };

  function drawnAt(
    calls: Call[],
    rect: { x: number; y: number; width: number; height: number },
  ): boolean {
    // A block starts its edge shape a corner radius along its own top edge,
    // so that point is where the block is, and nothing else draws there.
    const radius = Math.min(rect.width, rect.height) * 0.44;
    return calls.some(
      (call) =>
        call.method === "moveTo" &&
        Math.abs((call.args[0] as number) - (rect.x + radius)) < 0.5 &&
        Math.abs((call.args[1] as number) - rect.y) < 0.5,
    );
  }

  function frame(elapsed: number | null): Call[] {
    const before = createState(SHOT_BOARD);
    const layout = computeLayout(SHOT_BOARD, VIEWPORT);
    const target = before.blocks[0]!;
    const arrow = before.arrows[0]!;
    const { state, event } = fire(before, arrow.id);
    expect(event).toBe("destroyed");

    const plan = planAnimation({ event, arrow, block: target, travel: 3 });
    const { context, calls } = recorder();

    renderBoard(context, {
      state,
      layout,
      camera: fitCamera(),
      viewport: VIEWPORT,
      showGrid: false,
      ...(elapsed === null ? {} : { animations: [{ plan, elapsed }] }),
    });

    return calls;
  }

  it("still draws the target while the body is on its way", () => {
    // The reducer resolved the shot at the tap, but the player has not seen
    // the arrow arrive yet: a block that vanishes under a travelling arrow
    // reads as the tap breaking it, not the hit.
    const layout = computeLayout(SHOT_BOARD, VIEWPORT);
    const rect = blockRect(layout, createState(SHOT_BOARD).blocks[0]!);
    const slideMs = planAnimation({
      event: "destroyed",
      arrow: createState(SHOT_BOARD).arrows[0]!,
      travel: 3,
    }).phases[0]!.durationMs;

    expect(drawnAt(frame(slideMs * 0.5), rect)).toBe(true);
  });

  it("has it gone once the shot has landed", () => {
    const layout = computeLayout(SHOT_BOARD, VIEWPORT);
    const rect = blockRect(layout, createState(SHOT_BOARD).blocks[0]!);

    expect(drawnAt(frame(null), rect)).toBe(false);
  });
});
