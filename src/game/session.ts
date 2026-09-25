import { fire, grantContinue, markOutOfTime, markStuck } from "@/engine/fire";
import { cellKey, createState } from "@/engine/level";
import { blockersOf, clearRay, isBlocked } from "@/engine/rays";
import { starsFor } from "@/engine/stars";
import type { Arrow, GameState, LevelDef, Special } from "@/engine/types";
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
import type { SoundEvent } from "@/audio/script";
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
  /** Shots fired this attempt, for the analytics schema (TELEMETRY.md 2.3). */
  shotsFired: number;
  /** The highest multiplier this attempt reached, which a league would rank. */
  maxMultiplier: number;
  /** Milliseconds since the attempt began, on every level type. */
  elapsedMs: number;
}

export interface SessionOptions {
  canvas: HTMLCanvasElement;
  level: LevelDef;
  onChange: (view: SessionView) => void;
  /**
   * What the shot sounded like (`AUDIO.md` 1). The session knows what
   * happened and when; it deliberately does not know how to make a noise, so
   * the cue set stays in `src/audio` and this stays testable without one.
   */
  onSound?: (event: SoundEvent) => void;
  reducedMotion?: boolean;
  /** Larger glyphs in full ink (ART.md 2.2). */
  colourBlindMode?: boolean;
  /** Runs the stuck check off the main thread; omitted in tests. */
  checkStuck?: (state: GameState) => Promise<boolean>;
  /**
   * Every mistake, as it happens. The session does not know what a wrong
   * colour means beyond a lost heart — the app counts them, because the one
   * thing it can do about them (point at colour-blind mode) outlives the
   * attempt (DESIGN.md 6).
   */
  onMistake?: (event: "blocked" | "bounced") => void;
  /**
   * Runs the hint search off the main thread; omitted in tests. It answers
   * with the arrow to fire next, or null when the search found nothing
   * inside its budget — which is not an error, and costs the player nothing
   * (`ADS.md` 1.4).
   */
  findHint?: (state: GameState) => Promise<string | null>;
  /** A chain a mistake ended, worth this much when it did (PROGRESSION.md 1). */
  onComboBreak?: (multiplierAtBreak: number) => void;
  /** A special arrow was fired, and where the board got it from. */
  onSpecialUsed?: (kind: Special, source: "designed" | "combo") => void;
}

const PULSE_MS = 420;

/**
 * A hint is held much longer than a blocker pulse. The blocker answers a tap
 * the player just made and they are already looking at it; a hint answers a
 * question they asked seconds ago, and it may be anywhere on a board they
 * are still reading.
 */
const HINT_PULSE_MS = 1_600;

/**
 * The hint beats rather than fading once. One slow decay on a board the
 * player is still scanning can be over before they look at the right half of
 * it; four short beats keep saying it. Reduced motion gets the single decay
 * instead, which still points at the arrow (ART.md 7).
 */
