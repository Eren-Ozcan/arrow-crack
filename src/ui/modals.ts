import { NARROW_ESCAPE_MS } from "@/game/clock";
import { PALETTE } from "@/render/palette";
import { button, element } from "./hud";
import { t } from "./strings";
import type { StringKey } from "./strings";

/**
 * Result panels (DESIGN.md 3). Nothing celebratory is ever drawn over a live
 * board, so every word in the game lives here (ART.md 7).
 */
export interface WinPanel {
  kind: "win";
  stars: 0 | 1 | 2 | 3;
  score: number;
  /** One line, chosen by the caller (PROGRESSION.md 2.2). */
  commentary: StringKey;
  /** Finished with zero mistakes, which earns the badge (PROGRESSION.md 2.2). */
  perfect: boolean;
  onNext: (() => void) | null;
  onRestart: () => void;
  onHome: () => void;
}

export interface LostPanel {
  kind: "lost";
  /**
   * Watch to continue with +1 heart, board untouched. Null once the attempt
   * has spent its two continues, or wherever no rewarded ad can be shown: a
   * button that is drawn and then refuses is worse than no button
   * (`ADS.md` 1.3).
   */
  onContinue: (() => void) | null;
  /** Watch to skip the level for zero stars; null until it has been earned. */
  onSkip: (() => void) | null;
  onRestart: () => void;
  onHome: () => void;
}

/** Out of time, on a timed level: the clock is the only budget there. */
export interface OutOfTimePanel {
  kind: "outOfTime";
  onContinue: (() => void) | null;
  onSkip: (() => void) | null;
  onRestart: () => void;
  onHome: () => void;
}

/** A timed level announces its clock before it starts, exactly like one heart. */
export interface TimedPanel {
  kind: "timed";
  levelId: number;
  timeLimitMs: number;
  onStart: () => void;
}

/**
 * Returning from the background is acknowledged before the clock starts
 * again, so nobody comes back to a running clock (PROGRESSION.md 3.1).
 */
export interface ResumePanel {
  kind: "resume";
  onResume: () => void;
}

export interface StuckPanel {
  kind: "stuck";
  onRestart: () => void;
  onHome: () => void;
}

export interface OneHeartPanel {
  kind: "oneHeart";
  levelId: number;
  onStart: () => void;
}

export type Panel =
  | WinPanel
  | LostPanel
  | OutOfTimePanel
  | TimedPanel
  | ResumePanel
  | StuckPanel
  | OneHeartPanel;

/**
 * The win panel's beats, in the order of PROGRESSION.md 2.2 and on the
 * timings of ART.md 7. Each one lands before the next starts, and the buttons
 * come last so nobody taps through the celebration by accident.
 */
const CELEBRATION = {
  confettiMs: 900,
  starStepMs: 200,
  countUpMs: 600,
  commentaryFadeMs: 250,
} as const;

const STAR_COUNT = 3;

/** How long the buttons stay dead when there is no celebration to wait out. */
const TAP_GUARD_MS = 250;

export class Modals {
  readonly root: HTMLElement;

  /**
   * Reduced motion shows the finished panel at once: every word still
   * appears, because the text carries information and not just motion
   * (ART.md 7, PROGRESSION.md 2.5).
   */
  reducedMotion = false;

  #timers: ReturnType<typeof setTimeout>[] = [];
  #frame: number | null = null;

  constructor() {
    this.root = element("div", "modal-layer");
    this.root.hidden = true;
  }

  /** True while a panel owns the screen; an ad never lands on top of one. */
  get isOpen(): boolean {
    return !this.root.hidden;
  }

  close(): void {
    this.#stopPlayback();
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /** A panel that is replaced mid-celebration must not keep animating. */
  #stopPlayback(): void {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers = [];
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  #after(delayMs: number, run: () => void): void {
    if (this.reducedMotion || delayMs <= 0) {
      run();
      return;
    }
    this.#timers.push(setTimeout(run, delayMs));
  }

