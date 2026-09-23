# Arrow Crack — Art Direction

Everything here serves one requirement: **the board must be readable before
the tap.** Hearts are spent on misreads (`DESIGN.md` section 1.5), so
clarity is not a style preference in this game, it is the difficulty curve.
Any visual choice that trades legibility for mood loses.

Single **light** theme. One palette, calibrated once.

---

## 1. Direction: moulded candy, seen straight on

Shapes on a warm neutral board, viewed **at 90 degrees** — no perspective, no
tilt, no isometric angle. An arrow is a rounded coloured stroke; a block is a
rounded coloured tile. There are no side faces and no cast shadows, because a
board read at a glance should not ask the eye to resolve a fake third
dimension first.

What the board does have is one light, from above, and one edge treatment:

- **Every edge is the colour's own dark**, 34% of the way to black, and never
  ink. `edgeColour()` in `src/render/shapes.ts` owns that number, so an arrow,
  a block, a tail knob and a chevron cannot drift apart. Black outlines were
  what the board shipped with first; they read as a diagram, and the market
  this game sits in reads moulded plastic instead.
- **Every face is lit from above**: a single vertical ramp from 30% towards
  white at the top to 10% towards black at the bottom, applied to the whole
  shape rather than along its length, so a bend and a straight run are lit
  the same way.
- **No specular, no gloss, no ground shadow.** A white streak on a body is
  the first thing that turns a crowded tangle into noise, and a cast shadow
  in a board where paths cross constantly reads as a second arrow.

That edge does the job the ink used to: it keeps a pale colour (the yellow)
legible on a light board, and it separates two same-coloured arrows lying
side by side. It is the load-bearing part of this direction, not the
decoration on top of it.

Depth is not drawn beyond that edge. What sits under a block is shown as
**nested bands on the same plane**: thin rings of the coming layers hugging
the inside of the face, outermost first, so the order the player will meet
them reads from the outside in. It is a notation, and it is taught in one
level.

```
  ┌───────┐   ← the face: its colour, and its glyph in colour-blind mode
  │ ┌───┐ │   ← next layer, as a band inside the face
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

| Key | Name   | Hex       | Glyph    | Introduced |
| --- | ------ | --------- | -------- | ---------- |
| `v` | orange | `#E69F00` | triangle | level 1    |
| `b` | blue   | `#0072B2` | circle   | level 1    |
| `g` | green  | `#009E73` | square   | level 1    |
| `y` | yellow | `#F0E442` | diamond  | level 31   |
| `p` | purple | `#CC79A7` | cross    | level 50   |

Board `#F4EFE6`, ink `#1F1B16` (type, glyphs and HUD only — never an edge on
the board, section 1), damage red `#E63946`, disabled ink `#8A837A`. The data key stays `v` — it names the slot, not the hue, and
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
asserted in `tests/art-validation.test.ts`, and it is the reason colour-blind
mode draws the circle and the square at all.

The damage red is **not** separable from the purple arrow under tritanopia,
and no red is. That is a known, accepted cost of the wrong-tap state in
section 6: with colour-blind mode on, a player with that type reads the
mistake off the tail glyph, which the red never repaints.

Levels 1-30 use three colors, 31-49 four, 50+ five. Five is the hard
ceiling: a sixth color cannot be added without breaking separability for
someone.

### 2.2 Glyphs are colour-blind mode

Each color owns a shape, and **colour-blind mode** draws that shape on every
surface a match is made against: the arrow's tail knob and the block's top
face. With the mode on, the match the player is about to make is readable on
shape alone.

The **layer bands under the face carry colour only**. A band is a tenth of a
cell, which at the 32dp floor is under 4dp — a glyph there is a smudge, and
the deeper layers are a look-ahead rather than the match being made now. What
the next layer is becomes shape-readable the moment it surfaces.

With it off the board is **flat**: colour, silhouette and nothing else. The
arrow has no tail knob and no mark on it, the block face is bare, and the
whole board carries exactly one signal per surface. An embossed glyph under
every colour was tried first and was the wrong trade: it is either too faint
to match by — which is what the section 10 stills showed at the shipped cell
size — or loud enough to clutter a crowded tangle for the player who does not
need it. A mark that is the signal beats a mark that hedges.

