# Arrow Crack — Art Direction

Everything here serves one requirement: **the board must be readable before
the tap.** Hearts are spent on misreads (`DESIGN.md` section 1.5), so
clarity is not a style preference in this game, it is the difficulty curve.
Any visual choice that trades legibility for mood loses.

Single **light** theme. One palette, calibrated once.

---

## 1. Direction: flat, seen straight on

Flat shapes on a warm neutral board, viewed **at 90 degrees** — no
perspective, no tilt, no isometric angle, and nothing drawn with thickness.
An arrow is a coloured line; a block is a coloured square. There are no side
faces and no offset slabs, because a board read at a glance should not ask
the eye to resolve a fake third dimension first.

Depth is therefore never drawn. What sits under a block is shown as **nested
bands on the same plane**: thin rings of the coming layers hugging the inside
of the outline, outermost first, so the order the player will meet them reads
from the outside in. It is a notation, and it is taught in one level.

The dark ink is not decoration. Every coloured line is drawn over a heavier
ink line, and every block face is outlined in it. That ink is what keeps a
pale colour (the yellow) legible on a light board, and what separates two
same-coloured arrows lying side by side.

```
  ┌───────┐   ← the face: its colour, its glyph
  │ ┌───┐ │   ← next layer, as a band inside the outline
  │ │ ▲ │ │
  │ └───┘ │
  └───────┘
```

---

## 2. Color system

The single most important system in the game. Color carries the rule, so it
is never the only channel carrying it.

### 2.1 Palette

Built on the Okabe-Ito colorblind-safe set, which is separable under
protanopia, deuteranopia and tritanopia — not merely "tested afterwards".

| Key | Name       | Hex       | Glyph    | Introduced |
| --- | ---------- | --------- | -------- | ---------- |
| `v` | orange     | `#E69F00` | triangle | level 1    |
| `b` | blue       | `#0072B2` | circle   | level 1    |
| `g` | green      | `#009E73` | square   | level 1    |
| `y` | yellow     | `#F0E442` | diamond  | level 31   |
| `p` | purple     | `#CC79A7` | cross    | level 50   |

Board `#F4EFE6`, outline/ink `#1F1B16`, damage red `#E63946`, disabled ink
`#8A837A`. The data key stays `v` — it names the slot, not the hue, and
renaming it would rewrite eighty level files to say nothing new.

**Red is never an arrow colour.** It carries the two damage signals and
nothing else: the hearts, and an arrow that was tapped wrong (section 6).
Vermillion `#D55E00` used to be both an arrow and the heart; it is gone from
the game, because a colour that is a rule and a warning at once is neither.
That is also what the tritanopia measurement below is about: under that type
`#D55E00` and the purple arrow collapse onto each other (ΔE 0.9), which a
permanent red state cannot survive.

The first three are the maximally separable triad for the two common CVD
types: simulated, the closest pair of them sits at ΔE 51 under protanopia and
ΔE 60 under deuteranopia. Under **tritanopia** blue and green come within
ΔE 14 — still distinguishable, but that pair is read off the circle and the
square there rather than off the colour. That is the measured floor, it is
asserted in `tests/art-validation.test.ts`, and it is the reason the glyphs
are not a toggle.

The damage red is **not** separable from the purple arrow under tritanopia,
and no red is. That is a known, accepted cost of the wrong-tap state in
section 6: a player with that type reads the mistake off the tail glyph,
which the red never replaces.

Levels 1-30 use three colors, 31-49 four, 50+ five. Five is the hard
ceiling: a sixth color cannot be added without breaking separability for
someone.

### 2.2 Glyphs are always on

Each color owns a shape, and that shape appears on **every** surface that
carries the color: the arrow body, the block's top face, and each visible
layer edge. Matching is therefore possible on shape alone.

This is **not** a colorblind toggle. A mode buried in settings means the
default experience is unreadable for roughly one in twelve men, who will
churn before they find the switch. The glyphs are drawn small, embossed and
low-contrast against their own fill, so a player with normal color vision
reads color first and never notices the redundancy.

What a settings toggle _does_ offer is **high-contrast glyphs**: same
shapes, drawn 30% larger and in full ink rather than embossed at 45%. That is
the accessibility option — turning the redundancy up, not turning it on. It
is a row on the settings screen and a field in the save, off by default.

### 2.3 Contrast rules

Measured against board `#F4EFE6` and ink `#1F1B16`:

