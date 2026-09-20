# Arrow Crack

A tap-only puzzle game. A tangle of long, bent, colored arrows fills a grid,
and a frame of layered, breakable blocks surrounds it. Tap an arrow and it
slides out along its own path, head first, into the block on its lane —
fire them in the right order to break every block. Tapping a blocked arrow
or hitting the wrong color costs a heart, and hearts are all you have.

Store title: **Arrow Crack Arrow Pop Puzzle**. Package `com.yilkgames.arrowcrack`.
Stack: Vite + TypeScript + Capacitor, Android first, **English only**.

Status: **milestone 3 complete.** Levels 1-3 are playable on a phone: the
procedural canvas board, tap-to-fire with gesture arbitration, the camera,
the exit-ray guide, hearts, stars, score and the result panels, on top of the
pure engine and the IDA* solver. Levels 4-30 are next.

```sh
npm install
npm run dev            # web
npm run android:dev    # build, sync and run on a device
```

## Planning documents

| File                             | What it decides                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [DESIGN.md](DESIGN.md)           | Rules, lives, scoring, dead states, data model, level generation, architecture                                                       |
| [ROADMAP.md](ROADMAP.md)         | Milestones 0-9 and their done-conditions, plus the explicit non-goals                                                                |
| [PROGRESSION.md](PROGRESSION.md) | Score and combo multiplier, praise and celebration, timed and one-heart levels, the hint economy, and what leagues need recorded now |
| [ART.md](ART.md)                 | Visual direction, the colorblind-safe palette and glyph system, states, motion, validation tests                                     |
| [AUDIO.md](AUDIO.md)             | The cue set, the combo pitch ladder, mixing and platform rules                                                                       |
| [STORE.md](STORE.md)             | Listing identity, short and long description, ASO, screenshots, data safety, review replies                                          |
| [ADS.md](ADS.md)                 | Ad formats, triggers, caps, consent, IAP — bound by the studio-wide `pictures/ADS_POLICY.md`                                         |
| [TELEMETRY.md](TELEMETRY.md)     | Level delivery and remote override, analytics event schema, the difficulty retuning loop, performance budgets                        |
| [CI.md](CI.md)                   | What runs in CI, the level validation gate, the local release procedure, signing and keystore backup                                 |
| [REFERENCE.md](REFERENCE.md)     | Amaze GO teardown (100M+ installs, 4.5/241K, no remove-ads IAP) — listing data, what we take, what we refuse, and the three wedges   |

## The four rules everything else follows from

1. **Hearts are the only currency.** No move limit. **Tapping the wrong arrow
   costs a heart** — whether it was blocked or the wrong color, at every
   level, with no grace tap. Levels grant 4, then 3 from level 50, and a
   designated few grant exactly 1.
2. **Readability is the difficulty curve.** Hearts are spent on misreads, so
   any visual choice that trades legibility for mood loses.
3. **Stars and score are separate.** Stars come from mistakes and gate
   progression; score comes from a combo chain and gates nothing. Speed
   raises the multiplier only while the chain is unbroken, so haste never
   beats accuracy.
4. **The solver is shared.** One search powers the generator, the CI
   validation gate, the in-app stuck detection, the hint, and the remote
   override check.
