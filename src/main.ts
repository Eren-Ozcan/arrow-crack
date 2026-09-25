import "./styles.css";
import { AudioEngine } from "./audio/engine";
import { audioFocusBridge } from "./audio/focus-plugin";
import { cuesFor, cuesForWin } from "./audio/script";
import { GameSession } from "./game/session";
import type { SessionView } from "./game/session";
import { LEVEL_IDS, levelById, nextLevelId } from "./levels";
import { watchBackButton } from "./platform/back";
import { AdService } from "./services/ads";
import type { AdResult, RewardedPlacement } from "./services/ads";
import { Analytics } from "./services/analytics";
import { IapService } from "./services/iap";
import { BUDGETS } from "./solver";
import { SolverClient } from "./solver/client";
import {
  SaveStore,
  addHints,
  isUnlocked,
  levelRecord,
  markColourNudgeShown,
  owesColourNudge,
  recordColourMistake,
  recordSkippedLevel,
  recordWin,
  spendHint,
  updateSettings,
} from "./state/save";
import type { Settings } from "./state/save";
import { Coach } from "./ui/coach";
import { HomeScreen } from "./ui/home";
import { Hud } from "./ui/hud";
import { commentaryFor, Modals } from "./ui/modals";
import type { LostPanel, OutOfTimePanel } from "./ui/modals";
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

/**
 * Monetization and analytics (`ADS.md` 2.1, `TELEMETRY.md` 2.1). No driver is
 * passed, so on the web and in a dev build every one of these is inert: the
 * game runs the full flow with no ad, no store and no event, which is also
 * what a player who refuses consent gets.
 */
const iap = new IapService({
  onPurchase: (result) =>
    analytics.log({
      name: "purchase",
      product: result.product,
      price: result.price,
      currency: result.currency,
    }),
});
const ads = new AdService({
  storage: adStorage(),
  adsRemoved: () => iap.adsRemoved(),
  uiBusy: () => modals.isOpen || waitingToStart,
  onResult: (placement, result) =>
    analytics.log({
      name: "ad_shown",
      format: placement === "level_complete" ? "interstitial" : "rewarded",
      placement,
      result,
    }),
});
const analytics = new Analytics();
/** Which level the two counters below are about. */
let startedLevelId: number | null = null;
/** `attempt_no` in the schema: which go at this level this one is. */
let attemptNo = 0;
/**
 * Consecutive fails on the level now open, which is what earns the skip
 * offer (`ADS.md` 1.4). It counts fails, not attempts: a restart taken
 * before the hearts ran out was not the level beating the player.
 */
let failsOnLevel = 0;
/** True while a hint is being searched for or paid for; the button waits. */
let hintBusy = false;

function adStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Consent decides both, together (`TELEMETRY.md` 2.2). Nothing awaits this:
 * the first level starts whether or not an ad SDK ever answers.
 */
async function bootServices(): Promise<void> {
  const [consented] = await Promise.all([ads.prepare(), iap.prepare()]);
  analytics.setConsent(consented);
}
void bootServices();
setLanguage(store.save.settings.language);

const audio = new AudioEngine(audioSettings(), { focus: audioFocusBridge() });

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

