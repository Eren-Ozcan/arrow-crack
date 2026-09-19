/// <reference lib="webworker" />
import type { GameState } from "@/engine/types";
import type { SearchBudget } from "./search";
import { BUDGETS, isSolvable, nextMove } from "./index";

/**
 * The solver runs here so a slow search never blocks input or animation
 * (TELEMETRY.md 4.3). The answer arrives a frame or two late, which is
 * invisible; a dropped frame would not be.
 */
export type SolverRequest =
  | { id: number; kind: "solvable"; state: GameState; budget?: SearchBudget | undefined }
  | { id: number; kind: "hint"; state: GameState; budget?: SearchBudget | undefined };

export type SolverResponse =
  | { id: number; kind: "solvable"; solvable: boolean }
  | { id: number; kind: "hint"; arrowId: string | null };

export function handle(request: SolverRequest): SolverResponse {
  if (request.kind === "solvable") {
    return {
      id: request.id,
      kind: "solvable",
      solvable: isSolvable(request.state, request.budget ?? BUDGETS.stuckCheck),
    };
  }
  return {
    id: request.id,
    kind: "hint",
    arrowId: nextMove(request.state, request.budget ?? BUDGETS.hint),
  };
}

// Guarded so the message handling above can be imported and tested directly,
// outside a worker scope.
if (typeof self !== "undefined" && "postMessage" in self) {
  self.addEventListener("message", (event: MessageEvent<SolverRequest>) => {
    self.postMessage(handle(event.data));
  });
}