So the shapes are printed at 0.22 of a cell in full ink, not embossed at 60%
alpha, and the mode is a row on the settings screen and a field in the save,
off by default. The cost is that the mode has to be **found**: it is named
plainly — "Colour-blind mode", not "high-contrast shapes" — the settings
screen is one tap from the level and from the board, and after three
wrong-colour taps the game names the setting once in a coach line
(`DESIGN.md` 6).

**The ink is picked per fill.** "Full ink" means the mark is the signal, not
which pigment it is: blue is the darkest fill in the set, and dark ink on it
measured 3.30 — the 10.1 grayscale still read blue and green as the same
unmarked knob. A glyph is drawn in whichever of the board colour and the ink
carries further against its own fill, which puts a paper-coloured mark on
blue and leaves every other colour inked. `glyphInk()` in `render/palette.ts`
is the one place that decides it.

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
breaks the separability the whole set was chosen for. **The edge is what
carries legibility, not the fill** (section 1), so the enforced rules are:

- **Ink against the board: ≥ 7:1.** Measured 14.95. It is what every glyph
  and every number on the board is drawn in, so it is the rule the readable
  half of the type rests on.
- **Every fill against the ink: ≥ 3:1**, so a glyph never sinks into the
  colour it sits on. The floor is blue at 3.30.
- **Every edge against its own fill**: an edge is the fill 34% of the way to
  black, which is 1.9:1 on the palette's lightest colour and more on the
  rest — enough to read as a moulded rim at a 32dp cell, and deliberately
  short of the ink's own contrast, because a rim that reads as a line is a
  black outline by another name.
- **Every glyph against its own fill: ≥ 4.5:1**, measured against the ink
  `glyphInk()` chooses for that fill rather than against the dark ink. A
  glyph is only ever drawn in colour-blind mode, where it is the signal
  rather than a hint under the colour, so it is held to text contrast and
  there is no second, weaker floor to keep. The embossed 0.60-alpha treatment
  this replaced sat at 2.20 on blue; dark ink on blue sat at 3.30, which
  passed the old 3:1 floor and still disappeared in the grayscale still. The
  worst case now is blue at 4.53, in paper rather than ink.
- Adjacent colours on the same block stack should differ in hue and, where
  the palette allows, in lightness. It cannot be a hard threshold: green
  against purple is 1.12, and both are on the board from level 50. **Grayscale
  separation is carried by the glyphs, not by lightness** — which is what
  colour-blind mode exists for.
  **The grayscale test is still the acceptance test, run with the mode on**:
  if a board is unplayable in grayscale with colour-blind mode on, the glyph
  work is not done. Without it, grayscale is expected to fail — colour is
  the only channel there by design.

The first three rules are asserted in `tests/layout.test.ts` and the glyph
rule in `tests/art-validation.test.ts`, so the palette cannot drift out of
them unnoticed.

---

## 3. Arrow anatomy

An arrow is a **tangled path**, not a chevron in a cell: a one-cell-wide
polyline with rounded bends and an arrowhead at one end. The reference form
is the interlocking-arrow maze look — a coloured stroke over a heavier stroke
of its own dark, generous corner radius, nothing filled.

Measurements, all as a fraction of the cell: **stroke 0.14**, **edge 0.05
each side** (so the backing is 0.24 wide), **chevron arm 0.34**, and, in
colour-blind mode only, **tail knob 0.30** carrying a **glyph 0.22**. The
chevron is longer than the backing is wide on purpose: arms
shorter than the line they end merge into a blob, and the V is the whole of
the direction signal. A one-cell arrow is drawn 0.72 of a cell long so a
shaft still shows once the head's inset is taken off it. The edge width is
asserted in `tests/art-validation.test.ts`, because the gutter between two
parallel runs is what it buys.

```
   ╭──────╮
   │  ╭───╯          tail: rounded cap; a knob with the glyph in
   │                        colour-blind mode
   │  │
   ╰──┤  ╭──▶        head: the only end with a point
      ╰──╯
```

- **Backing first.** Every arrow is drawn twice: the edge stroke in the
  colour's own dark, then the lit colour on top of it. Overlapping and
  adjacent paths therefore never merge. Two same-coloured arrows lying next
  to each other must still read as two objects — this is the single hardest
  legibility problem in the tangled form, and that edge is what solves it.
  The test that holds it names each arrow's own edge colour, not one ink.