const ORDER = LEVEL_IDS;

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
  // Leaving mid-level is the quietest churn signal there is (TELEMETRY.md
  // 2.3), so it is reported before the session is thrown away.
  const view = session?.state;
  if (session && view?.status === "playing") {
    analytics.log({
      name: "level_quit",
      level_id: session.level.id,
      shots_fired: lastView?.shotsFired ?? 0,
      mistakes: view.mistakes,
    });
  }

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
  const level = levelById(levelId) ?? levelById(LEVEL_IDS[0]!)!;
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
    findHint: (state) => solver.nextMove(state, BUDGETS.hint),
    onChange: (view) => onChange(view),
    onSound: (event) => audio.playSequence(cuesFor(event)),
    onMistake: (event) => onMistake(event),
    onComboBreak: (multiplier) =>
      analytics.log({
        name: "combo_break",
        level_id: level.id,
        multiplier_at_break: multiplier,
      }),
    onSpecialUsed: (kind, source) =>
      analytics.log({ name: "special_used", level_id: level.id, kind, source }),
  });

  modals.reducedMotion = reducedMotion();
  hud ??= mountHud();
  hud.root.hidden = false;
  session = next;
  lastTickSecond = null;
  audio.startMusic();
  next.start();

  // The caps and the mistake budget are per attempt (ADS.md 1.3,
  // TELEMETRY.md 2.4); `attempt_no` counts the goes at this level.
  beginAttempt(level.id);

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
 * A restart is a new attempt at the same level (`DESIGN.md` 1.5): free and
 * instant, and therefore also a fresh set of ad caps and a fresh `mistake`
 * budget. It is the only way the board is reset, so the counters are raised
 * in one place rather than at each of the four buttons that reach it.
 */
function restart(): void {
  if (!session) return;
  session.restart();
  beginAttempt(session.level.id);
}

function beginAttempt(levelId: number): void {
  const level = levelById(levelId);
  if (!level) return;

  if (levelId !== startedLevelId) {
    startedLevelId = levelId;
    attemptNo = 0;
    failsOnLevel = 0;
  }
  attemptNo += 1;
  ads.startAttempt();
  analytics.startAttempt();
  analytics.log({
    name: "level_start",
    level_id: level.id,
    level_type: level.type ?? "standard",
    hearts: level.hearts,
    attempt_no: attemptNo,
  });
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
    onRestart: () => restart(),
    onToggleGrid: () => session?.toggleGrid(),
    onFit: () => session?.fit(),
    onBack: () => showHome(),
    onHint: () => void useHint(),
  });

  coach = new Coach(() => session?.dismissCoach());
  app!.append(mounted.root, coach.root, modals.root);
  return mounted;
}

/**
 * Colour-blind mode is a switch nobody is told about, and the player who
 * needs it is the one least able to guess it exists. Rather than a first-run
 * prompt for everyone, the game waits for evidence — three wrong-colour taps
 * across the save — and then points at the setting once, as a coach line at
 * the edge of the board (DESIGN.md 6, ART.md 2.2). A blocked tap is not
 * evidence: that is a mistake about the board, not about colour.
 */
function onMistake(event: "blocked" | "bounced"): void {
  analytics.log({
    name: "mistake",
    level_id: session?.level.id ?? 0,
    kind: event === "blocked" ? "blocked_tap" : "color_mismatch",
    shots_fired: lastView?.shotsFired ?? 0,
    hearts_left: session?.state.heartsLeft ?? 0,
  });

  if (event !== "bounced") return;

  const save = store.update((current) => recordColourMistake(current));
  if (!owesColourNudge(save)) return;
  // The line can arrive on the tap that lost the last heart, where the panel
  // owns the screen; then it is not spent, and the next mistake offers again.
  if (session?.note("coach.colourBlind")) {
    store.update((current) => markColourNudgeShown(current));
  }
}

/** The last view published, for the events raised outside `onChange`. */
let lastView: SessionView | null = null;

function onChange(view: SessionView): void {
  lastView = view;
  hud?.update(view);
  refreshHint();
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
    analytics.log({
      name: "level_fail",
      level_id: view.levelId,
      level_type: levelById(view.levelId)?.type ?? "standard",
      mistakes: view.mistakes,
      shots_fired: view.shotsFired,
      duration_ms: Math.round(view.elapsedMs),
      blocks_left: blocksLeft(),
      layers_left: layersLeft(),
    });
    // Counted here rather than per attempt: a restart taken with hearts still
    // in hand was not the level beating the player, and the skip offer is
    // about a level that did (`ADS.md` 1.4).
    failsOnLevel += 1;
    if (ads.offersContinue()) {
      // The offer is reported as it is made, so `continue_taken` has a
      // denominator (`TELEMETRY.md` 2.3).
      analytics.log({
        name: "continue_offered",
        level_id: view.levelId,
        continue_no: ads.attempt.continuesUsed + 1,
      });
    }
    modals.show(failPanel(view));
    return;
  }

  audio.stopAll();
  analytics.log({
    name: "level_stuck",
    level_id: view.levelId,
    shots_fired: view.shotsFired,
    cause: "other",
  });
  modals.show({
    kind: "stuck",
    onRestart: () => restart(),
    onHome: () => showHome(),
  });
}

