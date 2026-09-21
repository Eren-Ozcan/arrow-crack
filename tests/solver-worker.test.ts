import { afterEach, describe, expect, it, vi } from "vitest";
import { createState } from "@/engine/level";
import { SolverClient } from "@/solver/client";
import { handle } from "@/solver/worker";
import type { SolverRequest, SolverResponse } from "@/solver/worker";
import { ordered } from "./fixtures/levels";

/** A worker stand-in that answers on the next microtask, or not at all. */
class FakeWorker implements Pick<Worker, "postMessage" | "terminate"> {
  #listeners: ((event: MessageEvent<SolverResponse>) => void)[] = [];
  #failures: (() => void)[] = [];

  constructor(
    private readonly mode: "answer" | "throw" | "silent" | "unsolicited" = "answer",
  ) {}

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === "message") this.#listeners.push(listener);
    else this.#failures.push(listener as unknown as () => void);
  }

  /** Fires what a worker fires when it cannot load or cannot answer. */
  fail(): void {
    for (const listener of this.#failures) listener();
  }

  postMessage(request: SolverRequest): void {
    if (this.mode === "throw") throw new Error("worker is gone");
    if (this.mode === "silent") return;

    const response = handle(request);
    queueMicrotask(() => {
      const responses: SolverResponse[] =
        this.mode === "unsolicited"
          ? [{ id: 9999, kind: "solvable", solvable: false }, response]
          : [response];

      for (const listener of this.#listeners) {
        for (const message of responses) {
          listener({ data: message } as MessageEvent<SolverResponse>);
        }
      }
    });
  }

  terminate(): void {}
}

function clientWith(mode: "answer" | "throw" | "silent" | "unsolicited"): SolverClient {
  return new SolverClient(new FakeWorker(mode) as unknown as Worker);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the solver worker", () => {
  it("answers both question kinds", () => {
    const state = createState(ordered.level);

    expect(handle({ id: 1, kind: "solvable", state })).toEqual({
      id: 1,
      kind: "solvable",
      solvable: true,
    });
    expect(handle({ id: 2, kind: "hint", state })).toEqual({
      id: 2,
      kind: "hint",
      arrowId: "red",
    });
  });

  it("honours a budget passed with the request", () => {
    const state = createState(ordered.level);
    expect(handle({ id: 3, kind: "hint", state, budget: { maxNodes: 0 } })).toEqual({
      id: 3,
      kind: "hint",
      arrowId: null,
    });
  });
});

describe("the solver client", () => {
  it("routes answers back to their own request", async () => {
    const client = clientWith("answer");
    const state = createState(ordered.level);

    const [solvable, hint] = await Promise.all([
      client.isSolvable(state),
      client.nextMove(state),
    ]);

    expect(solvable).toBe(true);
    expect(hint).toBe("red");
    client.terminate();
  });

  it("fails open when the worker cannot be reached", async () => {
    const client = clientWith("throw");
    const state = createState(ordered.level);

    expect(await client.isSolvable(state)).toBe(true);
    expect(await client.nextMove(state)).toBeNull();
    client.terminate();
  });

  it("ignores an answer to a request it never made", async () => {
    const client = clientWith("unsolicited");
    expect(await client.isSolvable(createState(ordered.level))).toBe(true);
    client.terminate();
  });

  it("drops an answer nobody is waiting for", async () => {
    const client = clientWith("answer");
    const state = createState(ordered.level);

    await client.isSolvable(state);
    // Terminating clears the pending map; a late answer must not throw.
    client.terminate();
    expect(await client.isSolvable(state)).toBe(true);
  });

  it("gives up on a worker that never answers", async () => {
    vi.useFakeTimers();
    const client = clientWith("silent");
    const state = createState(ordered.level);

    const solvable = client.isSolvable(state, { timeBudgetMs: 8 });
    const hint = client.nextMove(state, { timeBudgetMs: 250 });
    await vi.runAllTimersAsync();

    // Fail open: a silent worker means no stuck panel and no hint.
    expect(await solvable).toBe(true);
    expect(await hint).toBeNull();
    client.terminate();
  });

  it("fails open once the worker itself errors, and stays that way", async () => {
    const worker = new FakeWorker("silent");
    const client = new SolverClient(worker as unknown as Worker);
    const state = createState(ordered.level);

    const pending = client.isSolvable(state);
    worker.fail();

    expect(await pending).toBe(true);
    // No timer is needed for the next question; a broken worker answers now.
    expect(await client.isSolvable(state)).toBe(true);
    expect(await client.nextMove(state)).toBeNull();
    client.terminate();
  });
});
