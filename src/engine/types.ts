/** Palette key, e.g. "r" | "g" | "b" | "y" | "p" (DESIGN.md 3). */
export type Color = string;

/** Head direction: the direction of an arrow's final path segment. */
export type Dir = "up" | "down" | "left" | "right";

/** The frame side a block sits on. */
export type Side = "top" | "bottom" | "left" | "right";

/** Special arrows, each breaking exactly one rule (DESIGN.md 1.11). */
export type Special = "joker" | "ghost" | "bomb";

export interface Cell {
  col: number;
  row: number;
}

export interface Arrow {
  id: string;
  color: Color;
  special?: Special;
  dir: Dir;
  /** Tail to head, orthogonally connected, no self-crossing. Last cell is the head. */
  path: Cell[];
}

export interface Block {
  id: string;
  side: Side;
  /** First lane index covered. */
  start: number;
  /** Lanes covered; 1 is a normal block, more is a wide block. */
  span: number;
  /** Index 0 is the top, visible layer. */
  layers: Color[];
}

export interface LevelDef {
  id: number;
  cols: number;
  rows: number;
  arrows: Arrow[];
  blocks: Block[];
  /** 4 or 3 by band, or 1 on a designated level (DESIGN.md 2). */
  hearts: number;
  type?: "timed";
  /** Timed levels only; hearts are unused there. */
  timeLimitMs?: number;
  /** Shaped boards (DESIGN.md 1.10); absent means the full rectangle. */
  mask?: Cell[];
  /** Solver-verified optimum. */
  par: number;
  palette: Color[];
}

/** What a resolved tap did (DESIGN.md 3). */
export type FireEvent = "blocked" | "peeled" | "destroyed" | "bounced" | "flewOff";

export type GameStatus = "playing" | "won" | "lost" | "stuck";

/**
 * Runtime state. Arrows are only ever fully on the board or fully gone, so the
 * logical state is which arrows remain plus the block layer stacks.
 * `occupancy` is a derived index from cell key to arrow id.
 */
export interface GameState {
  readonly level: LevelDef;
  readonly arrows: readonly Arrow[];
  readonly blocks: readonly Block[];
  readonly heartsLeft: number;
  /** Total across continues; drives the stars (DESIGN.md 1.6). */
  readonly mistakes: number;
  readonly continuesUsed: number;
  readonly status: GameStatus;
  readonly occupancy: ReadonlyMap<string, string>;
}

export interface FireResult {
  state: GameState;
  event: FireEvent;
}
