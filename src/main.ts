import "./styles.css";
import { AudioEngine } from "./audio/engine";
import { cuesFor, cuesForWin } from "./audio/script";
import { GameSession } from "./game/session";
import type { SessionView } from "./game/session";
import { LEVELS, levelById, nextLevelId } from "./levels";
import { SolverClient } from "./solver/client";
import {
  SaveStore,
  isUnlocked,
  levelRecord,
  recordWin,
  updateSettings,
} from "./state/save";
import type { Settings } from "./state/save";
import { Coach } from "./ui/coach";
import { HomeScreen } from "./ui/home";
import { Hud } from "./ui/hud";
import { commentaryFor, Modals } from "./ui/modals";
import { SettingsScreen } from "./ui/settings";
import { setLanguage } from "./ui/strings";

const app = document.querySelector<HTMLElement>("#app");
const canvas = document.querySelector<HTMLCanvasElement>("#board");
if (!app || !canvas) throw new Error("app shell missing");

/**
 * The device preference is honoured without asking, and the settings switch
 * can only add to it: a player whose phone asks for less motion gets less
 * motion whatever this save says (ART.md 7).
 */
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function reducedMotion(): boolean {
  return prefersReducedMotion || store.save.settings.reducedMotion;
}
const solver = new SolverClient();
const modals = new Modals();
const store = new SaveStore();
setLanguage(store.save.settings.language);

const audio = new AudioEngine(audioSettings());

function audioSettings(): {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  reducedAudio: boolean;
} {
  const { sound, music, haptics, reducedAudio } = store.save.settings;
  return { sound, music, haptics, reducedAudio };
}

/**
 * The soft tick under ten seconds (AUDIO.md 1). It is driven off the clock
 * the session publishes rather than a timer of its own, so it stops the
 * moment the level does — and it is one tick per whole second, never a
 * heartbeat.
 */
const TICK_FROM_MS = 10_000;
let lastTickSecond: number | null = null;

function tickClockSound(remainingMs: number | null): void {
  if (remainingMs === null || remainingMs > TICK_FROM_MS) {
    lastTickSecond = null;
    return;
  }

  const second = Math.ceil(remainingMs / 1000);
  if (second === lastTickSecond) return;
  lastTickSecond = second;
  audio.play("tick");
}

const ORDER = LEVELS.map((level) => level.id);

let session: GameSession | null = null;
let hud: Hud | null = null;
let coach: Coach | null = null;
/** True while a pre-level warning is on screen and the board waits behind it. */
let waitingToStart = false;

const home = new HomeScreen({
  onPlay: (levelId) => start(levelId),
  onSettings: () => settings.show(store.save.settings, store.save.hints),
});

const settings = new SettingsScreen({
  onChange: (patch) => applySettings(patch),
  onDeleteData: () => {
    store.clear();
    setLanguage(store.save.settings.language);
    settings.hide();
    showHome();
  },
  onClose: () => settings.hide(),
});

function applySettings(patch: Partial<Settings>): void {
  const save = store.update((current) => updateSettings(current, patch));
  if (patch.language !== undefined) setLanguage(save.settings.language);
  audio.update(audioSettings());
  settings.render(save.settings, save.hints);
}

/** Leaves the board: the attempt is abandoned, nothing is charged for it. */
function showHome(): void {
  session?.destroy();
  session = null;
  waitingToStart = false;
  modals.close();

  audio.stopAll();
  canvas!.hidden = true;
  if (hud) hud.root.hidden = true;
  coach?.update(null);
  home.show(store.save);
}

function start(levelId: number, force = false): void {
  const level = levelById(levelId) ?? LEVELS[0]!;
  if (!force && !isUnlocked(store.save, level.id, ORDER)) return;

  session?.destroy();
  modals.close();
  home.hide();
  settings.hide();
  canvas!.hidden = false;

  const next = new GameSession({
    canvas: canvas!,
    level,
    reducedMotion: reducedMotion(),
    colourBlindMode: store.save.settings.colourBlindMode,
    checkStuck: (state) => solver.isSolvable(state),
    onChange: (view) => onChange(view),
    onSound: (event) => audio.playSequence(cuesFor(event)),
  });

  modals.reducedMotion = reducedMotion();
  hud ??= mountHud();
  hud.root.hidden = false;
  session = next;
  lastTickSecond = null;
  audio.startMusic();
  next.start();

  // A one-heart level and a timed level each announce themselves before they
  // start, never after (DESIGN.md 1.5, PROGRESSION.md 3).
  const timed = level.type === "timed" && level.timeLimitMs !== undefined;
  waitingToStart = level.hearts === 1 || timed;
  if (!waitingToStart) return;

  next.suspend();
  const onStart = (): void => {
    waitingToStart = false;
    modals.close();
    next.resumeFromSuspend();
  };

  modals.show(
    timed
      ? {
          kind: "timed",
          levelId: level.id,
          timeLimitMs: level.timeLimitMs!,
          onStart,
        }
      : { kind: "oneHeart", levelId: level.id, onStart },
  );
}

