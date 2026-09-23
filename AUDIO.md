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

| Cue                    | Character                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Select / tap           | Soft click                           | Fires the moment the touch is ruled a tap, before the outcome is known. Not on touch-down: a touch that pans must never make a sound, because a pan can never become a fire (`ART.md` 4.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Arrow**              | Arrow whoosh (**sampled**)           | The sound of a tap that was allowed, played **at the tap** rather than after the flight — feedback that waits for the animation is feedback the hand has stopped asking about. It is `public/audio/arrow.mp3`, a wind swoosh — summed to mono, given a 22 ms fade-in, rolled off above 5.2 kHz and below 180 Hz, and lifted +7 dB into a limiter. The filtering is what takes the edge off: with the top left open the swoosh read as sharp against a board whose whole point is calm reading. The first recording tried here was an impact whose transient read as a click; a swoosh with no hard front is what an arrow actually sounds like from where the player is standing. Three synthesised versions were tried before either of them, and none read as an arrow. It sounds for every shot whose body leaves — a match, a broken block, a free flight, and a bounce. Only a blocked tap is silent of it, because on a blocked tap nothing moved |
| Arrow that hit nothing | The same arrow, thinner              | A flight into a destroyed lane is free and irreversible: the same recording, higher and quieter, with nothing behind it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Arrow flight           | _silent_                             | The travel used to sound as well as the impact, and two sounds for one decision read as two objects. The path length is heard as the delay before the block breaks instead — and that delay **is** the slide the animation plays (`ART.md` 7), read off the plan rather than estimated from the path, because an estimate that drifts from the animation is heard as the block breaking before the arrow gets there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Block destroyed**    | Shatter, with a debris tail          | A second fact, so a second sound, landing when the block comes apart on screen — the end of the slide — rather than when the arrow left. A broken block is not a louder arrow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Bounce (wrong colour)  | Dull thud                            | Muted, not harsh. It already cost a heart                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Blocked tap            | Short muted knock                    | A locked door, not an error buzzer. The player misread; do not scold. It lands when the arrow reaches what stopped it, not at the tap: the knock is the collision, and the arrow is seen running into the piece in its way (`ART.md` 6.2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Heart lost**         | Low, distinct, unmistakable          | The **only** emotionally negative sound in the game. Never overlaps the bounce or knock — it plays just after, so two separate facts land as two separate sounds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Combo step up          | One rising note                      | See section 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Joker fire             | The arrow with a shimmer layer       | Replaces the arrow sound rather than layering over it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Ghost fire             | Airy, filtered whoosh with no attack | It passes through things; it should sound like it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Bomb impact            | Three arrows, stepping down          | Three transients, spaced so the ear can count them. Never a drum roll                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Hint                   | Soft chime                           | Quiet; a hint is not a victory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Timer under 10 s       | Soft tick                            | Never a heartbeat, never an alarm. It informs, it does not panic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Win panel              | Short celebratory sting              | Once, not a fanfare                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Star reveal            | Three ascending notes                | One per star, on the 200 ms stagger (`ART.md` 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Perfect badge          | One bright note above the third star | Only for a zero-mistake clear, so it stays rare enough to mean something                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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

**A recording takes a third of that climb, not all of it**
(`SAMPLE_LADDER_DEPTH`). A synthesised voice is built at whatever pitch it is
asked for, but a sample is resampled: at the cap the full interval played the
arrow 68% fast, which shortened it and dragged its whole spectrum up. The
reward got sharper and thinner the better the player was doing. A third of
the interval still climbs audibly and leaves the arrow recognisably itself.

## 3. Music

- One calm bed, deliberately unobtrusive, mixed well under the effects, and
  **the only media file in the project**. Two synthesised beds were tried and
  both were rejected in play — an algorithm cheap enough to ship inline is
  also shallow enough to notice, and a bed the player notices is the opposite
  of what a bed is for. The cue set stays synthesised (section 6); the music
  does not.
- The file is dropped into `public/audio/` as `music.mp3`, `music.ogg` or
  `music.m4a`, and `public/audio/README.md` states what it has to be. It is
  optional at runtime: with no file the game plays its cues and nothing else,
  and nothing on screen says anything is missing.
- The bed that ships is a 60 s mono loop at 80 kbps, 587 KB, normalised to
  -23 LUFS so it sits under the cues before the ducking even starts. It is
  cut from the steady middle of a longer generation — the generation itself
  builds and then fades, and a bed may not do either. The seam is a two-second
  crossfade baked into the file, because the player loops it flat.
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
- **Android audio focus**: held for real, not inferred. Web Audio in a
  WebView never asks the platform for focus, so the visibility signal alone
  let the music play over another app's podcast and kept playing through a
  call while the game was still on screen. `AudioFocusPlugin` in `android/`
  requests `AUDIOFOCUS_GAIN` with `USAGE_GAME` at the first note of the loop
  — not at start-up, since focus held over a silent menu is focus taken from
  whatever the player was listening to — and hands it back when the music
  stops. The plugin decides nothing: it passes Android's four changes
  through under their own names and `audio/focus.ts` answers them.
  - `lostTransient` (a call): stop, keep the focus, expect it back.
  - `gained`: resume, but only if the loop was wanted.
  - `lost`: stop and abandon; the music returns when the player brings it
    back, not by itself.
  - `ducked`: keep playing at `FOCUS_DUCK_GAIN`, because a notification
    should cost a dip and not a gap in the loop.
  - The page being hidden is still handled, and is still what the browser
    build has: it suspends the context and cuts every sounding voice.
    Effects still play at low volume with `mayDuck`.
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
  lost, win — for players who find layered feedback overwhelming. It is the
  `reducedAudio` setting, a row on the settings screen next to reduced
  motion, off by default, and it is not a mute: `sound` is the mute.

## 6. Production

**A cue is synthesised unless a recording is demonstrably better.**
Oscillators, noise bursts and envelopes through the Web Audio API —
`src/audio/synth.ts` holds one branch per row of the table in section 1, and
every cue keeps its voice even when it has a file.

The exceptions are listed in `SAMPLE_SOURCES` in `src/audio/samples.ts`, one
line each, and every one of them is a licence row in
`THIRD-PARTY-NOTICES.md`:

- **The arrow** is `public/audio/arrow.mp3`. Three synthesised attempts did
  not sound like an arrow, and at 9 KB the file costs less than the argument
  did. One recording covers every arrow that leaves the board, shaped per
  outcome in `SAMPLE_SHAPE`: a match plays it as it is, a destroyed block
  plays it lower and louder, and a shot that hit nothing plays it higher and
  quieter. Three files would have said the same thing three times, and an
  outcome that fell back to a synthesised voice was heard as the arrow
  sound going missing.
- **The music loop** is a file for the same reason (section 3), loaded by
  `src/audio/music.ts`.

A sampled cue is pitched by playback rate, so the combo ladder is unchanged:
one sound, five tiers, no second file. A file that is missing or will not
decode falls back to the synthesised voice without an error, which is also
what covers the first shot of a session while the file is still in flight.

This replaces the earlier plan of short mono OGG files with an M4A fallback.
The reasons it won:

- The ladder wanted one sound pitched five ways, which is what a synthesised
  voice is. A file would have been pitch-shifted at playback anyway.
- The audio budget was **under 1.5 MB** against the bundle ceiling
  (`CI.md` 2.3). Synthesis spends **zero bytes**, so music is no longer the
  first thing to compress when the bundle is tight.
- No third-party file means no licence to record, no attribution to ship and
  nothing to re-clear if a cue changes — the same reason nothing on the board
  is a sprite (`ART.md` 8).
- A cue is tuned by editing numbers in a file the tests can read, so the
  rules — the ladder, the heart's delay, the voice cap — are asserted in
  `tests/audio.test.ts` rather than trusted.

What is given up: the peel is a filtered noise crack, not a recording of an
arrow hitting wood. The music went this way already. If the peel is ever
judged too thin to be the sound people would tap for on its own, the fix is a
sample for that one cue and a licence line in `THIRD-PARTY-NOTICES.md` — the
rest of the set does not have to move with it.

The layout: `cues.ts` the set and its haptic pairings, `mixer.ts` the voice
cap, the rate limit and the ladder (pure, no Web Audio), `script.ts` which
cues a shot makes and how far apart, `synth.ts` the voices, `music.ts` the
loop, `engine.ts` the one `AudioContext`, the ducking and audio focus. The
context is created on the first cue, since a browser will not run one before
the player has touched the screen.