| Colour     | vs board | vs ink |
| ---------- | -------- | ------ |
| orange     | 1.97     | 7.60   |
| blue       | 4.53     | 3.30   |
| green      | 2.99     | 5.00   |
| yellow     | **1.15** | 12.95  |
| purple     | 2.67     | 5.59   |
| damage red | 3.64     | 4.11   |

Those numbers settle an earlier rule that could not be met. A fill-against-
board minimum of 3:1 is impossible for the Okabe-Ito yellow on a light board —
it is a pale colour by construction, and darkening it far enough to pass
breaks the separability the whole set was chosen for. **The ink outline is
what carries legibility, not the fill** (section 1), so the enforced rules
are:

- **Ink against the board: ≥ 7:1.** Measured 14.95. This is the rule the
  board's readability actually rests on, and it holds for every colour
  because every shape is outlined.
- **Every fill against the ink: ≥ 3:1**, so a heavy outline never swallows
  the colour it surrounds. The floor is blue at 3.30.
- Every glyph against its own fill: ≥ 3:1 in high-contrast mode, ≥ 1.8:1 in
  the default embossed treatment.
- Adjacent colours on the same block stack should differ in hue and, where
  the palette allows, in lightness. It cannot be a hard threshold: green
  against purple is 1.12, and both are on the board from level 50. **Grayscale
  separation is carried by the glyphs, not by lightness** — which is exactly
  why they are always on and never a toggle.
  **The grayscale test is still the acceptance test**: if a board is
  unplayable in grayscale, the glyph work is not done.

The first three rules are asserted in `tests/layout.test.ts`, so the palette
cannot drift out of them unnoticed.

---

## 3. Arrow anatomy

An arrow is a **tangled path**, not a chevron in a cell: a one-cell-wide
polyline with rounded bends and an arrowhead at one end, drawn as a flat
line. The reference form is the interlocking-arrow maze look — a coloured
stroke over a heavier ink stroke, generous corner radius, nothing filled.

Measurements, all as a fraction of the cell: **stroke 0.14**, **ink edge 0.05
each side** (so the backing is 0.24 wide), **chevron arm 0.34**, **tail glyph
0.10**. The chevron is longer than the backing is wide on purpose: arms
shorter than the line they end merge into a blob, and the V is the whole of
the direction signal. A one-cell arrow is drawn 0.72 of a cell long so a
shaft still shows once the head's inset is taken off it. The ink edge is
asserted in `tests/art-validation.test.ts`, because the gutter between two
parallel runs is what it buys.

```
   ╭──────╮
   │  ╭───╯          tail: rounded cap, glyph sits here
   │  │
   ╰──┤  ╭──▶        head: the only end with a point
      ╰──╯
```

- **Backing first.** Every arrow is drawn twice: the ink stroke, then the
  colour on top of it. Overlapping and adjacent paths therefore never merge.
  Two same-coloured arrows lying next to each other must still read as two
  objects — this is the single hardest legibility problem in the tangled
  form, and that ink edge is what solves it.
- **The head is an open chevron**, the body's own line turning a corner, not
  a filled triangle stuck on the end. It is the only pointed end. Direction
  has to be readable at a glance in a screen full of bends.
- **The tail is a rounded cap**, clearly not a head. Never a second point,
  never an ambiguous square end, and never fletching or barbs — anything
  pointed at the back is a second head to the eye.
- **The glyph sits once, near the tail** — not repeated along the body,
  which would turn a crowded board into noise. Colour reads from the whole
  pipe; shape reads from one stable spot per arrow.
- **Bends are rounded**, following the pipe's centre line, so the eye can
  trace a path around corners without losing it under a crossing neighbour.
- Stroke plus backing is 24% of a cell, leaving a wide gutter between
  parallel runs. If two parallel paths ever touch, the cell is too small.
- **Tap target is the whole path**, every cell of it — which makes these
  arrows far easier to hit than single-cell ones. The minimum 48dp rule
  applies to the cell, and the path is many cells.

### 3.1 Special arrows

Three specials (`DESIGN.md` 1.11), each of which must be identifiable in a
crowded tangle at a glance and in grayscale:

- **Joker** — the pipe carries every palette colour as a repeating band, and
  the head glyph is all five shapes overlapped into one mark. It reads as
  "this one is not any colour" rather than as a sixth colour, which is the
  whole point.
- **Ghost** — the fill is translucent and the outline is dashed rather than
  solid. It is the only arrow whose outline is not continuous, so the
  exception it embodies is visible in its silhouette. The dash is also what
  survives grayscale.