  show(panel: Panel): void {
    this.#stopPlayback();
    const card = element("div", "modal");
    /** Playback that may only start once the card is on screen. */
    let play: (() => void) | null = null;

    switch (panel.kind) {
      case "win": {
        play = this.#buildWin(card, panel);
        break;
      }

      case "lost": {
        // No score on the fail screen: a player who is struggling is not shown
        // a number telling them they are bad at it (PROGRESSION.md 1.5).
        const title = element("h2");
        title.textContent = t("lost.title");

        card.append(title);
        if (panel.onContinue) card.append(button(t("lost.continue"), panel.onContinue));
        if (panel.onSkip) card.append(button(t("lost.skip"), panel.onSkip));
        card.append(button(t("lost.restart"), panel.onRestart));
        card.append(button(t("win.home"), panel.onHome));
        break;
      }

      case "oneHeart": {
        // A single heart is never a surprise discovered by losing it
        // (DESIGN.md 1.5).
        const title = element("h2");
        title.textContent = t("oneHeart.title", { level: panel.levelId });

        const line = element("p", "modal-line");
        line.textContent = t("oneHeart.line");

        card.append(title, line, button(t("oneHeart.start"), panel.onStart));
        break;
      }

      case "outOfTime": {
        const title = element("h2");
        title.textContent = t("outOfTime.title");

        card.append(title);
        if (panel.onContinue) {
          card.append(button(t("outOfTime.continue"), panel.onContinue));
        }
        if (panel.onSkip) card.append(button(t("lost.skip"), panel.onSkip));
        card.append(button(t("lost.restart"), panel.onRestart));
        card.append(button(t("win.home"), panel.onHome));
        break;
      }

      case "timed": {
        // A clock must never be a surprise (PROGRESSION.md 3).
        const title = element("h2");
        title.textContent = t("timed.title", { level: panel.levelId });

        const line = element("p", "modal-line");
        const seconds = Math.round(panel.timeLimitMs / 1000);
        line.textContent = t("timed.line", { seconds });

        card.append(title, line, button(t("oneHeart.start"), panel.onStart));
        break;
      }

      case "resume": {
        const title = element("h2");
        title.textContent = t("resume.title");

        const line = element("p", "modal-line");
        line.textContent = t("resume.line");

        card.append(title, line, button(t("resume.button"), panel.onResume));
        break;
      }

      case "stuck": {
        // Being stuck is a design consequence, not a player failure: free
        // restart, no life taken, no ad (DESIGN.md 1.7).
        const title = element("h2");
        title.textContent = t("stuck.title");

        card.append(title, button(t("stuck.restart"), panel.onRestart));
        card.append(button(t("win.home"), panel.onHome));
        break;
      }
    }

    this.root.replaceChildren(card);
    this.root.hidden = false;
    play?.();
  }

  /**
   * The celebration (PROGRESSION.md 2.2): the confetti burst, then the stars
   * one at a time, then the score counting up, then the one commentary line
   * and the badge, and the buttons only once all of it has landed.
   */
  #buildWin(card: HTMLElement, panel: WinPanel): () => void {
    const title = element("h2");
    title.textContent = t("win.title");

    const stars = element("div", "stars");
    const marks = Array.from({ length: STAR_COUNT }, (_, index) => {
      const star = element("span", "star");
      const earned = index < panel.stars;
      star.textContent = earned ? "★" : "☆";
      star.classList.toggle("is-earned", earned);
      // Every star is in the layout from the first frame; only the reveal is
      // staggered, so the panel never reflows under the player's thumb.
      star.classList.toggle("is-pending", !this.reducedMotion);
      stars.append(star);
      return star;
    });

    const score = element("p", "modal-score");
    score.textContent = this.reducedMotion ? formatScore(panel.score) : formatScore(0);

    const line = element("p", "modal-line is-pending");
    line.textContent = t(panel.commentary);

    const badge = element("p", "modal-badge is-pending");
    badge.textContent = t("win.perfectBadge");
    badge.hidden = !panel.perfect;

