# Arrow Crack — Audio

## The principle

The incumbent sells its sound as calm: _"ASMR gibi tatmin edici bırakma
anları"_, a soothing whoosh as each arrow leaves (`REFERENCE.md` 1). Ours is
not a de-stressor, it is a decision game, so the audio target is different:
**sound confirms that a decision was correct.** Precise, short, mechanical —
the click of something fitting, not a wash of calm.

Every sound is feedback. Nothing plays for decoration, and nothing plays that
the player did not cause.

---

## 1. The sound set

| Cue                   | Character                            | Notes                                                                                                                                                            |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select / tap          | Soft click                           | Fires on touch-down, before the outcome is known                                                                                                                 |
| Arrow slide           | Short whoosh                         | Pitch rises slightly with the path length travelled, so a long tangled body sounds like more work                                                                |
| **Peel (match)**      | Wooden knock + slab clack            | The core reward sound. It has to be the one people would tap for on its own                                                                                      |
| Block destroyed       | Shatter                              | Fuller than a peel, with debris tail                                                                                                                             |
| Bounce (wrong colour) | Dull thud                            | Muted, not harsh. It already cost a heart                                                                                                                        |
| Blocked tap           | Short muted knock                    | A locked door, not an error buzzer. The player misread; do not scold                                                                                             |
| **Heart lost**        | Low, distinct, unmistakable          | The **only** emotionally negative sound in the game. Never overlaps the bounce or knock — it plays just after, so two separate facts land as two separate sounds |
| Combo step up         | One rising note                      | See section 2                                                                                                                                                    |
| Joker fire            | The peel sound with a shimmer layer  |                                                                                                                                                                  |
| Ghost fire            | Airy, filtered whoosh with no attack | It passes through things; it should sound like it                                                                                                                |
| Bomb impact           | Deeper triple knock                  | Three peels, so three transients — the ear should count them                                                                                                     |
| Hint                  | Soft chime                           | Quiet; a hint is not a victory                                                                                                                                   |
| Timer under 10 s      | Soft tick                            | Never a heartbeat, never an alarm. It informs, it does not panic                                                                                                 |
| Win panel             | Short celebratory sting              | Once, not a fanfare                                                                                                                                              |
| Star reveal           | Three ascending notes                | One per star, on the 200 ms stagger (`ART.md` 7)                                                                                                                 |
| Perfect badge         | One bright note above the third star | Only for a zero-mistake clear, so it stays rare enough to mean something                                                                                         |

## 2. The combo pitch ladder

The single highest-value idea in this file, and nearly free:

**The peel sound is one sample, pitched by the current multiplier.** x1 at
base pitch, then a step up the scale for each tier — x2, x3, x4, x5. A player
on a long chain hears the board climbing, and a broken chain drops audibly
back to base without any "combo lost" sting.

This is why there is no in-level praise text (`PROGRESSION.md` 2.1): the
escalation is carried by sound and by the badge, neither of which can cover
the board or cost a heart.

Tier steps use a pentatonic scale, so any sequence of peels sounds
intentional rather than like a siren.

## 3. Music

- One calm loop, deliberately unobtrusive, mixed well under the effects.
- **Ducked** under every impact sound, so a peel always cuts through.
- Off by default? **No** — on by default, with an obvious toggle in settings
  and in the first-run flow. A muted-by-default game never gets heard at all;
  a game that is loud on the first launch gets uninstalled.
- Music and sound effects are separate toggles. Many players want the
  feedback and not the loop.

## 4. Mixing and platform rules

- At most 4 concurrent effect voices; the newest wins and the oldest is cut.
- Identical cues are rate-limited to one per 60 ms, so a fast chain does not
  turn into a rattle.
- **Android audio focus**: music pauses when another app takes focus (a call,
  a podcast) and resumes only if it was playing before. Effects still play at
  low volume with `mayDuck`.
- No audio during ads or the consent form — the SDK owns the output there.
- Mute and volume follow the system; the in-app toggles are on top of that,
  never instead of it.
- Haptics are paired with, not substituted for, sound: peel, block destroyed,
  bomb, heart lost. A player with sound off still feels the heart go.

## 5. Accessibility

- **No sound is ever the only channel for information.** Everything audible
  has a visible counterpart: the heart drains, the badge steps, the clock
  pulses under 10 s.
- A "reduce audio" option collapses the set to the essentials — peel, heart
  lost, win — for players who find layered feedback overwhelming.

## 6. Production

- Short mono files, OGG with an M4A fallback, loaded through the Web Audio
  API and preloaded at level start. The combo ladder is pitch-shifted at
  playback, so it is one file and not five.
- Total audio budget **under 1.5 MB**, counted against the bundle ceiling
  (`CI.md` 2.3). Music is the only long file and is the first thing to
  compress harder if the budget is tight.
- Sources: royalty-free or generated, with every licence recorded in
  `THIRD-PARTY-NOTICES.md` at the time the file is added, not at release.