- **The head is an open chevron**, the body's own line turning a corner, not
  a filled triangle stuck on the end. It is the only pointed end. Direction
  has to be readable at a glance in a screen full of bends.
- **The tail is rounded**, clearly not a head. Never a second point, never an
  ambiguous square end, and never fletching or barbs — anything pointed at
  the back is a second head to the eye. By default it is the pipe's own cap,
  so the arrow is one flat stroke end to end.
- **In colour-blind mode the cap widens into a knob** carrying the glyph. The
  knob is wider than the pipe because it is what the glyph is sized against:
  on the narrowest shipped board a cell is 32dp, so a glyph that had to fit
  the 0.14 pipe was under 4dp — present in the draw calls, absent to the eye.
  The section 10 grayscale and CVD stills are what caught that; the knob is
  the fix, and it strengthens the tail-against-head asymmetry rather than
  weakening it.
- **The glyph sits once, on the tail knob** — not repeated along the body,
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
  a dot at the centre, all in the arrow's own colour with a thin edge of that
  colour's dark between the rings. A small chevron still sits at the very tip, so a Bomb is read
  for direction exactly like every other arrow; the rings are what say it is
  a Bomb. No fuse, because a fuse is the first thing to vanish at 48 px.

None of the three is drawn with glow, sparkle or animation beyond the shared
idle bob. A piece that advertises itself louder than the board teaches
players to look for the shiny thing instead of reading the tangle.

### 3.2 Tracing the exit ray

Only the straight ray ahead of the head decides whether a shot is legal
(`DESIGN.md` section 1.4), so the art has to make that ray findable in a
tangle:

- **A hold leaves its line behind.** Press and hold an arrow and its ray is
  drawn from the head to the frame, the rim of its target block lifted — and it
  **stays** when the finger lifts. Holding that arrow again takes its line
  away; holding the empty board clears every line at once. Off by default, so
  a board is first met on its own terms, and cleared by a restart along with
  everything else the attempt had.
- **Several at once.** Lines are kept per arrow, not one at a time, because
  the question a hold answers is rarely about one arrow: which of these two
  do I fire first, and does firing that one free this one. Two rays up
  together answer it; a guide that could only ever show one would make the
  player hold each in turn and hold the comparison in their head.
- **A clear ray is a hairline that stops on the block it is aimed at**, in
  the arrow's own colour, with that block's rim lifting under it. The ray
  answers "what does this one hit", so it ends on the face that answers it —
  an earlier rule ran it through the frame and off the screen, which crossed
  the one thing the player was reading. Thin on purpose — it is a direction,
  not a piece, and the less ink it spends the less it argues with the tangle
  it crosses. With no target block on the ray — a Ghost through a hole in the
  frame — it runs off the screen instead, because a line stopping in mid-air
  reads as a blocked one.
- **A blocked ray is short, heavier and dashed**, in the disabled ink, and
  ends against the thing that stopped it rather than at the last clear cell —
  with the obstruction in the very next cell there is no clear cell to draw
  to, and the guide used to come out as a dot on the arrow's own head, which
  read as no guide at all on exactly the arrows that most need one. **The
  guide draws only the ray**: the arrows in the way are not lit while it is
  up. Where the line stops is what names them, and marking them as well
  turned a quiet answer into a board that highlights itself. The pulse in
  section 6.2 stays what it always was — the answer to a blocked **tap**,
  after the heart is spent, not something the guide does.
- This is free, always available, and not an ad-gated hint — it shows what
  the rules already say, not what the player should do.

This is what keeps "a blocked tap costs a heart" fair once bodies are long
enough to hide across half the board. The heart is charged for not looking,
never for not being able to see: one hold is the whole price of asking, and
the answer stays on the board until the player takes it down.

For a **Ghost** the guide draws straight through every obstruction to the
frame, which is how the player learns what it does without a text box. For a
**Joker** the target block's rim is lifted in the Joker's own banding rather
than in a colour, and for a **Bomb** the two neighbouring blocks lift too, so
the area effect is visible before the tap, not after. No block ever gains a
line it did not have: the rim it already owns is what brightens, so the guide
adds exactly one line to the board — its own ray.

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
  marker carrying that block's colour, and its glyph in colour-blind mode.
  The decision the game is about must never require zooming out to see.
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
second fires too, like any other tap. Ambiguity here is always resolved as
"do nothing" — the game can afford a missed tap; it cannot afford a heart
the player did not spend.

