import { button, element } from "./hud";

/**
 * Result panels (DESIGN.md 3). Nothing celebratory is ever drawn over a live
 * board, so every word in the game lives here (ART.md 7).
 */
export interface WinPanel {
  kind: "win";
  stars: 0 | 1 | 2 | 3;
  score: number;
  /** One line, chosen by the caller (PROGRESSION.md 2.2). */
  commentary: string;
  onNext: (() => void) | null;
  onRestart: () => void;
}

export interface LostPanel {
  kind: "lost";
  /** Watch to continue with +1 heart, board untouched. */
  onContinue: () => void;
  onRestart: () => void;
}

export interface StuckPanel {
  kind: "stuck";
  onRestart: () => void;
}

export interface OneHeartPanel {
  kind: "oneHeart";
  levelId: number;
  onStart: () => void;
}

export type Panel = WinPanel | LostPanel | StuckPanel | OneHeartPanel;

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
        title.textContent = "Level clear";

        const stars = element("div", "stars");
        for (let index = 0; index < 3; index += 1) {
          const star = element("span", "star");
          star.textContent = index < panel.stars ? "★" : "☆";
          stars.append(star);
        }

        const score = element("p", "modal-score");
        score.textContent = panel.score.toLocaleString("en-US");

        const line = element("p", "modal-line");
        line.textContent = panel.commentary;

        card.append(title, stars, score, line);
        if (panel.onNext) card.append(button("Next level", panel.onNext));
        card.append(button("Replay", panel.onRestart));
        break;
      }

      case "lost": {
        // No score on the fail screen: a player who is struggling is not shown
        // a number telling them they are bad at it (PROGRESSION.md 1.5).
        const title = element("h2");
        title.textContent = "Out of hearts";

        card.append(title);
        card.append(button("Watch an ad for +1 heart", panel.onContinue));
        card.append(button("Restart", panel.onRestart));
        break;
      }

      case "oneHeart": {
        // A single heart is never a surprise discovered by losing it
        // (DESIGN.md 1.5).
        const title = element("h2");
        title.textContent = `Level ${panel.levelId}: one heart`;

        const line = element("p", "modal-line");
        line.textContent = "One mistake ends the attempt. Restarting is always free.";

        card.append(title, line, button("Start", panel.onStart));
        break;
      }

      case "stuck": {
        // Being stuck is a design consequence, not a player failure: free
        // restart, no life taken, no ad (DESIGN.md 1.7).
        const title = element("h2");
        title.textContent = "No moves left";

        card.append(title, button("Restart", panel.onRestart));
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
}): string {
  if (input.mistakes === 0) return "Perfect. Not a single misread.";
  if (input.personalBest) return "Your best run on this level yet.";
  if (input.heartsLeft === 1) return "That was close.";
  return "Cleared.";
}
