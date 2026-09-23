import { fire, grantContinue, markOutOfTime, markStuck } from "@/engine/fire";
import { cellKey, createState } from "@/engine/level";
import { blockersOf, clearRay, isBlocked } from "@/engine/rays";
import { starsFor } from "@/engine/stars";
import type { Arrow, GameState, LevelDef } from "@/engine/types";
import {
  createGestureState,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  tick,
} from "@/input/gestures";
import type { Gesture } from "@/input/gestures";
import type { AnimationPlan } from "@/render/animation";
import { planAnimation } from "@/render/animation";
import type { Camera } from "@/render/camera";
import {
  clampCamera,
  fitCamera,
  isFitted,
  panBy,
  screenToBoard,
  toggleZoom,
  zoomAt,
} from "@/render/camera";
import type { GuideView } from "@/render/board-renderer";
import { renderBoard, travelCells } from "@/render/board-renderer";
import { cellAt, computeLayout } from "@/render/layout";
import type { Layout } from "@/render/layout";
import { blockForArrow, neighbourBlocks } from "@/engine/level";
import {
  advance,
  createClock,
  grantTime,
  isExpired,
  pause,
  penalise,
  resume,
  timeBonus,
} from "./clock";
import type { ClockState } from "./clock";
import { earnedJokerTarget, grantEarnedJoker } from "./earned";
import { createScore, levelScore, registerShot } from "./score";
import type { ScoreState } from "./score";
import { beatFor } from "./tutorial";
import type { Beat } from "./tutorial";
import type { StringKey } from "@/ui/strings";

export interface SessionView {
  levelId: number;
  hearts: number;
  heartsLeft: number;
  mistakes: number;
  status: GameState["status"];
  stars: 0 | 1 | 2 | 3;
  score: number;
  multiplier: number;
  /** Set for one frame after a scoring shot, for the floating score. */
  gained: number;
  /** Milliseconds left on a timed level, or null on every other type. */
  remainingMs: number | null;
  showGrid: boolean;
  fitted: boolean;
  busy: boolean;
  /** The string key of the coach mark to show right now, or null (DESIGN.md 2). */
  coach: StringKey | null;
}

export interface SessionOptions {
  canvas: HTMLCanvasElement;
  level: LevelDef;
  onChange: (view: SessionView) => void;
  reducedMotion?: boolean;
  /** Larger glyphs in full ink (ART.md 2.2). */
  highContrastGlyphs?: boolean;
  /** Runs the stuck check off the main thread; omitted in tests. */
  checkStuck?: (state: GameState) => Promise<boolean>;
}

const PULSE_MS = 420;

/**
 * Wires the engine to the canvas: input arbitration, the animation queue and
 * the input lock that goes with it, the camera, and the score. The engine
 * itself stays pure — this is the only place that knows about time.
 */
export class GameSession {
  readonly level: LevelDef;

  #canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #onChange: (view: SessionView) => void;
  #reducedMotion: boolean;
  #highContrastGlyphs: boolean;
  #checkStuck: ((state: GameState) => Promise<boolean>) | undefined;

  #state: GameState;
  #score: ScoreState = createScore();
  #layout: Layout;
  #camera: Camera = fitCamera();
  #gestures = createGestureState();

  #animation: { plan: AnimationPlan; startedAt: number } | null = null;
  #queuedTap: string | null = null;
  #guide: GuideView | null = null;
  #pulse: { arrowIds: string[]; startedAt: number } | null = null;
  /**
   * The arrow that was tapped wrong. It stays red until the next arrow is
   * tapped, so the mistake is still on the board when the player looks back
   * at it rather than gone in 220 ms (ART.md 6).
   */
  #wrongArrowId: string | null = null;
  #gained = 0;
  #coach: Beat | null = null;
  #shownBeats = new Set<string>();
  #showGrid = false;
  /** Timed levels only (PROGRESSION.md 3). */
  #clock: ClockState | null = null;
  /** Set by the UI for anything that is not play: a modal, an ad, a background. */
  #suspended = false;
  #frame = 0;
  #viewport = { width: 0, height: 0 };

  constructor(options: SessionOptions) {
    this.level = options.level;
    this.#canvas = options.canvas;
    this.#onChange = options.onChange;
    this.#reducedMotion = options.reducedMotion ?? false;
    this.#highContrastGlyphs = options.highContrastGlyphs ?? false;
    this.#checkStuck = options.checkStuck;

    const context = options.canvas.getContext("2d");
    if (!context) throw new Error("2d context unavailable");
    this.#context = context;

    this.#state = createState(options.level);
    this.#clock = this.#freshClock();
    this.#layout = computeLayout(options.level, { width: 1, height: 1 });
    this.#teach("start");
  }

