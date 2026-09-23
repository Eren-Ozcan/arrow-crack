import type { Color } from "@/engine/types";

/**
 * The colour system (ART.md 2). Built on the Okabe-Ito colourblind-safe set,
 * and every colour owns a glyph that is drawn on every surface carrying it —
 * matching is possible on shape alone, with no toggle to find.
 */
export type Glyph = "triangle" | "circle" | "square" | "diamond" | "cross";

export interface PaletteEntry {
  key: Color;
  name: string;
  fill: string;
  glyph: Glyph;
}

export const PALETTE: Record<Color, PaletteEntry> = {
  v: { key: "v", name: "orange", fill: "#E69F00", glyph: "triangle" },
  b: { key: "b", name: "blue", fill: "#0072B2", glyph: "circle" },
  g: { key: "g", name: "green", fill: "#009E73", glyph: "square" },
  y: { key: "y", name: "yellow", fill: "#F0E442", glyph: "diamond" },
  p: { key: "p", name: "purple", fill: "#CC79A7", glyph: "cross" },
};

export const THEME = {
  board: "#F4EFE6",
  ink: "#1F1B16",
  disabledInk: "#8A837A",
  /**
   * One red carries every damage signal: the hearts, and an arrow that was
   * tapped wrong (ART.md 6). It is never an arrow colour, so red on the board
   * only ever means "this cost you" — there is nothing else to learn.
   */
  heart: "#E63946",
  wrong: "#E63946",
  /** Behind the board, and the colour the native window is painted with. */
  backdrop: "#12131A",
} as const;

export function paletteEntry(color: Color): PaletteEntry {
  const entry = PALETTE[color];
  if (!entry) throw new Error(`no palette entry for colour ${color}`);
  return entry;
}

export function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const at = (index: 0 | 1 | 2): number =>
    Math.round(a[index] + (b[index] - a[index]) * amount);
  return `#${[at(0), at(1), at(2)].map(toHexPair).join("")}`;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  if (value.length !== 6) throw new Error(`unsupported colour ${hex}`);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function toHexPair(channel: number): string {
  return Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0");
}

/** Relative luminance, for the contrast checks in ART.md 2.3. */
export function luminance(hex: string): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The ink a glyph is printed in on a given fill (ART.md 2.2). Dark ink is the
 * default — it matches the outline the whole board is drawn with — but on the
 * darkest fill in the set, blue, a dark mark on a dark knob is no mark at
 * all: the grayscale pass of ART.md 10.1 read blue and green as the same
 * unmarked knob. So the ink is whichever of the two carries further, which
 * keeps every glyph at or above the 4.5 the shape redundancy is supposed to
 * be worth.
 */
export function glyphInk(fill: string): string {
  return contrastRatio(THEME.board, fill) > contrastRatio(THEME.ink, fill)
    ? THEME.board
    : THEME.ink;
}
