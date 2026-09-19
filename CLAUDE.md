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
  clock. The same code runs in the solver, in tests and in the UI.
- One solver implementation (`src/solver/`) serves the generator, the CI
  validation gate, the in-app stuck check and the hint.
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
| `npm run levels:validate` | The level gate (`CI.md` 2.2)      |
| `npm run build`           | Production web build              |
| `npm run size`            | Bundle budget gate                |
| `npm run cap:sync`        | Build, then sync into `android/`  |
| `npm run android:dev`     | Sync and run on a device/emulator |

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