    const buttons = element("div", "modal-buttons is-pending");
    if (panel.onNext) buttons.append(button(t("win.next"), panel.onNext));
    buttons.append(button(t("win.replay"), panel.onRestart));
    buttons.append(button(t("win.home"), panel.onHome));

    card.append(title, stars, score, line, badge, buttons);

    if (this.reducedMotion) {
      for (const node of [line, badge, buttons]) node.classList.remove("is-pending");
      // The buttons are drawn with everything else, but they stay dead for a
      // beat: with no celebration to watch, a tap already in flight would
      // otherwise land on "Next level" (PROGRESSION.md 2.2). Nothing moves
      // here — it is an input guard, not an animation.
      buttons.classList.add("is-locked");
      this.#timers.push(
        setTimeout(() => buttons.classList.remove("is-locked"), TAP_GUARD_MS),
      );
      return () => {};
    }

    return () => this.#play(marks, score, line, badge, buttons, panel.score);
  }

  #play(
    marks: HTMLElement[],
    score: HTMLElement,
    line: HTMLElement,
    badge: HTMLElement,
    buttons: HTMLElement,
    target: number,
  ): void {
    this.#confetti();

    marks.forEach((mark, index) => {
      this.#after(index * CELEBRATION.starStepMs, () => {
        mark.classList.remove("is-pending");
      });
    });

    const countUpAt = STAR_COUNT * CELEBRATION.starStepMs;
    this.#after(countUpAt, () => this.#countUp(score, target));

    const lineAt = countUpAt + CELEBRATION.countUpMs;
    this.#after(lineAt, () => {
      line.classList.remove("is-pending");
      badge.classList.remove("is-pending");
    });
    this.#after(lineAt + CELEBRATION.commentaryFadeMs, () => {
      buttons.classList.remove("is-pending");
    });
  }

  /** The score counts up rather than appearing (PROGRESSION.md 2.2). */
  #countUp(node: HTMLElement, target: number): void {
    const startedAt = performance.now();

    const step = (now: number): void => {
      const t = Math.min(1, (now - startedAt) / CELEBRATION.countUpMs);
      // Easing out, so the number slows into its final value instead of
      // stopping dead on it.
      const eased = 1 - (1 - t) ** 3;
      node.textContent = formatScore(Math.round(target * eased));
      this.#frame = t < 1 ? requestAnimationFrame(step) : null;
    };

    this.#frame = requestAnimationFrame(step);
  }

  /**
   * One short burst, behind the card and never over a live board (ART.md 7).
   * The pieces carry the palette, so the celebration is made of the same
   * colours the level was played in.
   */
  #confetti(): void {
    const layer = element("div", "confetti");
    const colours = Object.values(PALETTE);

    for (let index = 0; index < CONFETTI_COUNT; index += 1) {
      const piece = element("span", "confetti-piece");
      piece.style.left = `${(index / CONFETTI_COUNT) * 100}%`;
      piece.style.backgroundColor = colours[index % colours.length]!.fill;
      piece.style.animationDelay = `${(index % 5) * 40}ms`;
      layer.append(piece);
    }

    this.root.append(layer);
    this.#after(CELEBRATION.confettiMs, () => layer.remove());
  }
}

const CONFETTI_COUNT = 20;

function formatScore(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * The single commentary line on the win panel (PROGRESSION.md 2.2). One line,
 * chosen by what actually happened, never stacked.
 */
export function commentaryFor(input: {
  mistakes: number;
  heartsLeft: number;
  personalBest: boolean;
  /** Timed levels only: what was left on the clock (PROGRESSION.md 3). */
  remainingMs?: number | null;
}): StringKey {
  if (input.mistakes === 0) return "win.perfect";
  if (input.personalBest) return "win.personalBest";
  // Winning on the last heart and winning on the last seconds are the same
  // beat, so they say the same thing (PROGRESSION.md 2.3).
  const remaining = input.remainingMs ?? null;
  if (remaining !== null && remaining < NARROW_ESCAPE_MS) return "win.close";
  if (remaining === null && input.heartsLeft === 1) return "win.close";
  return "win.cleared";
}
