# Arrow Crack — CI and Release

## Decision

**Tests and level validation run in CI. The release build is produced
locally. The signing keystore never enters CI or any repository.**

The value CI adds to this project is almost entirely the level validation
gate (section 2.2) — a solver run that proves every shipped level is
solvable and correctly rated. An Android build in CI would add a signing
secret, a keystore leak surface and a slow job, in exchange for a build the
developer can produce locally in a minute. That trade is not worth taking
while the studio is one person.

No other Yilk Games project has CI today, so this is new infrastructure.
It is kept to a single workflow file on purpose.

---

## 1. Workflow

`.github/workflows/ci.yml` — runs on push to any branch and on pull
requests.

```yaml
name: ci
on: [push, pull_request]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck # tsc --noEmit
      - run: npm run lint
      - run: npm test # vitest run
      - run: npm run levels:validate # the gate that matters
      - run: npm run build # vite build must not break
      - run: npm run size # bundle budget, section 2.3
```

Development happens on Windows; CI runs on Ubuntu. That difference is
useful — it catches path-case bugs in level and asset filenames before they
reach a device.

---

## 2. What the gates check

### 2.1 Tests

`vitest run` over `engine/`, `solver/` and the pure parts of `state/`. The
engine is a pure reducer with no DOM, so its tests are fast and complete;
they are the regression net for every rule in `DESIGN.md` section 1.

Coverage of `src/engine/` is held at **100% of statements, branches,
functions and lines**, and CI runs `npm run test:coverage` so a drop fails
the build. The threshold is affordable precisely because the engine is pure:
every branch there is a game rule, and an uncovered one is a rule nobody
tested. It is not extended to the renderer or the UI.

### 2.2 Level validation — the gate that matters

