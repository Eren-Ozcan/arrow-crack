# Arrow Crack — Roadmap

Target: a full vertical slice — playable core, 80 levels, level path, saved
progress, ads/IAP, settings — shippable to the Play Store internal track.

See `DESIGN.md` for the rules and the data model.

## Sizing

Rough effort for one developer, in working days. The numbers exist to force
ordering decisions, not as a schedule — a solo project that slips does so in
the two milestones marked at risk.

| Milestone                    | Days         | Risk                                                                        |
| ---------------------------- | ------------ | --------------------------------------------------------------------------- |
| 0 Setup                      | 2            | —                                                                           |
| 1 Engine                     | 4            | —                                                                           |
| 2 Solver                     | **7**        | **High.** IDA* plus the on-device budget is the hardest code in the project |
| 3 Playable board             | 8            | Medium — the camera and gesture arbitration are fiddly                      |
| 4 Levels 1-30 + specials     | 7            | —                                                                           |
| 5 Generator + levels 31-80   | **10**       | **High.** The difficulty model is guesswork until real data                 |
| 6 Meta                       | 4            | —                                                                           |
| 7 Audio and polish           | 5            | —                                                                           |
| 8 Monetization and analytics | 5            | Medium — console setup and sandbox testing eat time                         |
| 9 Store readiness            | 4            | —                                                                           |
|                              | **~56 days** |                                                                             |

If time runs short, the order to cut in: generated levels 61-80 first (ship
60), then shaped levels (ship one instead of four), then the timed level
type. **Never** cut: the solver's stuck detection, the inert blocked-arrow
rendering, or the gesture thresholds — each of those turns the heart rule
from strict into unfair.

---

## Milestone 0 — Project setup

- Vite + TypeScript + Vitest scaffold, ESLint/Prettier, `npm run dev`.
- Capacitor Android platform, package id `com.yilkgames.arrowcrack`, app
  name, debug build installs on both the emulator and the physical test
  device.
- LICENSE (`UNLICENSED`) and an empty `THIRD-PARTY-NOTICES.md` that every
  dependency and audio file is added to **when it is added**, not at release.
- Repo init, `.gitignore` (including `android-keystore/` and
  `key.properties`), LICENSE, README, `docs/store-assets-originals/`
  gitignored per the studio asset rule.
- CLAUDE.md for this project, including the store-asset rule.
- `.github/workflows/ci.yml` per `CI.md` section 1, green on an empty
  project (tests and the level validator start as no-ops).

**Done when:** a blank canvas renders on an Android debug build.

## Milestone 1 — Engine (no UI)

- `engine/types.ts`, `engine/level.ts`, `engine/fire.ts`, `engine/stars.ts`.
- Pure reducer, no DOM, no randomness.
- Path arrows: polyline validation (connected, no self-crossing, head
  direction agrees with the final segment), the derived cell-occupancy
  index, and lane resolution from the head alone.
- Open lanes (a lane with no block) and optional board **masks** for shaped
  levels (`DESIGN.md` 1.10) — both cheap in the engine, both needed later.
- Unit tests for every rule: blocked ray (costs a heart), clear exit, a long
  body that is never its own obstacle, color match peel, block destroy,
  mismatch bounce restoring the exact starting shape (costs a heart), flight
  into a destroyed lane (free, irreversible), win, out of hearts, continue,
  star thresholds from the mistake count, wide-block targeting.

**Done when:** `npm test` covers every branch of `fire()` and a
hand-written 3-level fixture set can be solved by scripted taps.

## Milestone 2 — Solver

- `tools/solve.mjs`: BFS then IDA* with a Zobrist visited set.
- Reports `solvable`, `par`, capped `solutionCount`, witness path.
- `tools/validate-levels.mjs`, wired into CI as the release gate
  (`CI.md` section 2.2): schema, solvable, `par`, witness replay through the
  shipped engine, lives, difficulty band, solver cost, id/manifest
  consistency. One implementation, three callers: CI, the generator, and the
  device's override check.
- **Ships in the app too**: same solver behind `isSolvable(state)` for the
  stuck detection and `nextMove(state)` for the hint, running in a Web
  Worker on a packed board representation, with the budgets and the
  fail-open behaviour in `TELEMETRY.md` section 4.
- Fixtures record a worst-case node count; a regression fails CI.