---

## 5. Block anatomy

- **Edge and face**: the block is its own dark, with the lit face inset into
  it by a tenth of the short side — the dark is a moulded rim, not a line
  drawn around a square. Corner radius is 0.44 of the short side, so a frame
  block is nearly a pill: roundness is what makes it read as moulded rather
  than as a panel. The face carries its glyph in colour-blind mode, and the
  top colour is never the thing that shrinks.
- **Layer bands**: each remaining layer is a thin ring inset from the face,
  on the same plane — never an offset slab, because nothing here is
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

| State             | Treatment                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle, fireable    | Full color, full outline, slow idle bob                                                                                                               |
| Hearts            | Filled hearts, never droplets or pips; a lost heart drains and stays visible as an empty outline, so the cost is legible at a glance                  |
| **Blocked**       | Drawn exactly like a fireable arrow. What stops it is read off the board, or off the hold guide, which stops at the obstruction                       |
| Press and hold    | Exit ray guide + target block outline (section 3.1)                                                                                                   |
| Firing            | The whole path slides out head-first along its own route, the tail following the head's track; slight squash on launch                                |
| Impact — match    | Block flashes white, the face breaks into shards, the band underneath becomes the face and settles with a small bounce                                |
| Impact — mismatch | Arrow recoils, hard shake, one heart drains with a distinct sound; the block does not move at all                                                     |
| **Wrong arrow**   | The body goes damage red and **stays red until the next arrow is tapped**. Same geometry, same weight: the colour is the whole state                  |
| Cracked           | One hairline across the face in the colour's own dark, half the weight of the edge — damage that does not shout over the colour it is matched against |
| Block destroyed   | Full shatter, the frame gap stays visible so the empty lane is obvious                                                                                |
| Stuck panel       | Board dims, no failure language — "No moves left", free restart                                                                                       |
| Combo step up     | Multiplier badge grows and pulses, floating score off the peeled block. **No text over the board** (`PROGRESSION.md` 2.1)                             |
| Combo break       | Badge shrinks back to x1. No sting, no red — the heart already delivered the bad news                                                                 |
| Timed level       | A clock replaces the hearts in the HUD; under 10 seconds it pulses. Never a heartbeat sound stacked on the music                                      |

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
  The tail knob is never repainted, so in colour-blind mode what colour the
  arrow actually is stays readable underneath the state.

This is not the blocked treatment. A blocked arrow has not cost anything yet,
and section 6.1 still applies to it.

### 6.0.1 A block breaks when the arrow arrives, not when it is tapped

The reducer resolves the whole shot the instant the tap lands, but the player
has not seen anything hit yet. So for as long as the body is sliding the
target is drawn exactly as it was — its layers intact, and a block the shot
destroyed still on the frame — and it comes apart on the impact frame. The
sound of it waits for the same moment (`AUDIO.md` 1): a break heard or seen
while the arrow is still in the air reads as the tap breaking the block, which
is not what the rules say happened.

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

When a blocked arrow is tapped, it runs down its own lane into the piece that
is in its way, is stopped by it and slides back home shaking — it is never
seen to fail without moving — and the arrow (or arrows) actually blocking it
pulse once along the path. The life is still spent — but the player learns
_why_, instead of concluding the game is arbitrary. This costs nothing, is
not gated behind an ad, and is what turns the harshest rule into a teachable
one.

---

## 7. Motion

Fast, because the player taps in sequences.

