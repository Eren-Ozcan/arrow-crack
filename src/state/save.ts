import { SCORE_VERSION } from "@/game/score";

/**
 * The local save (DESIGN.md 6, PROGRESSION.md 5). Everything here is small and
 * final: an attempt is never persisted (DESIGN.md 1.9), only its result.
 *
 * The module is pure — every function takes a save and returns a new one — and
 * the only thing that touches `localStorage` is `SaveStore`, so the rules are
 * testable without a DOM and a later cloud sync has one place to hook into.
 */
export const SAVE_VERSION = 1;
export const STORAGE_KEY = "arrowcrack.save";

/** What a level is worth once it has been cleared at least once. */
export interface LevelRecord {
  stars: 0 | 1 | 2 | 3;
  bestScore: number;
  /** Timed levels only: the best time left on the clock, in ms. */
  bestTimeMs: number | null;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  /**
   * Cuts every duration to the impact frame and drops the idle bob, the
   * particles and the confetti (ART.md 7). Off by default because the device
   * preference is read on top of it: the switch is there for a player whose
   * phone does not carry one, and for one who wants it in this game only.
   */
  reducedMotion: boolean;
  /**
   * Larger glyphs in full ink (ART.md 2.2). The glyphs are always on, so this
   * turns the redundancy up rather than turning it on.
   */
  highContrastGlyphs: boolean;
  /** English only in v1 (STORE.md); the field exists so a locale is content. */
  language: string;
}

export interface SaveData {
  version: number;
  /**
   * The formula the stored scores were produced by (PROGRESSION.md 5). A
   * change makes old scores incomparable, so they are dropped rather than
   * silently mixed with new ones — stars and progress survive.
   */
  scoreVersion: number;
  levels: Record<string, LevelRecord>;
  /** The hint balance, acquired in-level only (PROGRESSION.md 4.1). */
  hints: number;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  haptics: true,
  reducedMotion: false,
  highContrastGlyphs: false,
  language: "en",
};

