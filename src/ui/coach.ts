import { element } from "./hud";

/**
 * The coach mark: one line, at the edge of the board, never over it
 * (DESIGN.md 2, ART.md 7). It teaches where the thing happened and goes away
 * on the next tap, so nothing has to be read before playing.
 */
export class Coach {
  readonly root: HTMLElement;

  #line: HTMLElement;

  constructor(onDismiss: () => void) {
    this.root = element("div", "coach");
    this.root.hidden = true;

    this.#line = element("p", "coach-line");
    this.root.append(this.#line);
    this.root.addEventListener("pointerdown", onDismiss);
  }

  update(text: string | null): void {
    if (text === null) {
      this.root.hidden = true;
      return;
    }
    if (this.#line.textContent !== text) this.#line.textContent = text;
    this.root.hidden = false;
  }
}