**Done when:** the solver returns the correct par on the fixture levels,
finishes a 6x6 / 5-color board in under a second, and the in-app stuck check
stays inside 8 ms on the target device.

## Milestone 3 — Playable board

Implements `ART.md`; nothing on the board is a sprite, everything is drawn
procedurally from the palette table.

- Canvas renderer: grid, **path arrows** drawn as heavy-outlined pipes with
  rounded bends, an oversized head and a rounded tail carrying the glyph;
  frame blocks with layer slabs; wide blocks spanning lanes.
- Press-and-hold exit-ray guide (`ART.md` 3.2) — free, not ad-gated.
- **Blocked arrows rendered visibly inert** — required, not polish: a
  blocked tap costs a heart, so it must be readable before the tap
  (`ART.md` 6.1).
- **Blocker highlight**: tapping a blocked arrow pulses whatever is blocking
  it. The life is still spent, but the player learns why (`ART.md` 6.2).
- Tap input with hit testing, animation queue, input lock during playback.
- **Camera**: pinch zoom 1x-3x, double-tap, drag to pan, clamped, with a fit
  button and an edge marker for an off-screen target block (`ART.md` 4).
- **Gesture arbitration** (`ART.md` 4.1): a touch fires only if it lifts
  within 250 ms having moved under 8 dp; anything else pans and can never
  become a fire. A pan mistaken for a tap steals a heart.
- HUD: hearts, level number, restart, back, and a grid-lines toggle that
  helps trace a tangle. No move counter.
- Result modals: win with stars, out of hearts with continue/restart/skip,
  stuck with a free restart.
- Score and combo multiplier per `PROGRESSION.md` 1. In-level feedback is
  wordless: badge and floating score only, nothing drawn over the board.
- The level-complete celebration in the order given in `PROGRESSION.md` 2.2,
  including the single commentary line — narrow escape, personal best,
  percentile or perfect.

**Done when:** levels 1-3 are fully playable on a phone.

## Milestone 4 — Hand-authored levels 1-30

- Level JSON format plus a loader and a manifest generator.
- Levels 1-30 authored by hand, every one solver-verified.
- Special arrows in the engine and the solver — Joker, Ghost, Bomb
  (`DESIGN.md` 1.11) — each as a distinct move type, with the bomb's
  three-peel area effect and its adjacency rules unit-tested.
- A mask authoring format (a character grid) and the first hand-authored
  **shaped level** at level 20, doubling as the first one-heart level.
- The tutorial beats from `DESIGN.md` section 2 wired in as contextual
  hints, not text walls.

**Done when:** 30 levels play end to end with correct stars.

## Milestone 5 — Generator and levels 31-80

- `tools/generate-levels.mjs`: backwards construction, decoy arrows, wide
  block merging, difficulty scoring, solver verification.
- Generate and curate levels 31-80; every level manually played once before
  it ships.
- Hand-authored shaped levels roughly every 20 levels (40, 60, 80), the
  one-heart levels per `DESIGN.md` 1.5, and the timed levels per
  `PROGRESSION.md` 3 — never adjacent to each other.
- Designed special arrows from level 35, one per level at most, introduced in
  the order Joker (35), Bomb (42), Ghost (55).
- The combo-earned Joker at the x5 cap (`PROGRESSION.md` 1.4), once per
  attempt, never stacking past two specials on the board.

**Done when:** 80 levels ship, the difficulty curve is monotonic under the
difficulty model, and CI validates all of them.

## Milestone 6 — Meta

- Home screen with the level path, star display and locking.
- Schema-versioned local save (progress, stars, best score, best time, hint
  balance,
  `scoreVersion`, settings) — recorded now so a league is possible later
  (`PROGRESSION.md` 5).
- Settings screen: sound, music, haptics, language, privacy, delete data.
- English-only UI, strings in JSON behind a lookup — no hardcoded text, no
  translation work in v1 (`STORE.md`).

**Done when:** the app is usable from cold start to level 80 with no dev
shortcuts.

## Milestone 7 — Audio and polish

Implements `AUDIO.md`.

- The full cue set, including the **combo pitch ladder** — one peel sample
  pitched by the multiplier, which is what carries the escalation now that
  there is no in-level praise text.
