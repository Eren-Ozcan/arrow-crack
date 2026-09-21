# Arrow Crack — working notes for Claude

Tap-only puzzle game. Vite + TypeScript + Capacitor, Android first,
**English only** (UI strings included). Package `com.yilkgames.arrowcrack`.

## Read before changing behaviour

The planning documents are the spec, not background reading. `DESIGN.md` is
authoritative on rules and the data model; `ROADMAP.md` defines the current
milestone and its done-condition. `ART.md`, `AUDIO.md`, `PROGRESSION.md`,
`ADS.md`, `TELEMETRY.md`, `CI.md` and `STORE.md` own their areas. If code and
a document disagree, fix one of them in the same change — do not leave both.

## Invariants

- The engine (`src/engine/`) is a pure reducer: no DOM, no randomness, no
  clock. The same code runs in the solver, in tests and in the UI. Its
  coverage gate is 100% — a new branch there is a new rule, and it needs a
  test naming the rule.
- One solver implementation (`src/solver/`) serves the generator, the CI
  validation gate, the in-app stuck check and the hint. Tooling in `tools/`
  is TypeScript run through `tsx`, so it imports that code directly instead
  of keeping a second copy.
- On the device the solver runs in a Web Worker and **fails open**: when a
  search runs out of budget the board is reported solvable. A false stuck
  panel is worse than a missed one.
- Every shipped level passes `npm run levels:validate`. A level that the
  solver cannot solve never ships.
- Tapping the wrong arrow costs a heart, so readability beats mood in every
  visual decision.

## Commands

| Command                   | What it does                      |
| ------------------------- | --------------------------------- |
| `npm run dev`             | Vite dev server                   |
| `npm run typecheck`       | `tsc --noEmit`                    |
| `npm run lint`            | ESLint                            |
| `npm test`                | Vitest, single run                |
| `npm run levels:manifest` | Regenerate `src/levels/manifest`  |
| `npm run levels:generate` | Propose levels 31-80 (`--write`)  |
| `npm run levels:validate` | The level gate (`CI.md` 2.2)      |
| `npm run build`           | Production web build              |
| `npm run size`            | Bundle budget gate                |
| `npm run cap:sync`        | Build, then sync into `android/`  |
| `npm run android:dev`     | Sync and run on a device/emulator |

## Where things live

`src/engine` rules, `src/solver` search, `src/render` canvas drawing,
`src/input` gesture arbitration, `src/game` the session that owns the clock
and the score, `src/ui` DOM screens, `src/levels` level JSON and the loader,
`src/state` the schema-versioned local save. The engine and the solver are
pure; everything that knows about time lives in `src/game/session.ts`.

No screen holds a string: every user-visible line is a key in
`src/ui/strings.en.json`, read through `t()` (DESIGN.md 6). That includes the
tutorial beats, which name a key rather than carrying a line.

## Verifying a change on the device

`npm run cap:sync && ./android/gradlew.bat -p android assembleDebug`, then
`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. Force-stop
the app before installing or Android shows an "app needs to be closed while
updating" dialog. `adb shell input tap X Y` drives it, and
`adb exec-out screencap -p > out.png` reads the screen back; give the WebView
a couple of seconds after `am start` before the first tap.

## Store and marketing assets

Store listing graphics, feature graphics, icons and screenshots are **never
committed to this repo**. Local masters live in `docs/store-assets-originals/`
(gitignored); the shared copy lives in the private `Eren-Ozcan/pictures` repo
under `pictures/arrow-crack/`. Studio-wide accounts, the domain and the Play
Console checklist are in `C:\Projects\pictures\STUDIO.md`.

## Signing

The keystore and `key.properties` never enter this repo or CI
(`CI.md` section 3). Release builds are produced locally.

## Third-party notices

`THIRD-PARTY-NOTICES.md` is updated when a dependency or asset is added, not
at release time.
