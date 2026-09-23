import { describe, expect, it } from "vitest";
import {
  blockRect,
  cellAt,
  cellCentre,
  cellRect,
  computeLayout,
  laneExitPoint,
} from "@/render/layout";
import {
  clampCamera,
  boardToScreen,
  fitCamera,
  isFitted,
  screenToBoard,
  toggleZoom,
  zoomAt,
  panBy,
  MAX_SCALE,
} from "@/render/camera";
import { contrastRatio, PALETTE, THEME } from "@/render/palette";

const viewport = { width: 360, height: 720 };
const layout = computeLayout({ cols: 6, rows: 6 }, viewport);

describe("layout", () => {
  it("fits the board and its frame inside the viewport", () => {
    expect(layout.bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(layout.bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(layout.bounds.x).toBeGreaterThanOrEqual(0);
    expect(layout.cell).toBeGreaterThan(0);
  });

  it("centres a square board on a tall screen", () => {
    expect(layout.bounds.x + layout.bounds.width / 2).toBeCloseTo(viewport.width / 2);
    expect(layout.bounds.y + layout.bounds.height / 2).toBeCloseTo(viewport.height / 2);
  });

  it("scales from the cell, so the frame sits outside the grid with a gap", () => {
    const grid = cellRect(layout, { col: 0, row: 0 });
    const block = blockRect(layout, {
      id: "b",
      side: "top",
      start: 0,
      span: 1,
      layers: ["v"],
    });

    expect(block.y + block.height).toBeLessThan(grid.y);
    expect(grid.y - (block.y + block.height)).toBeCloseTo(layout.gap);
    expect(block.height).toBeCloseTo(layout.frame);
  });

  it("gives a wide block one slab across its lanes", () => {
    const wide = blockRect(layout, {
      id: "w",
      side: "bottom",
      start: 1,
      span: 3,
      layers: ["v"],
    });
    expect(wide.width).toBeCloseTo(layout.cell * 3);
    expect(wide.x).toBeCloseTo(cellRect(layout, { col: 1, row: 0 }).x);
  });

  it("places left and right blocks on their rows", () => {
    const left = blockRect(layout, {
      id: "l",
      side: "left",
      start: 2,
      span: 1,
      layers: ["v"],
    });
    const right = blockRect(layout, {
      id: "r",
      side: "right",
      start: 2,
      span: 1,
      layers: ["v"],
    });

    expect(left.y).toBeCloseTo(cellRect(layout, { col: 0, row: 2 }).y);
    expect(left.x + left.width + layout.gap).toBeCloseTo(layout.origin.x);
    expect(right.x).toBeGreaterThan(left.x);
    expect(right.height).toBeCloseTo(layout.cell);
  });

  it("maps a point back to the cell it sits in", () => {
    for (const cell of [
      { col: 0, row: 0 },
      { col: 3, row: 5 },
      { col: 5, row: 5 },
    ]) {
      expect(cellAt(layout, cellCentre(layout, cell))).toEqual(cell);
    }
  });

  it("reports no cell outside the grid", () => {
    expect(cellAt(layout, { x: 0, y: 0 })).toBeNull();
    expect(cellAt(layout, { x: 1e6, y: 1e6 })).toBeNull();
  });

  it("puts a lane's exit point in the gap, centred on the lane", () => {
    const exit = laneExitPoint(layout, "top", 2);
    expect(exit.x).toBeCloseTo(cellCentre(layout, { col: 2, row: 0 }).x);
    expect(exit.y).toBeCloseTo(layout.origin.y - layout.gap);
  });
});

describe("camera", () => {
  it("starts fitted", () => {
    expect(isFitted(fitCamera())).toBe(true);
  });

  it("round-trips a point through the transform", () => {
    const camera = { scale: 2.5, offset: { x: -40, y: 17 } };
    const point = { x: 123, y: 45 };
    expect(screenToBoard(camera, boardToScreen(camera, point))).toEqual(point);
  });

  it("keeps the anchored point still while zooming", () => {
    const anchor = { x: 180, y: 300 };
    const zoomed = zoomAt(fitCamera(), anchor, 2.5);

    expect(zoomed.scale).toBe(2.5);
    expect(boardToScreen(zoomed, screenToBoard(fitCamera(), anchor))).toEqual(anchor);
  });

  it("clamps the scale to 1x-3x", () => {
    expect(zoomAt(fitCamera(), { x: 0, y: 0 }, 0.2).scale).toBe(1);
    expect(zoomAt(fitCamera(), { x: 0, y: 0 }, 99).scale).toBe(MAX_SCALE);
  });

  it("centres a board smaller than the viewport, whatever the pan", () => {
    const panned = panBy(fitCamera(), { x: 500, y: -900 });
    const clamped = clampCamera(panned, layout.bounds, viewport);

    const screen = boardToScreen(clamped, layout.bounds);
    expect(screen.x + (layout.bounds.width * clamped.scale) / 2).toBeCloseTo(
      viewport.width / 2,
    );
  });

  it("never lets a zoomed board be pushed off screen", () => {
    const zoomed = zoomAt(fitCamera(), { x: 180, y: 360 }, 3);
    const clamped = clampCamera(
      panBy(zoomed, { x: 10_000, y: 10_000 }),
      layout.bounds,
      viewport,
    );

    const screen = boardToScreen(clamped, layout.bounds);
    expect(screen.x).toBeLessThanOrEqual(0.001);
    expect(screen.x + layout.bounds.width * clamped.scale).toBeGreaterThanOrEqual(
      viewport.width - 0.001,
    );
  });

  it("toggles between fit and 2x on a double tap", () => {
    const anchor = { x: 120, y: 400 };
    const zoomed = toggleZoom(fitCamera(), anchor, layout, viewport);

    expect(zoomed.scale).toBe(2);
    expect(isFitted(toggleZoom(zoomed, anchor, layout, viewport))).toBe(true);
  });
});

describe("palette", () => {
  // ART.md 2.3. The ink outline is what carries legibility — yellow cannot
  // reach a useful ratio against a light board and stay Okabe-Ito — so the
  // outline is held high against the board, and every fill is held clear of
  // the outline so the shape never swallows the colour.
  it("keeps the ink outline far clear of the board", () => {
    expect(contrastRatio(THEME.ink, THEME.board)).toBeGreaterThanOrEqual(7);
  });

  it("keeps every fill clear of the ink it is outlined with", () => {
    for (const entry of Object.values(PALETTE)) {
      expect(
        contrastRatio(entry.fill, THEME.ink),
        `${entry.name} against the ink`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives every colour its own glyph", () => {
    const glyphs = Object.values(PALETTE).map((entry) => entry.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