  start(): void {
    this.#canvas.addEventListener("pointerdown", this.#onPointerDown);
    this.#canvas.addEventListener("pointermove", this.#onPointerMove);
    this.#canvas.addEventListener("pointerup", this.#onPointerUp);
    this.#canvas.addEventListener("pointercancel", this.#onPointerCancel);
    window.addEventListener("resize", this.#onResize);

    this.#onResize();
    this.#frame = requestAnimationFrame(this.#loop);
    this.#publish();
  }

  destroy(): void {
    cancelAnimationFrame(this.#frame);
    this.#canvas.removeEventListener("pointerdown", this.#onPointerDown);
    this.#canvas.removeEventListener("pointermove", this.#onPointerMove);
    this.#canvas.removeEventListener("pointerup", this.#onPointerUp);
    this.#canvas.removeEventListener("pointercancel", this.#onPointerCancel);
    window.removeEventListener("resize", this.#onResize);
  }

  /** Restarting is always free and instant (DESIGN.md 1.5). */
  restart(): void {
    this.#state = createState(this.level);
    this.#clock = this.#freshClock();
    this.#score = createScore();
    this.#shownBeats.clear();
    this.#coach = null;
    this.#teach("start");
    this.#animation = null;
    this.#queuedTap = null;
    this.#guide = null;
    this.#pulse = null;
    this.#wrongArrowId = null;
    this.#camera = fitCamera();
    this.#onResize();
    this.#publish();
  }

  /** After a rewarded ad: +1 heart, or +30 seconds on a timed level. */
  continueAfterAd(): void {
    if (this.#state.status !== "lost") return;
    this.#state = grantContinue(this.#state);
    if (this.#clock) this.#clock = grantTime(this.#clock);
    this.#publish();
  }

  /**
   * Everything that is not the player deciding is off the clock
   * (PROGRESSION.md 3.1): an ad, a consent form, a modal, the app being
   * backgrounded. Zooming, panning, the exit-ray guide and the arrow
   * animations are play, and stay on it.
   */
  suspend(): void {
    this.#suspended = true;
    this.#syncClock(performance.now());
    this.#publish();
  }

  resumeFromSuspend(): void {
    this.#suspended = false;
    this.#syncClock(performance.now());
    this.#publish();
  }

  #freshClock(): ClockState | null {
    if (this.level.type !== "timed" || this.level.timeLimitMs === undefined) return null;
    return createClock(this.level.timeLimitMs);
  }

  /**
   * The clock runs only while the player is actually deciding. A coach mark
   * pauses it too, so a line the game chose to show can never cost time.
   */
  #syncClock(now: number): void {
    if (!this.#clock) return;

    const shouldRun =
      !this.#suspended && this.#coach === null && this.#state.status === "playing";
    this.#clock = shouldRun ? resume(this.#clock, now) : pause(this.#clock, now);
  }

  /** The player read the line, or moved on; either way it goes. */
  dismissCoach(): void {
    if (!this.#coach) return;
    this.#coach = null;
    this.#syncClock(performance.now());
    this.#publish();
  }

  /**
   * A beat is shown once per attempt, and only where the board can answer for
   * it: on levels 1-3 the mistake it names costs nothing (DESIGN.md 2).
   */
  #teach(when: Parameters<typeof beatFor>[1]): void {
    const beat = beatFor(this.level.id, when);
    if (!beat || this.#shownBeats.has(beat.when)) return;
    this.#shownBeats.add(beat.when);
    this.#coach = beat;
  }

  toggleGrid(): void {
    this.#showGrid = !this.#showGrid;
    this.#publish();
  }

  fit(): void {
    this.#camera = fitCamera();
    this.#publish();
  }

  get state(): GameState {
    return this.#state;
  }

  get finalScore(): number {
    const bonus = this.#clock ? timeBonus(this.#clock) : 0;
    return levelScore(this.#score, this.#state.mistakes, bonus);
  }

  /** Milliseconds left on a timed level, or null on every other type. */
  get remainingMs(): number | null {
    return this.#clock?.remainingMs ?? null;
  }

  #publish(): void {
    this.#onChange({
      levelId: this.level.id,
      hearts: this.level.hearts,
      heartsLeft: this.#state.heartsLeft,
      mistakes: this.#state.mistakes,
      status: this.#state.status,
      stars: starsFor(this.#state),
      score: this.#score.score,
      multiplier: this.#score.multiplier,
      gained: this.#gained,
      remainingMs: this.#clock?.remainingMs ?? null,
      showGrid: this.#showGrid,
      fitted: isFitted(this.#camera),
      busy: this.#animation !== null,
      coach: this.#coach?.key ?? null,
    });
  }

  #onResize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = this.#canvas.clientWidth;
    const height = this.#canvas.clientHeight;

    this.#canvas.width = Math.round(width * dpr);
    this.#canvas.height = Math.round(height * dpr);
    this.#context.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.#viewport = { width, height };
    this.#layout = computeLayout(this.level, this.#viewport);
    this.#camera = clampCamera(this.#camera, this.#layout.bounds, this.#viewport);
  };

  #loop = (now: number): void => {
    this.#frame = requestAnimationFrame(this.#loop);

    for (const gesture of tick(this.#gestures, now)) this.#handle(gesture, now);

    if (
      this.#animation &&
      now - this.#animation.startedAt >= this.#animation.plan.totalMs
    ) {
      this.#animation = null;
      this.#afterAnimation();
    }
    if (this.#pulse && now - this.#pulse.startedAt >= PULSE_MS) this.#pulse = null;

    this.#tickClock(now);
    this.#draw(now);
  };

  /** The clock, and the one failure it can cause (PROGRESSION.md 3). */
  #tickClock(now: number): void {
    if (!this.#clock) return;

    this.#syncClock(now);
    const before = Math.ceil(this.#clock.remainingMs / 1000);
    this.#clock = advance(this.#clock, now);

    if (isExpired(this.#clock) && this.#state.status === "playing") {
      this.#state = markOutOfTime(this.#state);
      this.#syncClock(now);
      this.#publish();
      return;
    }

    // The HUD is DOM, so it only changes when the session publishes: without
    // this the clock would sit still between taps while the time ran out
    // underneath it.
    if (Math.ceil(this.#clock.remainingMs / 1000) !== before) this.#publish();
  }

  #draw(now: number): void {
    renderBoard(this.#context, {
      state: this.#state,
      layout: this.#layout,
      camera: this.#camera,
      viewport: this.#viewport,
      guide: this.#guide,
      pulse: this.#pulse
        ? {
            arrowIds: this.#pulse.arrowIds,
            t: (now - this.#pulse.startedAt) / PULSE_MS,
          }
        : null,
      animation: this.#animation
        ? { plan: this.#animation.plan, elapsed: now - this.#animation.startedAt }
        : null,
      showGrid: this.#showGrid,
      highContrastGlyphs: this.#highContrastGlyphs,
      wrongArrowId: this.#wrongArrowId,
      gained: this.#gained,
      ...(this.#reducedMotion ? {} : { now }),
    });
  }

  #arrowAt(screen: { x: number; y: number }): Arrow | null {
    const board = screenToBoard(this.#camera, screen);
    const cell = cellAt(this.#layout, board);
    if (!cell) return null;

    // The tap target is the whole path, every cell of it (ART.md 3).
    const arrowId = this.#state.occupancy.get(cellKey(cell));
    return this.#state.arrows.find((arrow) => arrow.id === arrowId) ?? null;
  }

  #handle(gesture: Gesture, now: number): void {
    switch (gesture.type) {
      case "tap": {
        const arrow = this.#arrowAt(gesture.point);
        if (arrow) this.#fire(arrow.id, now);
        break;
      }
      case "doubleTap": {
        // Zoom only where there is no arrow: a tap on an arrow has already
        // fired it, and a double tap must never become a second shot.
        if (this.#arrowAt(gesture.point)) break;
        this.#camera = toggleZoom(
          this.#camera,
          gesture.point,
          this.#layout,
          this.#viewport,
        );
        this.#publish();
        break;
      }
      case "pan":
        this.#camera = clampCamera(
          panBy(this.#camera, gesture.delta),
          this.#layout.bounds,
          this.#viewport,
        );
        this.#publish();
        break;
      case "pinch":
        this.#camera = clampCamera(
          zoomAt(this.#camera, gesture.centre, this.#camera.scale * gesture.scale),
          this.#layout.bounds,
          this.#viewport,
        );
        this.#publish();
        break;
      case "holdStart": {
        const arrow = this.#arrowAt(gesture.point);
        this.#guide = arrow ? this.#guideFor(arrow) : null;
        break;
      }
      case "holdEnd":
        this.#guide = null;
        break;
    }
  }

  #guideFor(arrow: Arrow): GuideView {
    const blocked = isBlocked(this.#state, arrow);
    const target = blockForArrow(this.#state.blocks, arrow);
    const splash =
      !blocked && target && arrow.special === "bomb"
        ? neighbourBlocks(this.level, this.#state.blocks, target).map((block) => block.id)
        : [];

    return {
      arrowId: arrow.id,
      clear: clearRay(this.#state, arrow),
      blocked,
      targetBlockId: blocked ? null : (target?.id ?? null),
      splashBlockIds: splash,
    };
  }

  #fire(arrowId: string, now: number): void {
    if (this.#state.status !== "playing") return;

    // Input is locked during playback; at most one tap is queued.
    if (this.#animation) {
      this.#queuedTap = arrowId;
      return;
    }

    const arrow = this.#state.arrows.find((candidate) => candidate.id === arrowId);
    if (!arrow) return;

    const blockers = blockersOf(this.#state, arrow);
    const target = blockForArrow(this.#state.blocks, arrow);
    const { state, event, peels, destroyed } = fire(this.#state, arrowId);

    // Tapping any arrow clears the last mistake, including tapping the red
    // one again: the state marks the last wrong tap, not a disabled piece.
    this.#wrongArrowId = event === "blocked" || event === "bounced" ? arrowId : null;

    const shot = registerShot(this.#score, { event, peels, destroyed }, now);
    // A tap answers the opening line, and may raise one of its own.
    this.#coach = null;
    this.#teach(event);
    this.#score = shot.state;
    this.#gained = shot.gained;
    this.#state = state;

    // On a timed level a mistake costs five seconds rather than a heart;
    // `fire()` has already declined to take one (PROGRESSION.md 3).
    if (this.#clock && (event === "blocked" || event === "bounced")) {
      this.#clock = penalise(this.#clock, now);
    }

    if (shot.earnedSpecial) this.#grantEarnedJoker(now);

    if (event === "blocked") {
      // The life is spent either way, but the player learns why.
      this.#pulse = { arrowIds: blockers, startedAt: now };
    }

    const plan = planAnimation({
      event,
      arrow,
      block: target,
      travel: travelCells(this.#state, arrow),
      reducedMotion: this.#reducedMotion,
    });

    this.#guide = null;
    this.#animation = plan.totalMs > 0 ? { plan, startedAt: now } : null;
    if (!this.#animation) this.#afterAnimation();
    this.#publish();
  }

  /** The combo reward, once per attempt (PROGRESSION.md 1.4). */
  #grantEarnedJoker(now: number): void {
    const target = earnedJokerTarget(this.#state);
    if (!target) return;

    this.#state = grantEarnedJoker(this.#state, target);
    // The board just changed on its own, so it says which piece changed.
    this.#pulse = { arrowIds: [target], startedAt: now };
  }

  #afterAnimation(): void {
    this.#gained = 0;

    const queued = this.#queuedTap;
    this.#queuedTap = null;

    if (queued && this.#state.status === "playing") {
      this.#fire(queued, performance.now());
      return;
    }

    this.#publish();
    void this.#runStuckCheck();
  }

  async #runStuckCheck(): Promise<void> {
    if (!this.#checkStuck || this.#state.status !== "playing") return;

    const checked = this.#state;
    const solvable = await this.#checkStuck(checked);
    // The board may have moved on while the worker was thinking.
    if (solvable || this.#state !== checked) return;

    this.#state = markStuck(this.#state);
    this.#publish();
  }

  #onPointerDown = (event: PointerEvent): void => {
    this.#canvas.setPointerCapture(event.pointerId);
    for (const gesture of pointerDown(this.#gestures, this.#pointer(event))) {
      this.#handle(gesture, event.timeStamp);
    }
  };

  #onPointerMove = (event: PointerEvent): void => {
    for (const gesture of pointerMove(this.#gestures, this.#pointer(event))) {
      this.#handle(gesture, event.timeStamp);
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    for (const gesture of pointerUp(this.#gestures, this.#pointer(event))) {
      this.#handle(gesture, event.timeStamp);
    }
  };

  #onPointerCancel = (event: PointerEvent): void => {
    for (const gesture of pointerCancel(this.#gestures, event.pointerId)) {
      this.#handle(gesture, event.timeStamp);
    }
  };

  #pointer(event: PointerEvent): {
    id: number;
    point: { x: number; y: number };
    time: number;
  } {
    const rect = this.#canvas.getBoundingClientRect();
    return {
      id: event.pointerId,
      point: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      time: event.timeStamp,
    };
  }
}
