import type { GameState } from "@/engine/types";
import { packBoard } from "./board";
import type { SearchBudget, SearchResult } from "./search";
import { search } from "./search";

export * from "./board";
export * from "./search";

/**
 * One search serves the generator, the CI level gate, the on-device stuck
 * check and the hint (DESIGN.md 4.1). Callers differ only in their budget.
 */
export function solve(state: GameState, budget: SearchBudget = {}): SearchResult {
  return search(packBoard(state), budget);
}

/** Budgets from TELEMETRY.md 4.2. */
export const BUDGETS = {
  /** After every resolved tap. Fails open on overrun. */
  stuckCheck: { timeBudgetMs: 8, maxNodes: 20_000 },
  /** On demand, may show a spinner. */
  hint: { timeBudgetMs: 250, maxNodes: 400_000 },
  /** Off the critical path, for a remotely delivered level. */
  override: { timeBudgetMs: 1000, maxNodes: 2_000_000 },
} as const satisfies Record<string, SearchBudget>;

/**
 * The stuck check (DESIGN.md 1.7). It **fails open**: if the budget runs out
 * before the search finishes, the board is reported solvable and no panel is
 * shown. A false stuck panel is far worse than a missed one.
 */
export function isSolvable(
  state: GameState,
  budget: SearchBudget = BUDGETS.stuckCheck,
): boolean {
  const result = solve(state, budget);
  return result.solvable || !result.exhausted;
}

/**
 * The hint: the first move of an optimal solution from the current state, so
 * it works from any reachable board rather than along a pre-stored path.
 * Returns null when no solution was found inside the budget.
 */
export function nextMove(
  state: GameState,
  budget: SearchBudget = BUDGETS.hint,
): string | null {
  return solve(state, budget).witness?.[0] ?? null;
}
