import "./styles.css";
import { GameSession } from "./game/session";
import type { SessionView } from "./game/session";
import { LEVELS, levelById, nextLevelId } from "./levels";
import { SolverClient } from "./solver/client";
import { Hud } from "./ui/hud";
import { commentaryFor, Modals } from "./ui/modals";

const app = document.querySelector<HTMLElement>("#app");
const canvas = document.querySelector<HTMLCanvasElement>("#board");
if (!app || !canvas) throw new Error("app shell missing");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const solver = new SolverClient();
const modals = new Modals();

let session: GameSession | null = null;
let hud: Hud | null = null;

function start(levelId: number): void {
  const level = levelById(levelId) ?? LEVELS[0]!;

  session?.destroy();
  modals.close();

  const next = new GameSession({
    canvas: canvas!,
    level,
    reducedMotion,
    checkStuck: (state) => solver.isSolvable(state),
    onChange: (view) => onChange(view),
  });

  hud ??= mountHud();
  session = next;
  next.start();
}

function mountHud(): Hud {
  const mounted = new Hud({
    onRestart: () => session?.restart(),
    onToggleGrid: () => session?.toggleGrid(),
    onFit: () => session?.fit(),
  });

  app!.append(mounted.root, modals.root);
  return mounted;
}

function onChange(view: SessionView): void {
  hud?.update(view);

  if (view.status === "playing") {
    modals.close();
    return;
  }

  if (view.status === "won") {
    const next = nextLevelId(view.levelId);
    modals.show({
      kind: "win",
      stars: view.stars,
      score: session?.finalScore ?? view.score,
      commentary: commentaryFor({
        mistakes: view.mistakes,
        heartsLeft: view.heartsLeft,
        personalBest: false,
      }),
      onNext: next === null ? null : () => start(next),
      onRestart: () => session?.restart(),
    });
    return;
  }

  if (view.status === "lost") {
    modals.show({
      kind: "lost",
      // The rewarded ad lands in milestone 8; the grant itself is the engine's.
      onContinue: () => session?.continueAfterAd(),
      onRestart: () => session?.restart(),
    });
    return;
  }

  modals.show({ kind: "stuck", onRestart: () => session?.restart() });
}

start(LEVELS[0]!.id);