/**
 * The out-of-hearts screen (`ADS.md` 1.4). Each rewarded row is drawn only
 * when it can actually be honoured: past two continues, or with no ad to
 * show, the row is absent rather than present and refusing. On a timed level
 * the budget that ran out was the clock, so the panel says so and offers
 * seconds rather than a heart (`PROGRESSION.md` 3).
 */
function failPanel(view: SessionView): LostPanel | OutOfTimePanel {
  const rows = {
    onContinue: ads.offersContinue() ? (): void => void takeContinue(view) : null,
    onSkip: ads.offersSkip(failsOnLevel) ? (): void => void takeSkip(view.levelId) : null,
    onRestart: (): void => restart(),
    onHome: (): void => showHome(),
  };

  return view.remainingMs === null
    ? { kind: "lost", ...rows }
    : { kind: "outOfTime", ...rows };
}

/**
 * Every rewarded show, with the screen cleared for it and the clock stopped
 * around it: an ad is not the player deciding (`PROGRESSION.md` 3.1), and it
 * never lands on top of a panel (`ADS.md` 1.2).
 */
async function playRewarded(placement: RewardedPlacement): Promise<AdResult> {
  modals.close();
  session?.suspend();
  try {
    return await ads.showRewarded(placement);
  } finally {
    session?.resumeFromSuspend();
  }
}

/**
 * Continue: +1 heart, or +30 seconds on a timed level, with the board kept
 * exactly as it stands — that is the whole value of the ad, since a restart
 * is always free (`ADS.md` 1.4).
 */
async function takeContinue(view: SessionView): Promise<void> {
  const active = session;
  const placement: RewardedPlacement =
    view.remainingMs === null ? "continue" : "timed_continue";
  const continueNo = ads.attempt.continuesUsed + 1;

  const result = await playRewarded(placement);
  if (session !== active) return;
  if (result !== "rewarded") {
    // A dismissal grants nothing and is not an error: the same screen comes
    // back, one row shorter only if the cap moved (`ADS.md` 1.3).
    modals.show(failPanel(view));
    return;
  }

  analytics.log({
    name: "continue_taken",
    level_id: view.levelId,
    continue_no: continueNo,
  });
  session?.continueAfterAd();
}

/**
 * Skip: zero stars and the next level unlocked. The release valve that keeps
 * a hard level from ending the session (`ADS.md` 1.4).
 */
async function takeSkip(levelId: number): Promise<void> {
  const active = session;
  const failsBefore = failsOnLevel;

  const result = await playRewarded("skip_level");
  if (session !== active) return;
  if (result !== "rewarded") {
    if (lastView) modals.show(failPanel(lastView));
    return;
  }

  analytics.log({ name: "skip_used", level_id: levelId, fails_before: failsBefore });
  store.update((save) => recordSkippedLevel(save, levelId));

  const next = nextLevelId(levelId);
  if (next === null) showHome();
  else start(next);
}

/**
 * The hint (`PROGRESSION.md` 4). The move is searched for **first**: if the
 * solver cannot produce one inside its budget, nothing is spent and no ad is
 * played, because an ad is never charged for a reward that cannot be
 * delivered (`ADS.md` 1.4). A balance is spent before an ad is offered, and
 * the button said which of the two this was going to be before it was
 * touched.
 */