- **Bomb** — a bullseye at the head: a filled disc, a lighter ring inside it,
  a dot at the centre, all in the arrow's own colour with thin ink between
  the rings. A small chevron still sits at the very tip, so a Bomb is read
  for direction exactly like every other arrow; the rings are what say it is
  a Bomb. No fuse, because a fuse is the first thing to vanish at 48 px.

None of the three is drawn with glow, sparkle or animation beyond the shared
idle bob. A piece that advertises itself louder than the board teaches
players to look for the shiny thing instead of reading the tangle.

### 3.2 Tracing the exit ray

Only the straight ray ahead of the head decides whether a shot is legal
(`DESIGN.md` section 1.4), so the art has to make that ray findable in a
tangle:

- On press-and-hold, the ray from the head to the frame is drawn as a faint
  guide, and the target block is outlined. This is free, always available,
  and not an ad-gated hint — it shows what the rules already say, not what
  the player should do.
- When the ray is clear, the guide is drawn in the arrow's own colour and
  the target block lifts slightly. When it is blocked, the guide stops at
  the obstruction and the blocking arrow gets the pulse from section 6.2.

This is what keeps "a blocked tap costs a heart" fair once bodies are long
enough to hide across half the board.

For a **Ghost** the guide draws straight through every obstruction to the
frame, which is how the player learns what it does without a text box. For a
**Joker** the target block is outlined in the Joker's own banding rather than
a colour, and for a **Bomb** the two neighbouring blocks are outlined too, so
the area effect is visible before the tap, not after.

---

## 4. Camera: zoom and pan

A 9x9 tangle on a 360dp phone is legible but tight, and a player who wants to
trace a long body will want to lean in. The board behaves like a photo.

- **Pinch to zoom**, 1x to 3x. **Double-tap** toggles between fit and 2x,
  centred on the tapped point. **Drag to pan** while zoomed. Pan is clamped
  so the board plus its frame can never be pushed fully off screen.
- Zoom resets to fit on level start, on restart, and when the win or fail
  panel opens. Nobody should meet a celebration through a zoomed corner.
- **The frame stays reachable.** Zoomed in, the target block for a
  long-pressed arrow may be off screen, so the exit-ray guide ends in an edge
  marker carrying that block's colour and glyph. The decision the game is
  about must never require zooming out to see.
- A small "fit" button appears whenever the view is not at fit. One tap back,
  always.

### 4.1 Gestures must never cost a heart

This is the one hard requirement. Firing is a tap, and a heart is spent on a
misfire, so a pan that is mistaken for a tap is a stolen heart.

| Gesture        | Rule                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Fire           | Touch lifts within **250 ms** and has moved less than **8 dp**                                   |
| Pan            | Any touch that moves past 8 dp — it stops being a candidate to fire, permanently, for that touch |
| Exit-ray guide | Touch held past 250 ms without moving (section 3.2)                                              |
| Zoom           | Two fingers, or a double tap                                                                     |

A touch that becomes a pan can never turn back into a fire, even if the
finger returns to where it started.

**Double tap and fire cannot share a target.** Firing happens on the first
tap, with no delay — waiting 300 ms to see whether a second tap arrives would
put that delay on every shot in the game. So a double tap zooms only where
there is no arrow; on an arrow, the first tap has already fired and the
second is queued behind the animation like any other tap. Ambiguity here is always resolved as
"do nothing" — the game can afford a missed tap; it cannot afford a heart
the player did not spend.

---

## 5. Block anatomy

- **Face**: the current colour, full saturation, with its glyph, owning the
  whole square. The top colour is never the thing that shrinks.
- **Layer bands**: each remaining layer is a thin ring inset from the
  outline, on the same plane — never an offset slab, because nothing here is
  drawn with thickness (section 1). Two visible bands maximum; deeper stacks
  carry a count badge (`+2`) rather than an unreadable ring sandwich.
- **Wide blocks** are drawn as a single face spanning their lanes, with the
  lane divisions marked only on the board side — so it reads as one object
  that several lanes feed, which is exactly the rule.
- The frame sits outside the grid with a visible gap, so "on the board" and
  "on the frame" are never ambiguous.
- **Open lanes** (no block, including every lane a shaped board does not
  reach) are drawn as a plain gap in the frame — nothing ghosted, nothing
  that could be mistaken for a block already broken. On a shaped level the
  frame therefore traces the silhouette's outline, which is most of what
  makes those boards look designed rather than clipped.

---

