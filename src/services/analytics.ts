/**
 * The analytics facade (`TELEMETRY.md` 2). Firebase on a device, nothing in
 * the browser, and a typed event list either way — the schema in 2.3 is the
 * contract the retuning loop in section 3 reads, so it is spelled out here
 * rather than left to call sites passing free-form objects.
 *
 * Three rules the rest of the game relies on: every send is fire-and-forget
 * and nothing awaits one; nothing is sent before consent resolves (`ADS.md`
 * 2.4); and nothing that identifies a person is ever a parameter.
 */

export type LevelBand = "1-30" | "31-49" | "50+";

/** `TELEMETRY.md` 2.3: every event that can carry a level, carries a band. */
export function levelBand(levelId: number): LevelBand {
  if (levelId <= 30) return "1-30";
  if (levelId <= 49) return "31-49";
  return "50+";
}

export type AnalyticsEvent =
  | {
      name: "level_start";
      level_id: number;
      level_type: string;
      hearts: number;
      attempt_no: number;
    }
  | {
      name: "level_win";
      level_id: number;
      level_type: string;
      mistakes: number;
      stars: number;
      score: number;
      max_multiplier: number;
      shots_fired: number;
      duration_ms: number;
      continues_used: number;
    }
  | {
      name: "level_fail";
      level_id: number;
      level_type: string;
      mistakes: number;
      shots_fired: number;
      duration_ms: number;
      blocks_left: number;
      layers_left: number;
    }
  | {
      name: "level_stuck";
      level_id: number;
      shots_fired: number;
      cause: "flew_off" | "other";
    }
  | { name: "level_quit"; level_id: number; shots_fired: number; mistakes: number }
  | {
      name: "mistake";
      level_id: number;
      kind: "blocked_tap" | "color_mismatch";
      shots_fired: number;
      hearts_left: number;
    }
  | {
      name: "hint_used";
      level_id: number;
      shots_fired: number;
      source: "balance" | "ad" | "iap";
    }
  | {
      name: "special_used";
      level_id: number;
      kind: "joker" | "ghost" | "bomb";
      source: "designed" | "combo";
    }
  | { name: "combo_break"; level_id: number; multiplier_at_break: number }
  | { name: "continue_offered"; level_id: number; continue_no: number }
  | { name: "continue_taken"; level_id: number; continue_no: number }
  | { name: "skip_used"; level_id: number; fails_before: number }
  | { name: "ad_shown"; format: string; placement: string; result: string }
  | { name: "purchase"; product: string; price: number; currency: string }
  | { name: "level_override_applied"; level_id: number; version: number }
  | {
      name: "level_override_rejected";
      level_id: number;
      version: number;
      reason: string;
    };

export type EventName = AnalyticsEvent["name"];

export interface AnalyticsDriver {
  setEnabled(enabled: boolean): Promise<void>;
  log(name: EventName, params: Record<string, string | number>): Promise<void>;
}

/**
 * `mistake` is the highest-volume event in the game and the most useful one
 * (`TELEMETRY.md` 2.4). Past twenty in a single attempt it has said
 * everything it can, so the rest are dropped on the device rather than paid
 * for.
 */
export const MAX_MISTAKE_EVENTS_PER_ATTEMPT = 20;

export interface AnalyticsOptions {
  driver?: AnalyticsDriver | null;
}

export class Analytics {
  #driver: AnalyticsDriver | null;
  /** Null until consent resolves; nothing is sent while it is null. */
  #enabled: boolean | null = null;
  #mistakesThisAttempt = 0;

  constructor(options: AnalyticsOptions = {}) {
    this.#driver = options.driver ?? null;
  }

  /**
   * Collection follows the same answer as ads (`TELEMETRY.md` 2.2): denied
   * or unavailable consent means analytics stays off with them.
   */
  setConsent(granted: boolean): void {
    this.#enabled = granted;
    void this.#driver?.setEnabled(granted).catch(() => undefined);
  }

  get enabled(): boolean {
    return this.#enabled === true;
  }

  startAttempt(): void {
    this.#mistakesThisAttempt = 0;
  }

  /** Fire-and-forget by construction: there is nothing here to await. */
  log(event: AnalyticsEvent): void {
    if (!this.enabled || this.#driver === null) return;

    const { name, ...rest } = event;
    if (name === "mistake") {
      if (this.#mistakesThisAttempt >= MAX_MISTAKE_EVENTS_PER_ATTEMPT) return;
      this.#mistakesThisAttempt += 1;
    }

    const params: Record<string, string | number> = { ...rest };
    if (typeof params["level_id"] === "number") {
      params["level_band"] = levelBand(params["level_id"]);
    }

    void this.#driver.log(name, params).catch(() => undefined);
  }
}
