/**
 * The level generator (DESIGN.md 4.2) — backwards construction.
 *
 * A board is built from a solved position: arrows are placed one at a time,
 * each one pushing a layer onto the lane it will later peel. Firing them in
 * reverse placement order always solves the board, so solvability comes for
 * free; the forward solver is still run afterwards, because the reverse
 * construction only gives an upper bound on `par`.
 *
 * The one rule that makes the reverse order work: an arrow fires before
 * everything placed before it, so its exit ray has to be clear of the arrows
 * already on the grid — and may freely run under the ones placed after it.
 * That is where the tangle comes from: later bodies wrap around and pin their
 * predecessors because the construction order allows exactly that.
 *
 * Pure and deterministic like the engine: the offline CLI
 * (`tools/generate-levels.ts`) walks seeds with it, and the app rebuilds every
 * generated level from its recorded seed with the same code (DESIGN.md 4.2).
 */
import { cellKey, step } from "@/engine/level";
import type { Cell, Color, Dir, Side, Special } from "@/engine/types";
import type { RawLevel } from "@/levels/parse";

const SIDES: Side[] = ["top", "bottom", "left", "right"];

/** The direction an arrow aimed at this side faces. */
const FACING: Record<Side, Dir> = {
  top: "up",
  bottom: "down",
  left: "left",
  right: "right",
};

const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export interface GenerateOptions {
  id: number;
  seed: number;
  cols: number;
  rows: number;
  palette: Color[];
  hearts: number;
  /** Arrows that peel a layer. Decoys are added on top of this. */
  arrows: number;
  /** Arrows that fire into an already-emptied lane: free, and a trap to read. */
  decoys: number;
  /** Layers a single block may carry. */
  maxLayers: number;
  /**
   * Block positions that actually receive layers. Fewer of them means deeper
   * stacks, which is where the forced order in the difficulty model comes
   * from (DESIGN.md 4.3).
   */
  blocks: number;
  /** Share of block units that span two lanes (DESIGN.md 4.2 step 4). */
  wideRate: number;
  /** Chance a body turns rather than running straight. */
  bendRate: number;
  /**
   * How strongly a growing body is drawn onto the exit rays of the arrows
   * already placed. Those arrows fire later, so pinning them is free — and it
   * is what turns a board of independent shots into a forced order
   * (DESIGN.md 4.3).
   */
  pinRate: number;
  /** Body length in cells, head included. */
  minBody: number;
  maxBody: number;
  type?: "timed";
  /** Upgrades one placed arrow; the caller owns the introduction order. */
  special?: Special;
  /**
   * Chance an arrow aimed at a wide block keeps its exit ray clear of every
   * body placed after it. Such an arrow is free to fire from the start, but
   * its layer is not on top yet: a colour hold, the trap the frame exists for
   * (DESIGN.md 1.8). Left at zero, nearly every trap is a blocked ray and the
   * colours stop mattering.
   */
  holdRate?: number;
  /**
   * Chance a layer pushed onto a stack takes a different colour from the
   * layer under it, so two lanes feeding one block cannot both be right.
   */
  contrast?: number;
}

/** Deterministic PRNG: one seed is one board, on every machine. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A block position on the frame, before it is known whether it carries layers. */
interface Unit {
  side: Side;
  start: number;
  span: number;
  /** Layer colours in placement order; the top layer is the last one pushed. */
  stack: Color[];
}

interface Placed {
  id: string;
  color: Color;
  dir: Dir;
  path: Cell[];
  special?: Special;
}

function laneCountOn(side: Side, cols: number, rows: number): number {
  return side === "top" || side === "bottom" ? cols : rows;
}

function edgeCell(side: Side, lane: number, cols: number, rows: number): Cell {
  switch (side) {
    case "top":
      return { col: lane, row: 0 };
    case "bottom":
      return { col: lane, row: rows - 1 };
    case "left":
      return { col: 0, row: lane };
    case "right":
      return { col: cols - 1, row: lane };
  }
}