## 6. States

The state table is the readability contract. Every state is distinguishable
without colour — with one deliberate exception, the wrong tap, which is
colour and nothing else.

| State             | Treatment                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Idle, fireable    | Full color, full outline, slow idle bob                                                                                              |
| Hearts            | Filled hearts, never droplets or pips; a lost heart drains and stays visible as an empty outline, so the cost is legible at a glance |
| **Blocked**       | Drawn exactly like a fireable arrow. What stops it is read off the board, or off the hold guide, which stops at the obstruction      |
| Press and hold    | Exit ray guide + target block outline (section 3.1)                                                                                  |
| Firing            | The whole path slides out head-first along its own route, the tail following the head's track; slight squash on launch               |
| Impact — match    | Block flashes white, the face breaks into shards, the band underneath becomes the face and settles with a small bounce               |
| Impact — mismatch | Arrow recoils, hard shake, one heart drains with a distinct sound; the block does not move at all                                    |
| **Wrong arrow**   | The body goes damage red and **stays red until the next arrow is tapped**. Same geometry, same weight: the colour is the whole state |
| Cracked           | One ink hairline across the face, half the weight of the outline — damage that does not shout over the colour it is matched against  |
| Block destroyed   | Full shatter, the frame gap stays visible so the empty lane is obvious                                                               |
| Stuck panel       | Board dims, no failure language — "No moves left", free restart                                                                      |
| Combo step up     | Multiplier badge grows and pulses, floating score off the peeled block. **No text over the board** (`PROGRESSION.md` 2.1)            |
| Combo break       | Badge shrinks back to x1. No sting, no red — the heart already delivered the bad news                                                |
| Timed level       | A clock replaces the hearts in the HUD; under 10 seconds it pulses. Never a heartbeat sound stacked on the music                     |

### 6.0 The wrong arrow stays red

A wrong tap is the one thing in this game that costs something, and 220 ms of
recoil is gone before a player who looked away has seen it. So the arrow that
was tapped wrong is repainted in the damage red and **holds** it: the mistake
is still on the board when the player looks back, and it clears the moment
any arrow is tapped, including that same one. It marks the last wrong tap; it
never disables a piece.

Two costs, both accepted on purpose:

- **It is the one state that does not survive greyscale.** Everything else in
  this table is shape. The wrong arrow is colour alone, because a badge on a
  live board is one more thing to read before a tap.
- **No red separates from the purple arrow under tritanopia** (section 2.1).
  The tail glyph is never repainted, so what colour the arrow actually is
  stays readable underneath the state.

This is not the blocked treatment. A blocked arrow has not cost anything yet,
and section 6.1 still applies to it.

### 6.1 A blocked arrow is not marked

A blocked tap costs a heart, and being blocked is still something the
player has to see before tapping — but it is read off the board itself: the
obstruction is drawn right there on the ray, and the press-and-hold guide
(section 3.2) stops at it, free and always available. The arrow is drawn in
full colour like any other.

The earlier rule desaturated a blocked arrow. It was dropped because a
board full of drained colours reads as broken rather than as informative,
and because the colour of an arrow is a rule in this game: dimming it
fights the one channel the player has to match against the frame.

If the data says this is wrong — `blocked_tap` sustained above the
threshold in `TELEMETRY.md` 3.1 — the fix is a stronger guide and a wider
tap tolerance before any treatment is put back on the arrow itself.

### 6.2 Blocker highlight (mercy, not a hint)

When a blocked arrow is tapped, the arrow (or arrows) actually blocking it
pulse once along the path. The life is still spent — but the player learns
_why_, instead of concluding the game is arbitrary. This costs nothing, is
not gated behind an ad, and is what turns the harshest rule into a teachable
one.

---

## 7. Motion

Fast, because the player taps in sequences.

| Event                                    | Duration                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Arrow slide (per cell of path travelled) | 40 ms, linear, capped at 500 ms total so a long body never stalls the turn |
| Impact and peel                          | 180 ms                                                                     |
| Mismatch recoil                          | 220 ms                                                                     |
| Block shatter                            | 320 ms — six blunt shards, mixed sizes, fading by `1 − t²`                 |
| Star reveal                              | 3 × 200 ms, staggered                                                      |
| Commentary line on the win panel         | 250 ms fade in, after the score count-up                                   |
| Score count-up                           | 600 ms, easing out                                                         |
| Confetti burst                           | 900 ms                                                                     |