- The heart-lost cue is distinct and unmistakable, and plays just after the
  bounce or knock so two facts land as two sounds.
- Music loop, separate music and effects toggles, Android audio focus
  handling, haptics paired with the impact cues.
- Particles on shatter, screen shake on bounce, star reveal animation, all
  on the timings in `ART.md` section 7.
- Reduced-motion setting and the high-contrast glyph setting.
- Run the six validation tests in `ART.md` section 10 — grayscale, CVD
  simulation, blocked-arrow still test, 360dp small screen, tangle
  legibility, sunlight.

## Milestone 8 — Monetization and analytics

Implements `ADS.md` and `TELEMETRY.md` sections 1-3 in full; those files are
the spec for this milestone.

- `services/ads.ts`, `services/iap.ts`, `services/analytics.ts` facades,
  no-op in dev.
- Firebase Analytics with the event schema in `TELEMETRY.md` 2.3, gated on
  the same consent result as ads.
- Firebase Remote Config `levels_override`: background fetch, cached,
  solver-validated before it is accepted, never swapped mid-level.
- Remote Config `level_stats` (per-level score and completion-time
  distributions) feeding the
  percentile line. Absent or stale means the line is hidden — never a
  fabricated percentage (`PROGRESSION.md` 2.4).
- The scheduled query behind the retuning loop (`TELEMETRY.md` 3.2).
- UMP consent before init; shared persistent full-screen cooldown in
  `state/adState.ts`.
- Interstitial on leaving the win screen (buttons **and** Android back).
- Rewarded: continue (+1 heart, board kept, max 2), hint, skip level — caps
  enforced in game, not in the panel.
- RevenueCat products: `remove_ads` at ₺149,99 (non-consumable) and
  `hint_pack` (consumable), with restore purchases; rewarded ads stay active
  after either purchase.
- AdMob console setup per the `ADS.md` checklist, then add an Arrow Crack
  column to `ADS_POLICY.md` section 3 and rows to section 4.
- Analytics events: level start/win/fail, moves used, retries, ad shown, ad
  rewarded, purchase.

**Done when:** test ads show, a sandbox purchase removes ads and restore
works after a reinstall.

## Milestone 9 — Store readiness

- App icon, feature graphic, screenshots and the listing copy from `STORE.md`
  (English only). **Images live in the private `pictures` repo, never in this
  repo.**
- Privacy policy and deletion URLs: the studio-wide yilkgames.com addresses,
  no game-specific page. **Update the studio page first if it does not yet
  describe what this game collects**, and remember the site deploys only by
  running wrangler by hand (`STORE.md` 6).
- Data Safety form and content rating per `STORE.md` 6.
- Release keystore created, Play App Signing enabled **before** the first
  upload, and the keystore mirrored to the private `pictures` repo per
  `CI.md` section 4.2.
- Release build and Play Console internal testing track, following the local
  release procedure in `CI.md` section 3.

**Done when:** the internal testing track is live and installable.

---

## After launch

In order, each gated on the previous one's data:

1. **Retune from real play.** The `levels_override` loop (`TELEMETRY.md` 3.2)
   and the `blocked_tap` check. Weeks 1-4, before any new content.
2. **Content update: levels 81-120.** Mask-aware generation so shaped levels
   become a repeatable type rather than four hand-made ones.
3. **Leagues.** Only once the score distribution is understood and only with
   server-side witness validation (`PROGRESSION.md` 5).
4. **A second locale.** Turkish first, since the studio can write it. English
   strings are already externalized, so this is content work.

Anything that adds a daily obligation — streaks, events, energy — stays off
this list unless retention data demands it, and it will not before there is
any retention data.

## Explicit non-goals for this vertical slice

- Global energy meter / wait timers. Hearts are per level and a restart
  always refills them.
- Cloud save and accounts (local save only; the Firebase path stays open).
- Leaderboards and leagues. The score, `max_multiplier` and `scoreVersion`
  ship in v1 so a league is possible later; nothing server-side is built, and
  a real league will need server-side witness validation, not a submitted
  number (`PROGRESSION.md` 5).
- Daily challenges, events.
- Mask-aware level generation. Shaped levels ship hand-authored in v1;
  generating them is a post-launch content lever (`DESIGN.md` 1.10).
- iOS build.
- Level editor UI (the generator script is enough).