const HINT_BEAT_MS = 400;

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
  #onSound: ((event: SoundEvent) => void) | undefined;
  #onMistake: ((event: "blocked" | "bounced") => void) | undefined;
  #reducedMotion: boolean;
  #colourBlindMode: boolean;
  #checkStuck: ((state: GameState) => Promise<boolean>) | undefined;
  #findHint: ((state: GameState) => Promise<string | null>) | undefined;
  #onComboBreak: ((multiplierAtBreak: number) => void) | undefined;
  #onSpecialUsed: ((kind: Special, source: "designed" | "combo") => void) | undefined;

  #state: GameState;
  #score: ScoreState = createScore();
  /** Counters the session keeps only because the schema asks for them. */
  #shotsFired = 0;
  #maxMultiplier = 1;
  #attemptStartedAt = performance.now();
  #layout: Layout;
  #camera: Camera = fitCamera();
  #gestures = createGestureState();

  /**
   * Every shot still playing, oldest first. A tap is answered at once rather
   * than queued behind the shot before it (DESIGN.md 5), so a player who taps
   * in sequences has several bodies in the air at the same time.
   */
  #animations: { plan: AnimationPlan; startedAt: number; gained: number }[] = [];
  #guide: GuideView | null = null;
  /**
   * The standing guide (ART.md 3.2): one entry per arrow whose ray is clear.
   * It is recomputed when the board changes rather than per frame — the
   * answer only moves when a shot lands.
   */
  /**
   * The guides left behind by holds (ART.md 3.2). Each belongs to the arrow
   * that was held and stays until that arrow is held again; several can be
   * up at once, because the question a hold answers — which of these two do
   * I fire first — is about more than one arrow.
   */
  #stickyGuides: GuideView[] = [];
  #pulse: {
    arrowIds: string[];
    startedAt: number;
    durationMs: number;
    /** How long one fade takes; shorter than the whole pulse means it beats. */
    beatMs: number;
  } | null = null;
  /** The arrow the combo reward upgraded, so a fired special knows its source. */
  #earnedJokerId: string | null = null;
  /**
   * The arrow that was tapped wrong. It stays red until the next arrow is
   * tapped, so the mistake is still on the board when the player looks back
   * at it rather than gone in 220 ms (ART.md 6).
   */
  #wrongArrowId: string | null = null;
  #gained = 0;
  /** A tutorial beat, or a one-off note the app asked for; both are one line. */
  #coach: Beat | { key: StringKey } | null = null;
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
    this.#onSound = options.onSound;
    this.#onMistake = options.onMistake;
    this.#reducedMotion = options.reducedMotion ?? false;
    this.#colourBlindMode = options.colourBlindMode ?? false;
    this.#checkStuck = options.checkStuck;
    this.#findHint = options.findHint;
    this.#onComboBreak = options.onComboBreak;
    this.#onSpecialUsed = options.onSpecialUsed;

    const context = options.canvas.getContext("2d");
    if (!context) throw new Error("2d context unavailable");
    this.#context = context;

    this.#state = createState(options.level);
    this.#clock = this.#freshClock();
    this.#layout = computeLayout(options.level, { width: 1, height: 1 });
    this.#teach("start");
  }

  start(): void {
    this.#attemptStartedAt = performance.now();
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
    this.#stickyGuides = [];
    this.#setState(createState(this.level));
    this.#clock = this.#freshClock();
    this.#score = createScore();
    this.#shotsFired = 0;
    this.#maxMultiplier = 1;
    this.#attemptStartedAt = performance.now();
    this.#shownBeats.clear();
    this.#coach = null;
    this.#teach("start");
    this.#animations = [];
    this.#guide = null;
    this.#pulse = null;
    this.#wrongArrowId = null;
    this.#earnedJokerId = null;
    this.#camera = fitCamera();
    this.#onResize();
    this.#publish();
  }

  /** After a rewarded ad: +1 heart, or +30 seconds on a timed level. */
  continueAfterAd(): void {
    if (this.#state.status !== "lost") return;
    this.#setState(grantContinue(this.#state));
    if (this.#clock) this.#clock = grantTime(this.#clock);
    this.#publish();
  }

  /**
   * The search half of the hint (`PROGRESSION.md` 4): the first move of an
   * optimal solution from the board as it stands. It shows nothing, because
   * the answer has to exist *before* the player is charged for it — no ad is
   * played for a hint the solver could not find (`ADS.md` 1.4).
   *
   * Answers null for every reason there is no move to sell: no solver, a
   * finished level, or a search that ran out of budget.
   */
  async findHint(): Promise<string | null> {
    if (!this.#findHint || this.#state.status !== "playing") return null;
    return this.#findHint(this.#state);
  }

  /**
   * The reward half: the arrow is pulsed and nothing else happens to it. A
   * hint costs no heart, does not break the combo and does not touch the
   * stars — a valve that also punished would go unused.
   *
   * False means the board moved on while the hint was being paid for, so
   * the move no longer exists and nothing was delivered.
   */
  revealHint(arrowId: string): boolean {
    if (this.#state.status !== "playing") return false;
    if (!this.#state.arrows.some((arrow) => arrow.id === arrowId)) return false;

    this.#pulse = {
      arrowIds: [arrowId],
      startedAt: performance.now(),
      durationMs: HINT_PULSE_MS,
      beatMs: this.#reducedMotion ? HINT_PULSE_MS : HINT_BEAT_MS,
    };
    this.#publish();
    return true;
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

  /**
   * Shows a line the app raised rather than the tutorial. It waits for a
   * quiet moment: a beat is a rule the board is teaching right now and always
   * wins, and nothing is ever written over a finished level.
   */
  note(key: StringKey): boolean {
    if (this.#coach !== null || this.#state.status !== "playing") return false;
    this.#coach = { key };
    this.#syncClock(performance.now());
    this.#publish();
    return true;
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
      busy: this.#animations.length > 0,
      coach: this.#coach?.key ?? null,
      shotsFired: this.#shotsFired,
      maxMultiplier: this.#maxMultiplier,
      elapsedMs: performance.now() - this.#attemptStartedAt,
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

    if (this.#animations.some((one) => now - one.startedAt >= one.plan.totalMs)) {
      this.#animations = this.#animations.filter(
        (one) => now - one.startedAt < one.plan.totalMs,
      );
      this.#afterAnimation();
    }
    if (this.#pulse && now - this.#pulse.startedAt >= this.#pulse.durationMs) {
      this.#pulse = null;
    }

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
      this.#setState(markOutOfTime(this.#state));
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
      // The arrow under the finger is drawn last, over the lines it may
      // already be one of, so a held arrow never draws its ray twice.
      guides: [
        ...this.#stickyGuides.filter((guide) => guide.arrowId !== this.#guide?.arrowId),
        ...(this.#guide ? [this.#guide] : []),
      ],
      pulse: this.#pulse
        ? {
            arrowIds: this.#pulse.arrowIds,
            t: ((now - this.#pulse.startedAt) % this.#pulse.beatMs) / this.#pulse.beatMs,
          }
        : null,
      animations: this.#animations.map((animation) => ({
        plan: animation.plan,
        elapsed: now - animation.startedAt,
        gained: animation.gained,
      })),
      showGrid: this.#showGrid,
      colourBlindMode: this.#colourBlindMode,
      wrongArrowId: this.#wrongArrowId,
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
        if (!arrow) break;
        // `AUDIO.md` 1 puts the select click on touch-down. It fires here
        // instead, the moment the touch is ruled a tap: a click on every
        // touch-down would also sound for a pan, and a pan can never become a
        // fire (`ART.md` 4.1). It is still ahead of the outcome.
        this.#onSound?.({ kind: "select" });
        this.#fire(arrow.id, now);
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
        // The hold leaves its line behind: holding an arrow adds it, holding
        // it again takes it away, and holding the empty board clears every
        // line at once (ART.md 3.2).
        if (!arrow) this.#stickyGuides = [];
        else if (this.#stickyGuides.some((guide) => guide.arrowId === arrow.id)) {
          this.#stickyGuides = this.#stickyGuides.filter(
            (guide) => guide.arrowId !== arrow.id,
          );
        } else {
          this.#stickyGuides = [...this.#stickyGuides, this.#guideFor(arrow)];
        }
        break;
      }
      case "holdEnd":
        this.#guide = null;
        break;
    }
  }

  /**
   * The one place the board is replaced. Everything derived from it — today
   * the standing guide — is refreshed here, so a new rule cannot forget to.
   */
  #setState(next: GameState): void {
    this.#state = next;
    this.#refreshStickyGuides();
  }

  /**
   * A line a hold left behind answers for the board it was asked about, so
   * each is redrawn when the board changes and dropped when its arrow goes.
   */
  #refreshStickyGuides(): void {
    if (this.#stickyGuides.length === 0) return;

    this.#stickyGuides = this.#stickyGuides.flatMap((guide) => {
      const arrow = this.#state.arrows.find(
        (candidate) => candidate.id === guide.arrowId,
      );
      return arrow ? [this.#guideFor(arrow)] : [];
    });
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

    const arrow = this.#state.arrows.find((candidate) => candidate.id === arrowId);
    if (!arrow) return;

    const blockers = blockersOf(this.#state, arrow);
    const target = blockForArrow(this.#state.blocks, arrow);
    const { state, event, peels, destroyed } = fire(this.#state, arrowId);

    // Tapping any arrow clears the last mistake, including tapping the red
    // one again: the state marks the last wrong tap, not a disabled piece.
    this.#wrongArrowId = event === "blocked" || event === "bounced" ? arrowId : null;

    const heartsBefore = this.#state.heartsLeft;
    const multiplierBefore = this.#score.multiplier;
    const shot = registerShot(this.#score, { event, peels, destroyed }, now);
    // A tap answers the opening line, and may raise one of its own.
    this.#coach = null;
    this.#teach(event);
    // Told after the beat, never before it: a listener that answers with a
    // line of its own (`note()`) must lose to the tutorial rather than be
    // silently wiped by it a line later — on level 3 both want the same
    // bounce, and the beat is the one teaching the rule.
    if (event === "blocked" || event === "bounced") {
      this.#onMistake?.(event);
      // Only a chain worth something is a break worth reporting: every
      // mistake resets the multiplier, and most of them reset it to 1
      // (TELEMETRY.md 2.3).
      if (multiplierBefore > 1) this.#onComboBreak?.(multiplierBefore);
    }
    if (arrow.special) {
      this.#onSpecialUsed?.(
        arrow.special,
        arrow.id === this.#earnedJokerId ? "combo" : "designed",
      );
    }
    this.#score = shot.state;
    this.#shotsFired += 1;
    this.#maxMultiplier = Math.max(this.#maxMultiplier, shot.state.multiplier);
    this.#gained = shot.gained;
    this.#setState(state);

    // On a timed level a mistake costs five seconds rather than a heart;
    // `fire()` has already declined to take one (PROGRESSION.md 3).
    if (this.#clock && (event === "blocked" || event === "bounced")) {
      this.#clock = penalise(this.#clock, now);
    }

    if (shot.earnedSpecial) this.#grantEarnedJoker(now);

    if (event === "blocked") {
      // The life is spent either way, but the player learns why.
      this.#pulse = {
        arrowIds: blockers,
        startedAt: now,
        durationMs: PULSE_MS,
        beatMs: PULSE_MS,
      };
    }

    // A blocked arrow travels as far as it can and no further: up to the
    // piece that stopped it. Every other shot travels off the board.
    const travel =
      event === "blocked"
        ? clearRay(this.#state, arrow).length
        : travelCells(this.#state, arrow);

    const plan = planAnimation({
      event,
      arrow,
      block: target,
      travel,
      reducedMotion: this.#reducedMotion,
    });

    this.#onSound?.({
      kind: "shot",
      event,
      special: arrow.special ?? null,
      travel: Math.min(
        travelCells(this.#state, arrow) / (this.level.cols + this.level.rows),
        1,
      ),
      slideMs: plan.phases[0]?.kind === "slide" ? plan.phases[0].durationMs : 0,
      multiplier: shot.state.multiplier,
      heartLost: state.heartsLeft < heartsBefore,
      comboStepped: shot.steppedUp,
    });

    this.#guide = null;
    if (plan.totalMs > 0) {
      this.#animations.push({ plan, startedAt: now, gained: shot.gained });
    } else {
      this.#afterAnimation();
    }
    this.#publish();
  }

  /** The combo reward, once per attempt (PROGRESSION.md 1.4). */
  #grantEarnedJoker(now: number): void {
    const target = earnedJokerTarget(this.#state);
    if (!target) return;

    this.#state = grantEarnedJoker(this.#state, target);
    this.#earnedJokerId = target;
    // The board just changed on its own, so it says which piece changed.
    this.#pulse = {
      arrowIds: [target],
      startedAt: now,
      durationMs: PULSE_MS,
      beatMs: PULSE_MS,
    };
  }

  /** A shot has landed. The board is only settled once they all have. */
  #afterAnimation(): void {
    this.#gained = 0;
    this.#publish();
    if (this.#animations.length === 0) void this.#runStuckCheck();
  }

  async #runStuckCheck(): Promise<void> {
    if (!this.#checkStuck || this.#state.status !== "playing") return;

    const checked = this.#state;
    const solvable = await this.#checkStuck(checked);
    // The board may have moved on while the worker was thinking.
    if (solvable || this.#state !== checked) return;

    this.#setState(markStuck(this.#state));
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
