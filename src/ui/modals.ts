import { NARROW_ESCAPE_MS } from "@/game/clock";
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
  onNext: (() => void) | null;
  onRestart: () => void;
  onHome: () => void;
}

export interface LostPanel {
  kind: "lost";
  /** Watch to continue with +1 heart, board untouched. */
  onContinue: () => void;
  onRestart: () => void;
  onHome: () => void;
}

/** Out of time, on a timed level: the clock is the only budget there. */
export interface OutOfTimePanel {
  kind: "outOfTime";
  onContinue: () => void;
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

export class Modals {
  readonly root: HTMLElement;

  constructor() {
    this.root = element("div", "modal-layer");
    this.root.hidden = true;
  }

  close(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  show(panel: Panel): void {
    const card = element("div", "modal");

    switch (panel.kind) {
      case "win": {
        const title = element("h2");
        title.textContent = t("win.title");

        const stars = element("div", "stars");
        for (let index = 0; index < 3; index += 1) {
          const star = element("span", "star");
          star.textContent = index < panel.stars ? "★" : "☆";
          stars.append(star);
        }

        const score = element("p", "modal-score");
        score.textContent = panel.score.toLocaleString("en-US");

        const line = element("p", "modal-line");
        line.textContent = t(panel.commentary);

        card.append(title, stars, score, line);
        if (panel.onNext) card.append(button(t("win.next"), panel.onNext));
        card.append(button(t("win.replay"), panel.onRestart));
        card.append(button(t("win.home"), panel.onHome));
        break;
      }

      case "lost": {
        // No score on the fail screen: a player who is struggling is not shown
        // a number telling them they are bad at it (PROGRESSION.md 1.5).
        const title = element("h2");
        title.textContent = t("lost.title");

        card.append(title);
        card.append(button(t("lost.continue"), panel.onContinue));
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
        card.append(button(t("outOfTime.continue"), panel.onContinue));
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
  }
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
