# Drop the music loop here

The game looks for `music.ogg`, then `music.m4a`, then `music.mp3`, and plays
the first one it finds, looped, on the music bus (`AUDIO.md` 3). Nothing else
in the project is a media file: the cue set is synthesised
(`src/audio/synth.ts`), and this bed is the one exception, because two
generated beds were tried and neither held up in play.

What the file has to be:

- **Calm and unobtrusive**, and it has to survive being looped for the length
  of a session. It is ducked under every impact, so it must not fight the
  cues for the same frequencies — nothing with a hard transient of its own.
- **Seamless at the loop point.** The loop is a plain `loop = true`; there is
  no crossfade to hide a seam.
- Royalty-free or licensed for this use. **Record it in
  `THIRD-PARTY-NOTICES.md` in the same change that adds it** — component,
  version, licence, source URL.
- Small. The bundle budget is 600 KB total (`CI.md` 2.3) and
  `npm run size` counts JS and CSS only, so an audio file that pushes the
  install size has to be justified on its own. Mono, and compressed hard.

Until a file is here the game is simply silent between cues, and the Music
row in settings still works — it just has nothing to turn on.