export function createSave(): SaveData {
  return {
    version: SAVE_VERSION,
    scoreVersion: SCORE_VERSION,
    levels: {},
    hints: 0,
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Reads whatever is in storage. Anything unreadable — corrupt JSON, a save
 * from a future version, a shape that does not match — is a fresh save rather
 * than an error: losing progress is bad, refusing to start is worse.
 */
export function parseSave(raw: string | null): SaveData {
  if (raw === null) return createSave();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createSave();
  }

  if (!isRecord(parsed) || parsed["version"] !== SAVE_VERSION) return createSave();

  const save = createSave();
  save.hints = asCount(parsed["hints"]);
  save.settings = parseSettings(parsed["settings"]);

  const scoreVersion =
    typeof parsed["scoreVersion"] === "number" ? parsed["scoreVersion"] : 0;
  const keepScores = scoreVersion === SCORE_VERSION;
  save.levels = parseLevels(parsed["levels"], keepScores);

  return save;
}

export function serialiseSave(save: SaveData): string {
  return JSON.stringify(save);
}

export interface LevelResult {
  levelId: number;
  stars: 0 | 1 | 2 | 3;
  score: number;
  /** Timed levels only: what was left on the clock when it was won. */
  remainingMs?: number | null;
}

/**
 * Folds a win into the save. Only the best of each figure is kept, and a
 * first clear with three stars pays a hint — first clear only, so replaying an
 * easy level cannot farm the balance (PROGRESSION.md 4.1).
 */
export function recordWin(save: SaveData, result: LevelResult): SaveData {
  const key = String(result.levelId);
  const previous = save.levels[key];
  const remainingMs = result.remainingMs ?? null;

  const record: LevelRecord = {
    stars: previous
      ? (Math.max(previous.stars, result.stars) as 0 | 1 | 2 | 3)
      : result.stars,
    bestScore: Math.max(previous?.bestScore ?? 0, result.score),
    bestTimeMs: bestTime(previous?.bestTimeMs ?? null, remainingMs),
  };

  const earnsHint = previous === undefined && result.stars === 3;

  return {
    ...save,
    levels: { ...save.levels, [key]: record },
    hints: save.hints + (earnsHint ? 1 : 0),
  };
}

/** A timed level is better the more clock is left, so this keeps the larger. */
function bestTime(previous: number | null, next: number | null): number | null {
  if (next === null) return previous;
  if (previous === null) return next;
  return Math.max(previous, next);
}

export function addHints(save: SaveData, amount: number): SaveData {
  return { ...save, hints: Math.max(0, save.hints + amount) };
}

/** Spending with an empty balance is a no-op, not a negative balance. */
export function spendHint(save: SaveData): SaveData {
  if (save.hints <= 0) return save;
  return { ...save, hints: save.hints - 1 };
}

export function updateSettings(save: SaveData, patch: Partial<Settings>): SaveData {
  return { ...save, settings: { ...save.settings, ...patch } };
}

export function levelRecord(save: SaveData, levelId: number): LevelRecord | undefined {
  return save.levels[String(levelId)];
}

export function isCleared(save: SaveData, levelId: number): boolean {
  return levelRecord(save, levelId) !== undefined;
}

export function totalStars(save: SaveData): number {
  return Object.values(save.levels).reduce((sum, record) => sum + record.stars, 0);
}

/**
 * A level is open once the one before it in play order is cleared. Stars never
 * gate progression (DESIGN.md 1.5) — clearing does, so a player who scrapes a
 * one-star win is never stuck behind a wall they cannot see.
 */
export function isUnlocked(save: SaveData, levelId: number, order: number[]): boolean {
  const index = order.indexOf(levelId);
  if (index <= 0) return index === 0;
  return isCleared(save, order[index - 1]!);
}

/** Where the home screen opens: the first level that is open and not cleared. */
export function currentLevelId(save: SaveData, order: number[]): number | null {
  for (const id of order) {
    if (!isCleared(save, id)) return isUnlocked(save, id, order) ? id : null;
  }
  return order.length === 0 ? null : order[order.length - 1]!;
}

/** The storage API this needs; `localStorage` satisfies it, and so does a Map. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Owns the one save in memory and writes it back on every change. Storage can
 * be absent (a private-mode WebView) or full, and neither is worth crashing a
 * game over: the session keeps playing against the in-memory copy.
 */
export class SaveStore {
  #storage: SaveStorage | null;
  #save: SaveData;

  constructor(storage: SaveStorage | null = defaultStorage()) {
    this.#storage = storage;
    this.#save = parseSave(this.#read());
  }

  get save(): SaveData {
    return this.#save;
  }

  /** Applies a pure update and persists the result. */
  update(change: (save: SaveData) => SaveData): SaveData {
    this.#save = change(this.#save);
    this.#write();
    return this.#save;
  }

  /** The settings screen's delete-data button (DESIGN.md 6). */
  clear(): SaveData {
    this.#save = createSave();
    try {
      this.#storage?.removeItem(STORAGE_KEY);
    } catch {
      // Same reasoning as a failed write: nothing the player can act on.
    }
    return this.#save;
  }

  #read(): string | null {
    try {
      return this.#storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  #write(): void {
    try {
      this.#storage?.setItem(STORAGE_KEY, serialiseSave(this.#save));
    } catch {
      // Quota or a blocked store: the save is still correct in memory, and
      // the next write may well succeed.
    }
  }
}

function defaultStorage(): SaveStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function parseSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  return {
    sound: asBoolean(value["sound"], DEFAULT_SETTINGS.sound),
    music: asBoolean(value["music"], DEFAULT_SETTINGS.music),
    haptics: asBoolean(value["haptics"], DEFAULT_SETTINGS.haptics),
    // A save written before these existed simply has neither field, and an
    // absent boolean is its default — which is why they need no migration.
    reducedMotion: asBoolean(value["reducedMotion"], DEFAULT_SETTINGS.reducedMotion),
    highContrastGlyphs: asBoolean(
      value["highContrastGlyphs"],
      DEFAULT_SETTINGS.highContrastGlyphs,
    ),
    language:
      typeof value["language"] === "string"
        ? value["language"]
        : DEFAULT_SETTINGS.language,
  };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseLevels(value: unknown, keepScores: boolean): Record<string, LevelRecord> {
  if (!isRecord(value)) return {};

  const levels: Record<string, LevelRecord> = {};
  for (const [key, record] of Object.entries(value)) {
    if (!/^\d+$/.test(key) || !isRecord(record)) continue;
    const stars = asCount(record["stars"]);
    levels[key] = {
      stars: (stars > 3 ? 3 : stars) as 0 | 1 | 2 | 3,
      bestScore: keepScores ? asCount(record["bestScore"]) : 0,
      bestTimeMs:
        keepScores && typeof record["bestTimeMs"] === "number"
          ? record["bestTimeMs"]
          : null,
    };
  }
  return levels;
}
