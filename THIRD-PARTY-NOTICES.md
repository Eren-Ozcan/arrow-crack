# Third-party notices

Every runtime dependency and every bundled asset (audio, font, image) is
added here **when it is added to the project**, not at release time.

| Component                                                      | Version               | License                                                       | Source                                          | Notes                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@capacitor/core`                                              | 7.6.9                 | MIT                                                           | https://github.com/ionic-team/capacitor         | The native bridge. Ships in the Android build; no code from it is bundled into the web build beyond the platform check                                                                                                                                                    |
| `@capacitor/app`                                               | 7.1.2                 | MIT                                                           | https://github.com/ionic-team/capacitor-plugins | The Android back button and app lifecycle (`ADS.md` 1.1)                                                                                                                                                                                                                  |
| `public/audio/music.mp3`                                       | generated 2026-09-23  | Studio-owned output, generated with Google Flow Music (Lyria) | —                                               | The music bed. Extracted from the tool's video export, summed to mono, seam-crossfaded into a 19.65 s loop and normalised to -23 LUFS. **Check the generating tool's current output-ownership terms before the store release** and record the answer here                 |
| `public/audio/music.mp3` (Light & Warm Logic Loop)             | generated 2026-09-23  | Studio-owned output, generated with Google Flow Music (Lyria) | —                                               | The music bed. Seconds 40-100 of the 163 s generation, summed to mono, seam-crossfaded into a 60 s loop, normalised to -23 LUFS, 80 kbps. **Confirm the generating tool's output-ownership and commercial-use terms before the store release** and record the answer here |
| `public/audio/arrow.mp3` (Wind Swoosh Short, freesoundeffects) | downloaded 2026-09-23 | Pixabay Content License                                       | https://pixabay.com/sound-effects/ (id 289744)  | The arrow cue. Summed to mono, 8 ms fade-in, +6 dB into a limiter and a short tail fade. Free for commercial use, no attribution required; recorded here anyway because this table is the record of what is bundled                                                       |

The board is drawn procedurally (`ART.md` 8) and the cue set is synthesised
at playback (`AUDIO.md` 6), so the table above is short by design: it holds
the cues that are a recorded file because the recording beat the code, and
nothing else.

Both audio files live in `public/audio/`; `public/audio/README.md` states
what a replacement has to be.
