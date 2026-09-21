import type { GameState } from "@/engine/types";
import type { SearchBudget } from "./search";
import type { SolverRequest, SolverResponse } from "./worker";

/**
 * How long a caller waits past the worker's own search budget before it gives
 * up on the answer. The worker stops itself at the budget, so anything later
 * than this means the worker is wedged, not thinking (TELEMETRY.md 4.2).
 */
const REPLY_GRACE_MS = 2_000;

/** The wait for a request that carries no time budget of its own. */
const DEFAULT_BUDGET_MS = 1_000;

/**
 * Main-thread handle on the solver worker. Both calls fail open: if the
 * worker errors, or answers later than the caller is willing to wait, the
 * board is reported solvable and no hint is given (TELEMETRY.md 4.2).
 */
export class SolverClient {
  #worker: Worker;
  #nextId = 1;
  #pending = new Map<number, (response: SolverResponse | null) => void>();
  /** Set once the worker has failed; every later question fails open at once. */
  #broken = false;

  constructor(worker: Worker = defaultWorker()) {
    this.#worker = worker;
    this.#worker.addEventListener("message", (event: MessageEvent<SolverResponse>) => {
      const resolve = this.#pending.get(event.data.id);
      if (!resolve) return;
      this.#pending.delete(event.data.id);
      resolve(event.data);
    });
    // A worker that throws while loading, or a reply that cannot be cloned,
    // would otherwise leave every caller waiting for ever.
    this.#worker.addEventListener("error", this.#fail);
    this.#worker.addEventListener("messageerror", this.#fail);
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
    this.#settleAll();
  }

  #ask(request: Omit<SolverRequest, "id">): Promise<SolverResponse | null> {
    if (this.#broken) return Promise.resolve(null);

    const id = this.#nextId;
    this.#nextId += 1;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.#pending.delete(id)) resolve(null);
      }, (request.budget?.timeBudgetMs ?? DEFAULT_BUDGET_MS) + REPLY_GRACE_MS);

      this.#pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      try {
        this.#worker.postMessage({ ...request, id } as SolverRequest);
      } catch {
        clearTimeout(timer);
        this.#pending.delete(id);
        resolve(null);
      }
    });
  }

  #fail = (): void => {
    this.#broken = true;
    this.#settleAll();
  };

  /** Releases every caller with no answer, which each reads as fail-open. */
  #settleAll(): void {
    const waiting = [...this.#pending.values()];
    this.#pending.clear();
    for (const resolve of waiting) resolve(null);
  }
}

/* v8 ignore start -- a real worker cannot be constructed under the test runner */
function defaultWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}
/* v8 ignore stop */