`tools/validate-levels.ts`, run over every level JSON in the bundle. The
tooling is TypeScript run through `tsx`, so the gate imports the shipped
engine and solver directly — one implementation, three callers (CI, the
generator, the device's override check) — with no build step in between.

The checks below are the full set. Implemented today: schema, path
integrity, solvable, `par`, witness replay, hearts, mask reachability and
level type. The difficulty band, the per-level solver cost and the special
arrow rules arrive with the milestones that make them meaningful, and the
table says so.

| Check                 | Fails the build when                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema                | The file does not match `LevelDef`, or the schema version is unknown                                                                                                    |
| Path integrity        | An arrow's polyline is disconnected, self-crossing, off-board, overlapping another arrow, or its head direction disagrees with its final segment                        |
| Solvable              | The solver finds no solution — a level nobody can finish. Proven **without** any combo-earned special, which may only ever make a level easier (`PROGRESSION.md` 1.4)   |
| Specials              | More than one designed special on a level, a special before level 35, or a special type the level's band has not yet introduced (`DESIGN.md` 1.11)                      |
| `par`                 | The stored `par` does not equal the solver's optimum                                                                                                                    |
| Witness replay        | Replaying the stored solution through `engine/fire()` does not win the level, or spends a life                                                                          |
| Hearts                | `hearts` disagrees with the band table in `DESIGN.md` section 2 and the level is not flagged as a one-heart level                                                       |
| Mask                  | An arrow occupies a cell outside the mask, or a block sits on a lane no arrow inside the mask can reach — an unhittable block is an unsolvable level (`DESIGN.md` 1.10) |
| Level type            | A timed level has no `timeLimitMs`, a non-timed level has one, or a timed level's par is too long for its clock (`PROGRESSION.md` 3)                                    |
| Special-level spacing | A timed level sits adjacent to a one-heart level                                                                                                                        |
| Difficulty band       | A generated level's metrics (`DESIGN.md` 4.3) fall outside the band for its index                                                                                       |
| Solver cost           | The worst-case node count regressed against the recorded fixture baseline                                                                                               |
| Ids and order         | Duplicate level ids, gaps in the sequence, or a manifest that disagrees with the files on disk                                                                          |

The witness replay is what makes the whole scheme trustworthy: it proves the
_shipped engine_ can win the level, not merely that some search once could.
A rule change that quietly breaks an old level fails here instead of in the
store.

This same script is what validates a Remote Config override before it is
pushed (`TELEMETRY.md` section 1.4) — one implementation, three callers:
CI, the generator, and the device.

### 2.3 Bundle size

Level JSON and audio grow quietly. A budget check fails the build when the
total bundle passes a set ceiling, so the growth is a decision rather than a
surprise at upload time.

---

## 3. Release procedure (local)

Run from a clean checkout of `main`, with everything above green.

1. Bump the version in `package.json` and the `versionCode` /
   `versionName` in `android/app/build.gradle`.
2. `npm ci && npm test && npm run levels:validate`
3. `npm run build && npx cap sync android`
4. `cd android && ./gradlew bundleRelease` — produces an `.aab`, which is
   what Play wants. APKs are for local device testing only.
5. Install the release build on a real device and play the smoke path:
   cold start, level 1, a mistake, a win, the continue ad, settings,
   restore purchases.
6. Upload to the Play Console internal testing track. Promote only after
   the internal track has been played on a real device.
7. Tag the commit `v<versionName>` and push the tag.

Steps 1-4 belong in `npm run release:android` once the flow has been done by
hand a couple of times.

---

## 3.1 Manual test matrix

Two devices are available and they cover different failures, so both are used
before every release. Neither substitutes for the other.

|             | Emulator                                                                                             | Physical Android device                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Good for    | Fast iteration, small-screen layout (a 360dp profile), locale and density switching, forcing offline | Real touch behaviour, real performance, ads, IAP, haptics, audio focus |
| Useless for | Gesture feel, ad fill, haptics, audio focus, thermal/battery behaviour                               | Quick resets and exotic screen profiles                                |

**The smoke path, on the physical device, every release:**

1. Cold start, no network. Play level 1 to a win. (Offline must be silent —
   no error, no spinner.)
2. Make both kinds of mistake deliberately; confirm each takes exactly one
   heart and that the heart-lost cue plays.
3. Zoom in, pan, then try to fire. Confirm no pan is ever read as a tap
   (`ART.md` 4.1) — this is the test that protects the game's harshest rule.
4. Run a level out of hearts; take the rewarded continue; confirm the board
   is unchanged and exactly one heart was added.
5. Finish a level, leave the win screen with a **button**, then repeat and
   leave with **Android back**. An interstitial must be possible on both, and
   impossible twice inside five minutes.
6. Background the app during a timed level; confirm the clock is paused on
   return and requires a resume tap.
7. Buy Remove Ads in the sandbox, confirm interstitials stop and rewarded
   still works, then reinstall and restore.
8. A shaped level and a one-heart level, for the pre-entry confirmation.

**On the emulator:** the 360dp layout at the most crowded board, the
grid-lines toggle, the high-contrast glyph setting, reduced motion, and a
corrupted-save recovery (section 3.2).

## 3.2 Save schema and migration

- The save is a single versioned JSON blob in `localStorage`:
  `{ schema: 3, scoreVersion: 1, levels: {...}, hints: n, settings: {...} }`.
- **Migrations are forward-only and pure**, one function per version step,
  each unit-tested against a captured real save from the previous version.
  Captured saves live in the test fixtures and are never deleted.
- **A save that fails to parse or carries an unknown future schema is not
  wiped.** It is renamed aside (`arrowCrack.save.broken.<timestamp>`) and the
  game starts fresh, so a bug that eats progress can still be recovered from
  a support request instead of being gone.
- Progress is local only; there is no cloud save in v1 (`ROADMAP.md`
  non-goals). Reinstalling loses progress, and the store listing does not
  claim otherwise.

---

## 4. Signing and secrets

### 4.1 Rules

- The keystore lives in `android-keystore/`, which is **gitignored**, same
  as Telv.
- `key.properties` (store password, key password, alias) is gitignored and
  never printed in a log, a commit message or a screenshot.
- Neither file is ever added to CI as a secret, because CI does not build
  Android.
- Google Play App Signing is enabled, so the key uploaded to Play is the
  _upload_ key. Losing it is recoverable through a Play support request —
  slow and unpleasant, but not fatal. Losing it without App Signing enabled
  would be fatal, which is why it is enabled before the first upload.

### 4.2 Backup — do this before the first release

The keystore exists on exactly one laptop. Disk failure then means no
further updates to the app until Play support resets the upload key.

- Mirror `android-keystore/` to the private `Eren-Ozcan/pictures` repo
  under `pictures/arrow-crack/`, alongside the store assets, and record the
  alias and the password location in `STUDIO.md`.
- **Known gap to fix while doing this:** Telv's `.gitignore` states the
  keystore is "mirrored to private Eren-Ozcan/pictures repo", but
  `pictures/Telv/` currently contains only a README. That mirror was never
  made. Worth confirming and fixing for Telv at the same time, since it is
  a released-title risk, not a planning one.

---

## 5. What is deliberately not in CI

- **Android builds.** Section "Decision".
- **Play Console uploads.** Automated store uploads need a service account
  key with publishing rights — a much worse secret to hold than a keystore —
  for a step taken a handful of times a month, by hand, with a human looking
  at the release notes.
- **Screenshot/e2e runs.** The browser-based smoke pass is run on demand,
  not per commit; a flaky visual test that blocks every push costs more than
  it catches at this size.