async function useHint(): Promise<void> {
  const active = session;
  if (!active || hintBusy) return;

  hintBusy = true;
  refreshHint();
  try {
    const move = await active.findHint();
    if (move === null || session !== active) return;

    if (store.save.hints > 0) {
      if (!active.revealHint(move)) return;
      store.update((save) => spendHint(save));
      logHint(active.level.id, "balance");
      return;
    }

    if (!ads.offersHintAd()) return;
    const result = await playRewarded("hint");
    if (result !== "rewarded" || session !== active) return;

    // The hint is banked before it is spent, so a board that moved during the
    // ad leaves the player with the hint rather than with nothing.
    store.update((save) => addHints(save, 1));
    if (!active.revealHint(move)) return;
    store.update((save) => spendHint(save));
    logHint(active.level.id, "ad");
  } finally {
    hintBusy = false;
    refreshHint();
  }
}

function logHint(levelId: number, source: "balance" | "ad"): void {
  analytics.log({
    name: "hint_used",
    level_id: levelId,
    shots_fired: lastView?.shotsFired ?? 0,
    source,
  });
}

/** The button states which of the two things a tap will do (`ADS.md` 1.4). */
function refreshHint(): void {
  hud?.setHint({
    hints: store.save.hints,
    ad: ads.offersHintAd(),
    busy: hintBusy || ads.busy,
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
  analytics.log({
    name: "level_win",
    level_id: view.levelId,
    level_type: levelById(view.levelId)?.type ?? "standard",
    mistakes: view.mistakes,
    stars: view.stars,
    score,
    max_multiplier: view.maxMultiplier,
    shots_fired: view.shotsFired,
    duration_ms: Math.round(view.elapsedMs),
    continues_used: ads.attempt.continuesUsed,
  });

  // The level stopped beating the player, so the skip offer starts over.
  failsOnLevel = 0;

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
    onNext: next === null ? null : () => leaveWin(view.levelId, () => start(next)),
    onRestart: () => restart(),
    onHome: () => leaveWin(view.levelId, () => showHome()),
  });
}

/**
 * The single exit from the win celebration (`ADS.md` 1.1). Every way out —
 * Next, Home, and the Android back button once it is wired — comes through
 * here, so there is no door the ad trigger does not sit behind. The panel is
 * dismissed first: the stars and the score are fully shown before the ad,
 * and the next screen appears once it closes.
 */
function leaveWin(levelId: number, go: () => void): void {
  modals.close();
  void ads.maybeShowInterstitial(levelId).finally(go);
}

/**
 * Android back, answered here so it reaches the same functions the buttons
 * do (`ADS.md` 1.1). In order: the settings screen closes, the win
 * celebration leaves through `leaveWin()` and therefore past the
 * interstitial, any other panel and any live board abandon the attempt for
 * the home screen, and a press on the home screen itself is not consumed —
 * that one is allowed to leave the game.
 */
function onAndroidBack(): boolean {
  if (settings.isOpen) {
    settings.hide();
    return true;
  }

  if (modals.openPanel === "win" && lastView) {
    leaveWin(lastView.levelId, () => showHome());
    return true;
  }

  // A pre-level warning, a fail panel, the stuck panel, the resume panel and
  // a board mid-level all mean the same thing here: this attempt is over, and
  // `showHome()` is what reports the quit.
  if (modals.isOpen || session !== null) {
    showHome();
    return true;
  }

  return false;
}

/** What was still standing when the hearts ran out (`TELEMETRY.md` 2.3). */
function blocksLeft(): number {
  return session?.state.blocks.length ?? 0;
}

function layersLeft(): number {
  return session?.state.blocks.reduce((sum, block) => sum + block.layers.length, 0) ?? 0;
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
watchBackButton(onAndroidBack);
app.append(home.root, settings.root);

const jump = devJump();
if (jump === null) showHome();
else start(jump, true);
