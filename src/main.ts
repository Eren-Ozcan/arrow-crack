import "./styles.css";
import { GameSession } from "./game/session";
import type { SessionView } from "./game/session";
import { LEVELS, levelById, nextLevelId } from "./levels";
import { SolverClient } from "./solver/client";
import { Coach } from "./ui/coach";
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
let coach: Coach | null = null;
/** True while the one-heart warning is on screen and the board waits behind it. */
let waitingToStart = false;

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

  // A one-heart level announces itself before it starts, never after
  // (DESIGN.md 1.5).
  waitingToStart = level.hearts === 1;
  if (waitingToStart) {
    modals.show({
      kind: "oneHeart",
      levelId: level.id,
      onStart: () => {
        waitingToStart = false;
        modals.close();
      },
    });
  }
}

function mountHud(): Hud {
  const mounted = new Hud({
    onRestart: () => session?.restart(),
    onToggleGrid: () => session?.toggleGrid(),
    onFit: () => session?.fit(),
  });

  coach = new Coach(() => session?.dismissCoach());
  app!.append(mounted.root, coach.root, modals.root);
  return mounted;
}

function onChange(view: SessionView): void {
  hud?.update(view);
  coach?.update(view.coach);

  if (view.status === "playing") {
    if (!waitingToStart) modals.close();
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

/**
 * Dev only: `?level=20` opens a level directly. The home screen with the
 * level path lands in milestone 6; until then this is the only way to reach a
 * board in the middle of the bundle, and it is stripped from a production
 * build.
 */
function startingLevelId(): number {
  if (!import.meta.env.DEV) return LEVELS[0]!.id;
  const asked = Number(new URLSearchParams(window.location.search).get("level"));
  return levelById(asked) ? asked : LEVELS[0]!.id;
}

start(startingLevelId());