/** Ids run a, b, ... z, aa, ab, ... so a board of any size still reads. */
function arrowId(index: number): string {
  let id = "";
  let value = index;
  do {
    id = String.fromCharCode(97 + (value % 26)) + id;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return id;
}

/** Splits every side into block positions, some of them two lanes wide. */
function buildUnits(options: GenerateOptions, random: () => number): Unit[] {
  const units: Unit[] = [];

  for (const side of SIDES) {
    const lanes = laneCountOn(side, options.cols, options.rows);
    let lane = 0;
    while (lane < lanes) {
      const wide = lane + 1 < lanes && random() < options.wideRate;
      const span = wide ? 2 : 1;
      units.push({ side, start: lane, span, stack: [] });
      lane += span;
    }
  }

  return units;
}

/** Tries per arrow before the board is abandoned. */
const PLACEMENT_ATTEMPTS = 60;
/** Arrows the grid may fall short by before the seed is discarded. */
const PLACEMENT_SHORTFALL = 3;
/** Bodies compared per arrow before the most pinning one is taken. */
const BODY_CHOICES = 12;

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

/** Cells on the outer ring; a body there closes a lane for later arrows. */
function onBorder(cell: Cell, options: GenerateOptions): boolean {
  return (
    cell.col === 0 ||
    cell.row === 0 ||
    cell.col === options.cols - 1 ||
    cell.row === options.rows - 1
  );
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  return shuffled;
}

/**
 * Grows one arrow backwards from a head cell: the first step behind the head
 * is fixed by the head direction, everything after it wanders through free
 * cells at the configured bend rate.
 */
function growBody(
  head: Cell,
  dir: Dir,
  length: number,
  occupied: Set<string>,
  pins: Set<string>,
  options: GenerateOptions,
  random: () => number,
): Cell[] | null {
  const inBounds = (cell: Cell): boolean =>
    cell.col >= 0 && cell.col < options.cols && cell.row >= 0 && cell.row < options.rows;

  const body: Cell[] = [head];
  const used = new Set<string>([cellKey(head)]);
  let heading = OPPOSITE[dir];

  while (body.length < length) {
    const tail = body[body.length - 1]!;
    const straight = step(tail, heading);
    const turns: Dir[] = (["up", "down", "left", "right"] as Dir[]).filter(
      (candidate) => candidate !== heading && candidate !== OPPOSITE[heading],
    );

    const free = (cell: Cell): boolean =>
      inBounds(cell) && !occupied.has(cellKey(cell)) && !used.has(cellKey(cell));

    // The cell right behind the head is fixed: the final segment of the path
    // has to run in the head's direction, or the engine rejects the arrow.
    const mustRunStraight = body.length === 1;
    const wantsTurn = !mustRunStraight && random() < options.bendRate;
    const straightFree = free(straight);
    const turnCells = turns
      .map((turn) => ({ cell: step(tail, turn), dir: turn }))
      .filter((candidate) => free(candidate.cell));

    // A body that wanders onto the outer ring seals the lane behind it for
    // every arrow placed after this one, so the inner cells are taken first
    // wherever there is a choice.
    const inner = turnCells.filter((candidate) => !onBorder(candidate.cell, options));
    const pinning = inner.filter((candidate) => pins.has(cellKey(candidate.cell)));
    const preferred =
      pinning.length > 0 && random() < options.pinRate
        ? pinning
        : inner.length > 0
          ? inner
          : turnCells;

    let chosen: { cell: Cell; dir: Dir } | null = null;
    if (mustRunStraight) chosen = straightFree ? { cell: straight, dir: heading } : null;
    else if (!wantsTurn && straightFree && !onBorder(straight, options)) {
      chosen = { cell: straight, dir: heading };
    } else if (preferred.length > 0) chosen = pick(preferred, random);
    else if (straightFree) chosen = { cell: straight, dir: heading };

    if (!chosen) break;

    body.push(chosen.cell);
    used.add(cellKey(chosen.cell));
    heading = chosen.dir;
  }

  // A one-cell arrow is legal, but it is the frame's own edge cell doing no
  // work, so a body that could not take its first step is refused.
  if (body.length < 2 && length > 1) return null;

  // The body was grown from the head outwards; a path runs tail to head.
  return body.reverse();
}

/**
 * Head cells this lane offers, nearest the frame first: every cell whose
 * straight run out to the edge is clear of the arrows already placed.
 */
function headCandidates(
  side: Side,
  lane: number,
  occupied: Set<string>,
  options: GenerateOptions,
): Cell[] {
  const dir = FACING[side];
  const inward = OPPOSITE[dir];
  const cells: Cell[] = [];

  let cell = edgeCell(side, lane, options.cols, options.rows);
  while (
    cell.col >= 0 &&
    cell.col < options.cols &&
    cell.row >= 0 &&
    cell.row < options.rows
  ) {
    if (occupied.has(cellKey(cell))) break;
    cells.push(cell);
    cell = step(cell, inward);
  }

  return cells;
}

/**
 * One candidate board. Returns null when the grid ran out of room, which is a
 * normal outcome — the caller simply tries the next seed.
 */
export function generate(options: GenerateOptions): RawLevel | null {
  const random = mulberry32(options.seed);
  const frame = buildUnits(options, random);
  // Only some frame positions carry a block; the rest stay open lanes, which
  // are what a decoy flies out through.
  const units = shuffle(frame, random).slice(
    0,
    Math.max(1, Math.min(frame.length, options.blocks)),
  );
  const occupied = new Set<string>();
  /**
   * Cell to the arrows whose exit ray runs through it. Those arrows all fire
   * later than whatever is placed now, so a body laid across such a cell pins
   * them — that is where the forced order comes from.
   */
  const rayOwners = new Map<string, Set<string>>();
  const pins = new Set<string>();
  const placed: Placed[] = [];

  const total = options.arrows + options.decoys;
  // Decoys go in first, so they fire last — by then the lane they aim at has
  // been emptied and the shot is free, which is exactly what makes them a
  // convincing wrong answer earlier on.
  for (let index = 0; index < total; index += 1) {
    const isDecoy = index < options.decoys;

    const room = units.filter((unit) => unit.stack.length < options.maxLayers);
    if (room.length === 0) break;

    // Several attempts per arrow: as the grid fills, most lanes stop offering
    // a head whose run to the frame is clear, and a board that gives up on the
    // first refusal ends up with half the arrows it was asked for.
    let chosen: { unit: Unit; body: Cell[]; pinned: number } | null = null;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
      if (chosen && chosen.pinned > 0 && attempt >= BODY_CHOICES) break;
      // Prefer the emptiest units, so layers spread before they stack.
      const fewest = Math.min(...room.map((unit) => unit.stack.length));
      const shallow = room.filter((unit) => unit.stack.length === fewest);
      const unit = pick(attempt < PLACEMENT_ATTEMPTS / 2 ? shallow : room, random);

      for (let lane = unit.start; lane < unit.start + unit.span; lane += 1) {
        const heads = headCandidates(unit.side, lane, occupied, options);
        if (heads.length === 0) continue;

        const length =
          options.minBody +
          Math.floor(random() * (options.maxBody - options.minBody + 1));
        const body = growBody(
          pick(heads, random),
          FACING[unit.side],
          length,
          occupied,
          pins,
          options,
          random,
        );
        if (!body) continue;

        // How many of the arrows already on the grid this body would pin.
        const pinnedArrows = new Set<string>();
        for (const cell of body) {
          for (const owner of rayOwners.get(cellKey(cell)) ?? []) pinnedArrows.add(owner);
        }

        const candidate = { unit, body, pinned: pinnedArrows.size };
        if (!chosen || candidate.pinned > chosen.pinned) chosen = candidate;
      }
    }

    if (!chosen) break;

    let color = pick(options.palette, random);
    const under = chosen.unit.stack[chosen.unit.stack.length - 1];
    // Only consume randomness when the knob is on, so a spec without it
    // still rebuilds exactly the board its seed always gave.
    if (under !== undefined && options.contrast && random() < options.contrast) {
      color = pick(
        options.palette.filter((candidate) => candidate !== under),
        random,
      );
    }
    for (const cell of chosen.body) occupied.add(cellKey(cell));

    const head = chosen.body[chosen.body.length - 1]!;
    const dir = FACING[chosen.unit.side];
    const id = arrowId(placed.length);
    const hold =
      chosen.unit.span > 1 && !!options.holdRate && random() < options.holdRate;
    let ray = step(head, dir);
    while (
      ray.col >= 0 &&
      ray.col < options.cols &&
      ray.row >= 0 &&
      ray.row < options.rows
    ) {
      const key = cellKey(ray);
      // A held ray is walled off for everything placed later; an ordinary one
      // is an invitation to pin it.
      if (hold) occupied.add(key);
      else pins.add(key);
      const owners = rayOwners.get(key) ?? new Set<string>();
      owners.add(id);
      rayOwners.set(key, owners);
      ray = step(ray, dir);
    }

    placed.push({
      id,
      color,
      dir,
      path: chosen.body,
    });
    if (!isDecoy) chosen.unit.stack.push(color);
  }

  // The grid runs out of room before the count does often enough that
  // insisting on the exact target would throw away most seeds; a board a
  // couple of arrows short is still a board, and the difficulty model is what
  // decides whether it ships.
  if (placed.length < total - PLACEMENT_SHORTFALL) return null;

  const blocks = units
    .filter((unit) => unit.stack.length > 0)
    .map((unit) => ({
      id: `${unit.side[0]}${unit.start}`,
      side: unit.side,
      start: unit.start,
      span: unit.span,
      // Placement order is firing order reversed, so the last layer pushed is
      // the first one peeled: the top of the stack.
      layers: [...unit.stack].reverse(),
    }));

  if (blocks.length === 0) return null;

  if (options.special) {
    // The special goes on an arrow that peels, never on a decoy: a decoy is
    // already free, and a free special is not a puzzle piece.
    const candidates = placed.slice(options.decoys);
    if (candidates.length === 0) return null;
    pick(candidates, random).special = options.special;
  }

  const level: RawLevel = {
    id: options.id,
    cols: options.cols,
    rows: options.rows,
    palette: [...options.palette],
    hearts: options.hearts,
    par: 0,
    arrows: placed.map((arrow) => ({
      id: arrow.id,
      color: arrow.color,
      ...(arrow.special ? { special: arrow.special } : {}),
      dir: arrow.dir,
      path: arrow.path,
    })),
    blocks,
  };

  // The clock depends on `par`, which only the forward solver knows, so the
  // caller fills `timeLimitMs` in once the board has been solved.
  if (options.type === "timed") level.type = "timed";

  return level;
}
