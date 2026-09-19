import type { GameState } from "@/engine/types";
import type { SearchBudget } from "./search";
import type { SolverRequest, SolverResponse } from "./worker";

/**
 * Main-thread handle on the solver worker. Both calls fail open: if the
 * worker errors, or answers later than the caller is willing to wait, the
 * board is reported solvable and no hint is given (TELEMETRY.md 4.2).
 */
export class SolverClient {
  #worker: Worker;
  #nextId = 1;
  #pending = new Map<number, (response: SolverResponse) => void>();

  constructor(worker: Worker = defaultWorker()) {
    this.#worker = worker;
    this.#worker.addEventListener("message", (event: MessageEvent<SolverResponse>) => {
      const resolve = this.#pending.get(event.data.id);
      if (!resolve) return;
      this.#pending.delete(event.data.id);
      resolve(event.data);
    });
  }

  async isSolvable(state: GameState, budget?: SearchBudget): Promise<boolean> {
    const response = await this.#ask({ kind: "solvable", state, budget });
    return response?.kind === "solvable" ? response.solvable : true;
  }

  async nextMove(state: GameState, budget?: SearchBudget): Promise<string | null> {
    const response = await this.#ask({ kind: "hint", state, budget });
    return response?.kind === "hint" ? response.arrowId : null;
  }

  terminate(): void {
    this.#worker.terminate();
    this.#pending.clear();
  }

  #ask(request: Omit<SolverRequest, "id">): Promise<SolverResponse | null> {
    const id = this.#nextId;
    this.#nextId += 1;

    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      try {
        this.#worker.postMessage({ ...request, id } as SolverRequest);
      } catch {
        this.#pending.delete(id);
        resolve(null);
      }
    });
  }
}

/* v8 ignore start -- a real worker cannot be constructed under the test runner */
function defaultWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}
/* v8 ignore stop */