| Event                                   | Duration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrow slide (per cell the head crosses) | **100 ms a cell, and nothing else**. One speed everywhere: no cap, and the body's own length is not counted. Both of those made an arrow's speed depend on where it stood and how long it was, and two arrows crossing the same gap at different speeds read as the game hesitating. The longest lane on any shipped board is 8 cells, so the worst shot is 800 ms and the turn is still protected. A **blocked** arrow crosses only the cells it can and stops on the obstruction. Linear is not a detail either: the slide was drawn on an ease-out curve, which is two thirds of the way across in the first third of the phase, so the arrow shot and then crawled, and lengthening the phase only lengthened the crawl |
| Impact and peel                         | 180 ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mismatch recoil                         | 220 ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Block shatter                           | 320 ms — six blunt shards, mixed sizes, fading by `1 − t²`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Star reveal                             | 3 × 200 ms, staggered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Commentary line on the win panel        | 250 ms fade in, after the score count-up                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Score count-up                          | 600 ms, easing out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Confetti burst                          | 900 ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Input is not locked during playback: a tap that lands while another shot is
still on its way is played alongside it (`DESIGN.md` section 5). Every end panel — won, lost, out of time, stuck —
waits for the shot that ended the level to land. The rules resolve the whole
outcome at the tap, so a level that ends on a tap reports it twice, once at
the tap and once when the animation finishes; the panel belongs to the
second one, when the player has actually seen the block come apart. A **reduced-motion** setting cuts every duration to
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

The stills the eye half reads are produced by `npm run art:shoot` (see
`tools/shoot.ts`), which drives a headless Chrome at the 360dp phone and
applies the filter to the page, so what is judged is what the renderer draws:

```
npm run dev
npm run art:shoot -- --level 67 --filter grayscale --out shot.png
```

Filters: `grayscale`, `protanopia`, `deuteranopia`, `tritanopia`, and
`--colour-blind` to read the board with the accessibility setting on. Level
67 is the densest shipped board, which is the one test 1 asks for. A run of
that pass is what moved the glyph from the pipe onto the tail knob.

1. **Grayscale test.** Screenshot the hardest board with `--colour-blind`,
   desaturate it, play it. If layers or matches become ambiguous, the glyph
   work is not done. The same board without the flag is expected to be
   unplayable in grayscale: there, colour is the only channel on purpose.
2. **CVD simulation.** Same board through protanopia, deuteranopia and
   tritanopia filters, with the mode on and off — off, the section 2.1
   separation figures are what is being checked.
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
   the theme is light and the edges are heavy.

### 10.7 Pass log

A pass is recorded here with what it changed, so a later reader can tell a
rule that was argued from one that was merely inherited.

**2026-09-24 — the candy direction, on stills and on a device.** Level 67
through all five filters, with the mode on and off, plus a debug build played
on a POT-LX1 (1080x2340 at 480dpi, which is exactly the 360dp phone 10.4 is
written against).

- **10.1 grayscale, mode on: failed, then fixed.** Blue and green both read
  as an unmarked dark knob — the glyph was drawn in ink on every fill, and on
  blue that is 3.30, which survives a contrast table and not a screenshot.
  The ink is now chosen per fill (`glyphInk()`, section 2.2), the floor is
  4.5, and the re-shot still separates all five.
- **10.2 CVD.** With the mode on, all three filters are readable on shape.
  With the mode **off**, tritanopia collapses the palette to two families —
  yellow, orange and purple all read red-pink, blue and green both read teal.
  This is accepted rather than fixed: the Okabe-Ito set is chosen for the two
  common types, and re-tuning it for the rarest one costs the separation the
  other two rely on. **The cost is paid by the setting being found**, which
  is why the game now names it after three wrong-colour taps (`DESIGN.md` 6).
- **10.4 small screen: passes, with no room spare.** The cell on level 67 at
  360dp is ~33dp against a 32dp floor. The vertical space left over is not
  slack the board can take: the grid is square and the phone is 20:9, so the
  cell is width-bound. It is the ceiling on board size, not on cell size.
- **10.5 tangle.** No ambiguity found on 67 in either mode.
- **On the device**: taps, the win panel, stars and the commentary line all
  behave as in Chrome; a 250ms swipe across an arrow pans and does not fire,
  so 4.1 holds under a real finger; the audio engine holds a started AAudio
  stream, so the synthesised set reaches the speaker from a WebView.
- **Still outstanding, both needing a person**: 10.3 (a new player naming the
  blocker from the guide alone) and 10.6 (sunlight). Neither is a code
  change, and neither blocks milestone 8.
- **Found here, fixed since**: the game took no Android **audio focus** —
  Web Audio in a WebView does not request it, so music from another app was
  not ducked and ours did not pause for a call. It now holds focus through
  `AudioFocusPlugin` in `android/` (`AUDIO.md` 4). The focus request is
  confirmed on the device; the loss and duck paths are covered by tests and
  still want a real call to hear.