/**
 * The clock stops for anything that is not play, and coming back from the
 * background needs a tap before it starts again (PROGRESSION.md 3.1).
 */
function watchVisibility(): void {
  document.addEventListener("visibilitychange", () => {
    if (!session || session.remainingMs === null) return;

    if (document.hidden) {
      session.suspend();
      return;
    }
    if (session.state.status !== "playing") return;

    modals.show({
      kind: "resume",
      onResume: () => {
        modals.close();
        session?.resumeFromSuspend();
      },
    });
  });
}

function mountHud(): Hud {
  const mounted = new Hud({
    onRestart: () => session?.restart(),
    onToggleGrid: () => session?.toggleGrid(),
    onFit: () => session?.fit(),
    onBack: () => showHome(),
  });

  coach = new Coach(() => session?.dismissCoach());
  app!.append(mounted.root, coach.root, modals.root);
  return mounted;
}

function onChange(view: SessionView): void {
  hud?.update(view);
  coach?.update(view.coach);
  tickClockSound(view.remainingMs);

  if (view.status === "playing") {
    if (!waitingToStart) modals.close();
    return;
  }

  // Every end panel waits for the shot that ended the level to land. The
  // reducer knows the outcome the moment the tap resolves, so a level that
  // ends on a tap publishes its status twice — once at the tap and once when
  // the animation finishes — and the panel was shown for both of them. The
  // player has not seen the last block come apart at the first one.
  if (view.busy) return;

  if (view.status === "won") {
    onWin(view);
    return;
  }

  if (view.status === "lost") {
    audio.stopAll();
    // The rewarded ad lands in milestone 8; the grant itself is the engine's.
    const onContinue = (): void => session?.continueAfterAd();
    const onRestart = (): void => session?.restart();
    const onHome = (): void => showHome();

    // On a timed level the budget that ran out was the clock, so the panel
    // says so and offers seconds rather than a heart (PROGRESSION.md 3).
    modals.show(
      view.remainingMs === null
        ? { kind: "lost", onContinue, onRestart, onHome }
        : { kind: "outOfTime", onContinue, onRestart, onHome },
    );
    return;
  }

  audio.stopAll();
  modals.show({
    kind: "stuck",
    onRestart: () => session?.restart(),
    onHome: () => showHome(),
  });
}

/**
 * A win is the only thing that reaches the save (DESIGN.md 1.9): stars, the
 * best score, the best time and the hint a first perfect clear pays.
 */
function onWin(view: SessionView): void {
  const score = session?.finalScore ?? view.score;
  const previousBest = levelRecord(store.save, view.levelId)?.bestScore ?? null;

  store.update((save) =>
    recordWin(save, {
      levelId: view.levelId,
      stars: view.stars,
      score,
      remainingMs: view.remainingMs,
    }),
  );

  audio.playSequence(cuesForWin(view.stars, view.mistakes === 0));

  const next = nextLevelId(view.levelId);
  modals.show({
    kind: "win",
    stars: view.stars,
    score,
    perfect: view.mistakes === 0,
    commentary: commentaryFor({
      mistakes: view.mistakes,
      heartsLeft: view.heartsLeft,
      // Only a level that has been beaten before can be beaten better.
      personalBest: previousBest !== null && score > previousBest,
      remainingMs: view.remainingMs,
    }),
    onNext: next === null ? null : () => start(next),
    onRestart: () => session?.restart(),
    onHome: () => showHome(),
  });
}

/**
 * Dev only: `?level=67` opens a level directly, past the unlock gate, so a
 * board in the middle of the bundle can be reached without playing to it —
 * which is what the ART.md section 10 screenshots need. It is stripped from a
 * production build.
 */
function devJump(): number | null {
  if (!import.meta.env.DEV) return null;
  const asked = Number(new URLSearchParams(window.location.search).get("level"));
  return levelById(asked) ? asked : null;
}

watchVisibility();
app.append(home.root, settings.root);

const jump = devJump();
if (jump === null) showHome();
else start(jump, true);