Input is locked during playback, and at most one tap is queued
(`DESIGN.md` section 5). A **reduced-motion** setting cuts every duration to
the impact frame only and disables the idle bob, particles and confetti; it
never changes what is legible, and the win panel's text still appears — it
carries information, not just motion.

It is read from two places and either is enough: the device's
`prefers-reduced-motion`, which is honoured without asking, and a settings
row, for a phone that does not carry the preference and for a player who
wants it in this game only. The switch can add to the device preference; it
can never override it.

**Nothing celebratory is ever drawn over a live board.** A line of text that
hides the arrow the player was about to tap costs a heart, which is the one
thing a celebration must never do. All words wait for the win panel.

---

## 8. Production

**Everything on the board is drawn procedurally on canvas — no sprite
atlas.** Blocks, arrows, glyphs and particles are geometry plus fills, so:

- color and glyph are parameters, not assets — adding the fifth color is a
  table entry, not five new PNGs per state;
- it is resolution-independent, so no @2x/@3x sets and no atlas tooling;
- the bundle stays tiny, which matters because the level JSON grows
  (`CI.md` section 2.3).

Hand-made assets are limited to: the app icon, the store feature graphic,
and any character or logo work. Those are the only files that need an
image pipeline.

Procedural drawing also makes **alternate palettes** nearly free, which the
reference game ships as a top-bar theme switcher (`REFERENCE.md` 2). If
palettes are ever added as a cosmetic reward, each one must pass section
2.3's contrast rules and section 9's grayscale and CVD tests before it can
be selected — in this game colour carries a rule, so an unvalidated theme is
a broken game, not a style option.

Typography: one rounded sans across UI and numerals (Nunito is already
vendored in the studio's web stack), one weight for body, one for the HUD
counters. Numerals must be tabular so the heart count and level number do
not jitter.

---

## 9. Store assets

Icon, feature graphic and screenshots follow the studio rule: they are
**never committed to this repo.** Local originals live in the gitignored
`docs/store-assets-originals/`, mirrored to the private
`Eren-Ozcan/pictures` repo under `pictures/arrow-crack/`. This is repeated
in the project's `CLAUDE.md`.

The icon has to work at 48px: one block being cracked by one arrow, the two
maximally separable colours (orange arrow, blue block), heavy ink, no text. **Not a tangle of arrows** — that is the reference game's icon and
loses the comparison on sight (`REFERENCE.md` 4).

Every screenshot leads with the frame: a mid-game board showing a layered
stack mid-peel or a wide block. A screenshot of arrows alone is
indistinguishable from the incumbent's in a search result list.

---

## 10. Validation

Before any art is called done. Tests 1, 2, 4 and 5 are mechanical and run in
`tests/art-validation.test.ts` — they assert the numbers the eye test rests
on, so a palette or layout change that breaks one fails CI rather than a
playtest. Tests 3 and 6 need a person and a device, and the file asserts only
what can be asserted without one.

1. **Grayscale test.** Screenshot the hardest board, desaturate it, play it.
   If layers or matches become ambiguous, the glyph work is not done.
2. **CVD simulation.** Same board through protanopia, deuteranopia and
   tritanopia filters.
3. **Blocked-arrow test.** A player who has not seen the game holds an
   arrow whose path is blocked and can say, from the guide alone, what is
   stopping it.
4. **Small-screen test.** 360dp-wide device, the most crowded shipped board:
   no horizontal scroll, HUD not overlapping the frame, and **the cell at or
   above 32dp**.

   A 48dp _cell_ is not reachable and never was: 8 cells plus the frame need
   more than 360dp, so the earlier wording contradicted section 4's own "a
   9x9 tangle on a 360dp phone is legible but tight". What carries the 48dp
   rule instead is what section 3 already says — **the tap target is the
   whole path**, every cell of it, and the zoom is one double-tap away. The
   32dp floor is what the layout must hold; a level that would break it is
   too big, not the phone too small.

   The one case the path does not cover is a single-cell arrow, which is its
   own tap target at cell size. There are 19 of those across the 80 shipped
   levels. They are the reason the floor is a floor and not a preference, and
   the reason a future board may not grow past 8x8.
5. **Tangle test.** Two same-colored arrows running parallel and adjacent,
   and one arrow's body crossing between another's head and the frame. Both
   must be unambiguous in a still screenshot. This is the failure mode the
   path form introduces and the one most likely to be missed in motion.
6. **Sunlight test.** Real phone, outdoors, at 50% brightness — the reason
   the theme is light and the outlines are heavy.
