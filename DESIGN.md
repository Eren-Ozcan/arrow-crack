# Arrow Crack — Design Document

A tap-only puzzle game. A grid holds a tangle of long, bent, colored arrows,
and a rectangular frame of colored, layered blocks surrounds it. Tap an arrow
and it slides out along its own path, head first, into the block on its lane.
Fire them in the right order to break every block on the frame.

Store title: **Arrow Crack Arrow Pop Puzzle** — 28 characters, inside Google
Play's 30-character limit. In-app and in conversation the game is called
**Arrow Crack**; the long form exists for store search.

---

## 1. Core rules

### 1.1 Board

- The board is a grid of `cols x rows` cells (typical: 6x6 up to 9x9 — the
  grid is denser than a one-cell-per-arrow game because arrows are long).
- An **arrow** is a **path**: a one-cell-wide polyline of connected cells
  with bends, ending in an arrowhead. This is the tangled-arrow form of the
  reference art, not a single-cell chevron.
- An arrow has a **head cell** and a **head direction**
  (`up | down | left | right`, the direction of its final segment), a
  **body** of 1..N further cells trailing back from the head, and a
  **color** (one of the level palette, 3-5 colors).
- A cell is empty or belongs to exactly one arrow. Arrows interlock and wrap
  around each other; that tangle is the puzzle.
- The grid is surrounded by a **frame**: four sides, each side made of
  **blocks**.

### 1.2 Lanes

- A **lane** is a row (for the left/right sides) or a column (for the
  top/bottom sides). A board of 5 columns and 4 rows has 5 vertical lanes
  and 4 horizontal lanes.
- An arrow's lane is decided by its **head** alone — the head's row when it
  faces left or right, its column when it faces up or down. The body's shape
  never affects which block gets hit, only whether the shot is possible.
- Every frame block covers a contiguous span of 1..N lanes on one side. A
  block spanning more than one lane is a **wide block**; arrows exiting from
  any of its covered lanes hit the same block.
- A lane position is either covered by exactly one block or left **open**.
  An arrow exiting on an open lane simply flies off the board: free, no
  impact, and the arrow is gone. Open lanes are what make shaped boards
  possible (section 1.10); on a normal rectangular level every lane is
  covered.

### 1.3 Blocks

- A block holds a **layer stack**: an ordered list of colors, top first
  (e.g. `[red, blue, green]`).
- The visible color is the top layer. Lower layers show as slab edges along
  the block's inner side so the player can plan ahead (`ART.md` section 5).
- Peeling the top layer reveals the next. A block with an empty stack is
  **destroyed** and removed from the frame.

### 1.4 Tap = fire

Tapping an arrow attempts to fire it along its direction.

An arrow moves **along its own shape**, head first: the head advances
straight in its facing direction, and every body cell follows the exact
route the head traced, like a train on its own track. The body therefore
only ever travels through cells the arrow already occupied, so nothing
behind the head can ever block it.

1. **Path check.** Walk the straight ray from the head cell in the head
   direction to the board edge. If any cell on that ray belongs to another
   arrow, the shot is **blocked**: the arrow shakes in place, the board does
   not change, and the player **loses one heart**. Tapping an arrow that
   cannot move is a mistake, exactly like firing the wrong color.
   _Only the ray ahead of the head matters._ A long, badly tangled body is
   never itself an obstacle — but it is what other arrows run into.
2. **Exit.** If the ray is clear, the whole arrow slides out along its path,
   head first, and flies toward the frame block covering its lane.
   - If the block on that lane is already destroyed, the arrow flies off
     screen and is removed from the board. Free, and a legitimate way to
     clear a blocker — but the arrow is gone for good (see 1.7).
3. **Impact.**
   - **Color match** (arrow color equals the block top layer color): the top
     layer is peeled. The arrow is consumed and removed from the board.
   - **Color mismatch**: the arrow bounces and slides back along its own
     path into exactly the cells and shape it started from. Nothing on the
     frame changes, and the player **loses one heart**. Because the board
     always returns to its previous state, an arrow is only ever fully on
     the board or fully gone — there is no partial position to model.
4. **Win** when every block on the frame is destroyed.
5. **Lose** when the last life is lost.

### 1.5 Lives

There is **no move counter and no move limit**. The only cost in the game is
a mistake, and hearts are the budget for those. There are exactly two
mistakes:

- firing an arrow whose path is blocked (it cannot move)
- firing an arrow whose color does not match its target block's top layer

Both cost 1 heart, both leave the board unchanged. Everything else is free.

**This is settled, not provisional: tapping the wrong arrow costs a heart.**
It applies to both kinds of wrong tap, at every level index, with no
first-one-free grace and no exemption for a crowded board. The obligation it
creates is on us, not the player — blocked arrows must read as blocked
before the tap (`ART.md` 6.1), the exit-ray guide is free and always
available (`ART.md` 3.2), and a pan may never be mistaken for a tap
(`ART.md` 4.1). The rule stays; the readability work is what makes it fair.

- Hearts are **per level**, refilled on every entry and on restart. There is
  no global energy meter and no wait timer — a player is never locked out of
  playing.
- Lives by level index:

  | Levels                       | Hearts |
  | ---------------------------- | ------ |
  | 1-49                         | 4      |
  | 50+                          | 3      |
  | designated levels, any index | 1      |

  The count is stored per level (`hearts` in `LevelDef`); the table is the
  default the authoring tools apply.

- The currency is drawn as **hearts**, never as a generic pip or a droplet.
  A heart reads as "this is yours and you can lose it" in every market
  without a tutorial line.
- A blocked tap and a mismatch bounce each cost 1 heart. Nothing else does.
- **Readability is mandatory, because a blocked tap is punished.** An arrow
  whose path is blocked is rendered visibly inert — desaturated, no idle
  animation, no tap highlight — so a blocked shot is a misread of the board,
  never a hidden trap. Without this the rule is a gotcha; with it, it is the
  same "look before you tap" skill the color rule asks for. This is a
  release blocker, not polish.
- When the last life is lost, the level fails and the player is offered a
  rewarded ad: **watch to continue with +1 heart, board untouched**. Declining
  restarts the level. See `ADS.md` for the caps.

#### One-heart levels

A handful of levels grant a single heart regardless of their index. They are
the game's punctuation — a clean-solve challenge, not a difficulty spike.

- Roughly every tenth level from level 20 on, plus any level the designer
  flags. They are **not** simply the hardest boards: a one-heart level is
  built to be readable and a little shorter, because the demand is precision,
  not endurance.
- Flagged visibly on the level path **and** on a confirmation before the
  level starts. A single heart must never be a surprise discovered by losing
  it.
- Stars work unchanged (section 1.6): a clean solve is 3 stars, and the
  first mistake ends the attempt, so 2 stars there requires a continue.

### 1.6 Scoring

Stars come from **mistakes made** — blocked taps and mismatches together —
counted across the whole level attempt, including any continues:

- 3 stars: 0 mistakes — a clean solve
- 2 stars: 1 mistake
- 1 star: 2 or more mistakes

One rule for every level, independent of how many hearts that level grants.
On a four-heart level, two mistakes still finish the level at 1 star. On a
one-heart level, the first mistake already ends the attempt, so reaching 2
stars there requires a continue.

`par` — the solver's optimal solution length — is no longer a star
threshold. It is still computed and stored, because the generator uses it to
rate difficulty and the hint feature replays it.

Stars are not the only number the player earns. A separate **score**, scaled
by a combo multiplier, runs alongside them and is what a future league would
rank; special level types (timed, one-heart) and the hint economy live there
too. All of that is `PROGRESSION.md`. Stars gate progression; score never
does.

### 1.7 Dead states

Without a move limit, the fail condition is hearts alone — so the engine must
detect boards that can no longer be solved even though lives remain. A dead
state is reachable without any mistake, for example by firing an arrow into
an already-destroyed lane when a later block still needs that arrow's color.

- After every resolved tap, the engine runs the solver (section 4) from the
  current state. Boards are small, so this is cheap on device.
- If no solution exists, the level is **stuck**, not failed: the player is
  shown a "no moves left" panel with a **free restart**. No life is taken,
  no ad is shown. Being stuck is a design consequence, not a player failure,
  and monetizing it would be hostile.
- The same on-device solver call powers the hint (section 6), so the hint
  works from any reachable state, not only along a pre-stored path.

**Under the base rules, a dead state cannot actually happen.** An arrow only
ever reaches the block on its own lane, so a legal move either peels a layer
some solution had to peel anyway, or removes an arrow that can never
contribute (its lane is open, or its block is already destroyed). Neither can
take a solution away, and removing an arrow only ever frees rays. A board that
starts solvable therefore stays solvable, and the level gate already refuses
the boards that do not (`CI.md` 2.2). The check is written, shipped and tested
anyway, because it is cheap, it fails open, and the **bomb** breaks the
argument the moment it lands: a bomb peels layers by position rather than by
colour (1.11), so it can spend a colour the frame still needs. Until then the
panel is dead weight we are choosing to carry, not a feature we rely on.

### 1.8 Where the difficulty comes from

1. Several arrows are unblocked at once, but their target block is not yet
   showing the matching color — the player must hold them.
2. An arrow's long, bent body lies across another arrow's exit ray; to clear
   it you must first prepare its own target block. With path arrows one
   piece can pin several others at once, which is where the tangle in the
   reference art comes from.
3. Wide blocks create ordering decisions: several lanes feed one layer
   stack, so which lane fires first determines what the others can do.
4. Lives punish guessing on both axes: tap a blocked arrow and you pay, tap
   the wrong color and you pay. Firing to "see what happens" costs the run,
   so every tap has to be read off the board first.
5. Spending an arrow into a destroyed lane is free but irreversible, so
   clearing a blocker that way has to be planned against the layers that
   still need that color.

---

### 1.9 Leaving a level, and coming back

A level attempt is **not** persisted. Backing out, quitting to the home
screen, or killing the app abandons the attempt; re-entering starts the level
fresh with full hearts.

- No partial-progress save, no "resume?" prompt. Resuming a half-solved board
  would need the whole runtime state — arrows, layers, hearts, mistakes,
  combo, clock — versioned and migrated across app updates, for a board that
  takes a couple of minutes to replay.
- Because a restart is always free and instant (section 1.5), abandoning
  costs the player nothing they cannot get back immediately. That is the
  whole reason this simplification is affordable.
- Backing out is never punished and never charged: no heart is taken, no
  interstitial is shown on the way out (`ADS.md` 1.2).
- What _is_ persisted is the result: stars, best score, best time, and the
  hint balance. Those survive because they are small and final.
- The engine still emits `level_quit` so abandonment stays visible in the
  data (`TELEMETRY.md` 2.3) — it is the quietest churn signal we have.

### 1.10 Shaped boards

The arrow tangle does not have to fill a rectangle. A level can carry a
**mask** — a set of playable cells forming a silhouette (a trophy, an anchor,
a butterfly) — and arrows exist only inside it. Every rule is unchanged; the
mask only says where cells may be.

- The frame still surrounds the grid's bounding box. A lane the silhouette
  never reaches carries **no block** — it is an open lane (section 1.2), so
  the frame naturally takes the silhouette's outline.
- **Solvability constraint**: a block may only be placed on a lane that at
  least one arrow inside the mask can actually reach. The level validator
  enforces this; a block nothing can hit is an unsolvable level.
- Shaped boards are usually _easier per cell_ than a packed rectangle,
  because the empty space around the silhouette leaves many rays clear.
  They earn their place as variety and as a reward beat, not as difficulty.

**Why they matter commercially:** the silhouette is the single most
screenshot-able thing this genre has, and the incumbent leads its store
listing with it (`REFERENCE.md`). Combined with our frame, a shaped level is
a picture _and_ a puzzle with stakes — which is a screenshot the incumbent
cannot take.

**Scheduling.** Shaped levels need open lanes in the engine (cheap, already
in section 1.2) and mask-aware generation (not cheap). So:

- the engine and the validator support masks from the start,
- the MVP ships a small set of **hand-authored** shaped levels as milestone
  beats — roughly one every 20 levels, and ideally one is also a one-heart
  level, so the picture and the challenge land together,
- mask-aware generation, and a shaped level as a repeatable content type,
  comes after launch.

Masks are authored as a simple grid of characters next to the level, not
traced by hand cell by cell.

---

### 1.11 Special arrows

Three special arrows, each defined by **which single rule it breaks**. The
symmetry is deliberate: the game has two rules, so a special breaks exactly
one of them and obeys the other. A piece that broke both would not be a
special, it would be a skip button.

| Arrow     | Breaks                                              | Still obeys                                                          |
| --------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| **Joker** | The colour rule — matches any layer colour          | The ray: a blocked Joker is still a blocked tap, still a heart       |
| **Ghost** | The ray rule — passes straight through other arrows | The colour: a Ghost on the wrong colour still bounces, still a heart |
| **Bomb**  | The colour rule, with area effect (below)           | The ray, same as any arrow                                           |

Because each still obeys one rule, every special can still be _misplayed_,
and misplaying one still costs a heart. That is what keeps them pieces of
the puzzle rather than free moves.

#### Bomb — the balance

A bomb is **not** a block destroyer. Destroying a whole stack would erase
the layer planning that the late game is built on, and a five-layer block
that dies to one tap makes the 61+ boards pointless.

- On impact the bomb peels **one layer from its target block and one layer
  from each immediately adjacent block**, ignoring colour.
- Adjacent means the next block along the frame, on either side, including
  around a corner. A destroyed or open neighbour absorbs nothing; the effect
  is not passed further along.
- So a bomb is worth **at most three colour-free peels** — a strong move,
  never a finisher. A three-layer block still needs three hits.
- It scores as three peels at the current multiplier and, like any correct
  shot, advances the combo by one — not by three.

#### Placement and scarcity

- **At most one special arrow per level from the designer**, and at most one
  more earned from a combo (`PROGRESSION.md` 1.5). Two on the board at once
  is the ceiling.
- Ghost is the rarest. It cancels the tangle, which is half the game, so it
  appears only where the tangle is the explicit obstacle.
- Specials are introduced one at a time, each with its own tutorial beat
  (section 2), and never before level 35 — the base rules need to be
  automatic first.

#### What this costs the tooling

Every special is a new move type in the solver, a new case in the validator,
and a new dial in the difficulty model. That is the reason there are three
and not six, and the reason the fork arrow (one body, two heads, the player
chooses which end fires) is written down here but **not** built for v1: it
doubles the branching factor for its piece and earns depth rather than
spectacle. It is the first candidate if a fourth is ever wanted.

---

## 2. Level content progression

| Levels | Content                                                                            | Hearts |
| ------ | ---------------------------------------------------------------------------------- | ------ |
| 1-10   | Few arrows, short bodies, single-lane blocks, 1 layer. Tutorial beats.             | 4      |
| 11-30  | 2-3 layer blocks, longer and more tangled bodies. Holding and ordering introduced. | 4      |
| 31-49  | Wide blocks. The real puzzle starts.                                               | 4      |
| 50-80  | Crowded boards, 4-5 layers, multiple wide blocks.                                  | 3      |

One-heart levels (section 1.5) are sprinkled through both halves from level
20 on and are not a band of their own.

Tutorial beats, one new idea at a time, no text walls:

| Level | Idea taught                                                       |
| ----- | ----------------------------------------------------------------- |
| 1     | Tap an arrow to fire it                                           |
| 2     | A blocked arrow cannot move — and tapping it anyway costs a heart |
| 3     | Wrong color bounces and costs a heart                             |
| 5     | Layered blocks: the slab edges show what is underneath            |
| 8     | Hearts and stars: a clean solve is 3 stars                        |
| 20    | The first one-heart level, announced before it starts             |
| 31    | Wide blocks: several lanes, one stack                             |
| 35    | The first special arrow — Joker                                   |
| 42    | Bomb                                                              |
| 50    | Hearts drop to three from here on                                 |
| 55    | Ghost                                                             |

**Levels 1-3 forgive.** In the three levels that teach what costs a heart, the
mistake is demonstrated rather than punished: the shake/bounce plays, a
one-line coach mark explains it, and the heart is **not** taken. Teaching a
rule and charging for it in the same breath is how a tutorial loses a player.
From level 4 on, every mistake is charged.

---

## 3. Data model

```ts
type Color = string; // palette key, e.g. "r" | "g" | "b" | "y" | "p"
type Dir = "up" | "down" | "left" | "right";
type Side = "top" | "bottom" | "left" | "right";

interface Cell {
  col: number;
  row: number;
}

interface Arrow {
  id: string;
  color: Color;
  special?: "joker" | "ghost" | "bomb"; // section 1.11
  dir: Dir; // head direction = direction of the final segment
  path: Cell[]; // tail -> head, orthogonally connected, no self-crossing
} // path[path.length - 1] is the head cell

interface Block {
  id: string;
  side: Side;
  start: number; // first lane index covered
  span: number; // lanes covered (1 = normal, >1 = wide)
  layers: Color[]; // index 0 = top / visible
}

interface LevelDef {
  id: number;
  cols: number;
  rows: number;
  arrows: Arrow[];
  blocks: Block[];
  hearts: number; // hearts: 4 / 3 by band, or 1 on a designated level
  type?: "timed"; // special level types (PROGRESSION.md 3)
  // arrows carry an optional `special: "joker" | "ghost" | "bomb"` (1.10)
  timeLimitMs?: number; // timed levels only; hearts are unused there
  mask?: Cell[]; // shaped boards (section 1.10); absent = full rectangle
  par: number; // solver-verified optimum, used for difficulty + hint
  palette: Color[];
}
```

Runtime state is `LevelDef` plus mutable `arrows`, mutable `blocks`,
`heartsLeft`, `mistakes` (total across continues, drives the stars),
`continuesUsed` and `status: playing | won | lost | stuck`. The engine is a
pure reducer:

```ts
fire(state, arrowId): { state, event }
// event: "blocked" | "peeled" | "destroyed" | "bounced" | "flewOff"

grantContinue(state): state   // +1 heart, board untouched, after a rewarded ad
```

`stuck` is set by the dead-state check (section 1.7), which the UI runs after
each resolved tap; the reducer itself stays synchronous and solver-free.

Arrows never occupy a partial position, so the logical state is just **which
arrows are still on the board** plus **the block layer stacks**. Cell
occupancy is a derived index (`Map<cell, arrowId>`), rebuilt or patched when
an arrow leaves. That keeps the search state small enough to hash, even
though the pieces are now long polylines.

Pure and side-effect free, so the same code runs in the solver, in unit
tests and in the UI.

---

## 4. Level generation and validation

Decision: **hybrid**. Levels 1-30 are hand-authored JSON (a controlled
teaching curve); 31 and up are generated and solver-verified. The solver
validates every level, hand-made ones included.

### 4.1 Solver

- State: arrow positions and directions, block layer stacks, move count.
- Branching factor equals the arrow count (each tap is a candidate move). A
  blocked tap is not a legal move, and a bouncing tap changes nothing on the
  board while costing a life, so it is never part of a solution and the
  solver prunes it outright. Legal moves are therefore: matching hits, and
  firing into a destroyed lane.
- The solver ships **in the app**, not only in the tooling: it answers "is
  this state still solvable" (section 1.7) and "what is the next good move"
  (the hint). It must be written against `engine/` with a hard time budget
  and an iteration cap, falling back to "assume solvable" if it ever hits
  the cap — a false stuck panel is much worse than a missed one.
- IDA* over the state space with a Zobrist-hashed visited set, seeded
  deterministically so the same board always searches the same way and a node
  count can be a CI baseline. The visited set stores both 32-bit halves of the
  hash, nested, rather than folding them into one number: a collision would
  make the solver miss a solution and call a live board dead.
- No separate BFS stage. The heuristic below is exact for the common case —
  one peel per move — so iterative deepening reaches the optimum without the
  frontier a BFS would have to hold in memory, which matters most on the
  device, where memory is tighter than time.
- Admissible heuristic for IDA*: total remaining layer count, since every
  peel needs at least one move. A bomb peels up to three, so when bombs land
  this becomes `ceil(remaining / 3)` for boards that contain one.
- Output: `solvable`, `par`, `solutionCount` (capped) and a witness solution
  path stored next to the level for regression tests.

### 4.2 Generator (levels 31+)

Generate **backwards** from a solved board, so solvability comes for free:

1. Start with an empty frame and an empty grid.
2. Repeatedly pick a lane and a color, push a layer onto that lane block,
   and **grow an arrow path backwards into the grid** from that lane: enter
   at the lane's edge cell, then walk inward through free cells with
   occasional bends, so that the head's ray is clear at that point in the
   reverse replay. The walk length and bend rate are difficulty knobs.
3. Because later-placed arrows are grown into a grid that already holds
   earlier ones, long bodies naturally wrap around and pin their
   predecessors — the tangle is a product of the construction order, not
   something bolted on. A **decoy** arrow, placed to block and never needed
   until late, is the deliberate version of the same thing.
4. Merge adjacent same-side blocks into wide blocks at a difficulty-driven
   rate.
5. Run the forward solver to get the true `par` (the reverse construction
   only gives an upper bound) and to reject boards that are trivially short
   or have too many distinct solutions.
6. Score the candidate against the **difficulty model** below and keep only
   candidates inside the target band for that level index.

### 4.3 Difficulty model

Since hearts replaced the move limit, difficulty is no longer "how long is
the solution" — it is **how easy it is to make a mistake**. The model is
built on that:

- **Trap ratio** (primary). At each state along an optimal solution, count
  the taps that look playable but are wrong: arrows with a clear path whose
  color does not match their target, plus arrows the player is likely to
  read as movable but which are blocked. Divide by the number of taps
  available. A board where almost every available tap is correct is easy at
  any size; a board where three of four are traps is hard even when small.
- **Forced-order depth**. The longest chain of "B cannot fire until A has
  fired", from both blocking and layer ordering. This is what makes a level
  a puzzle instead of a lookup.
- **Lookahead distance**. How many moves ahead of the current state the
  player must see for a tap to be provably correct. A trap you can spot from
  the current board is fair; one that only reveals itself three peels later
  is what separates level 70 from level 40.
- **Solution breadth**. Number of distinct optimal solutions. Many solutions
  means a forgiving level; exactly one means a brutal one. Early levels want
  breadth, late levels want it narrow but not always one.
- **Tangle density** (specific to path arrows). Mean body length, bends per
  arrow, and grid fill rate. A long bent body pins more of the grid and is
  harder to trace by eye, which raises both the real difficulty and the
  misread rate — those are different things and the model tracks them
  separately, because misreads are a readability failure, not content.
- **Board load** (secondary). Arrow count, total layers, wide-block count.
  These correlate with difficulty but do not cause it — they are tiebreakers
  in the score, not the score.

Each level index gets a target band per axis. `par` is an input to the
model, not an output the player ever sees.

**The bands are guesses until real players hit them.** The analytics fail
rate per level (`DESIGN.md` section 6) is the feedback signal that
recalibrates them; see the open item on post-launch retuning in
`ROADMAP.md`.

Generation runs offline as a Node script; the shipped app only reads the
resulting JSON.

---

## 5. Architecture

Stack: **Vite + TypeScript + Capacitor (Android first)** — the same stack as
cengeBulmaca, so the tooling, store pipeline and CI are already understood.

```
src/
  engine/      pure rules: types, fire(), win/lose, star calc  (no DOM)
  solver/      search used by the tooling AND on device (worker)
  levels/      level JSON + loader + manifest + remote override
  render/      canvas board renderer, sprites, animation queue
  ui/          screens: map, game HUD, settings, result modal (DOM)
  audio/       sfx + music manager
  state/       save game, progress, settings (localStorage + optional cloud)
  services/    ads, iap, analytics (thin wrappers, no-op in dev)
tools/
  generate-levels.mjs   generator
  solve.mjs             solver CLI / CI validator
```

Rendering: one `<canvas>` for the board (arrows, frame, particles), DOM for
everything around it. A fixed logical resolution scaled to the viewport
keeps the layout resolution-independent.

Animation: the engine resolves a tap instantly; the renderer plays the
resulting event as a short timeline (slide, impact, peel/shatter or bounce)
and input is locked until it finishes. A tap during the animation queues at
most one pending tap.

---

## 6. Meta layer (vertical slice)

- **Level path**: the progression spine sits on the home screen rather than
  behind a separate map screen (`REFERENCE.md` 2) — current level, the next
  few, stars, locked/unlocked.
- **Progress save**: local first (`localStorage`), schema-versioned.
  Optional Firebase Auth + Firestore sync later, mirroring cengeBulmaca.
- **Lives**: per level, not a global energy meter (section 1.5). Restarting
  is always free and instant; there is no wait timer and no way to be locked
  out of the game.
- **Monetization**: AdMob rewarded (+5 moves, hint, skip level) plus one
  interstitial on leaving the win screen, and a single remove-ads IAP via
  RevenueCat. All behind a `services/` facade, so disabling it is one switch.
  Full trigger table, frequency guards, consent flow and console checklist:
  **`ADS.md`**. That file is bound by the studio-wide
  `C:\Projects\pictures\ADS_POLICY.md`; no ad trigger is added without
  reading it first.
- **Settings**: sound, music, haptics, language, restore purchases, privacy
  policy link, delete data.
- **Language**: **English only.** Strings still live in JSON behind a lookup,
  so adding a locale later is a content task rather than a refactor — but
  nothing is translated for v1 and no string is written assuming it will be.
  Store listing and identity: `STORE.md`.
- **Level delivery, analytics and the performance budget**: `TELEMETRY.md`.
  Levels ship in the bundle and can be retuned through a Firebase Remote
  Config override; the `mistake` event split (blocked tap vs. wrong color)
  is what validates or kills the blocked-tap rule.
- **Accessibility**: every color carries a distinct glyph, **always on, not
  a toggle** — the board is matchable on shape alone. The settings option
  turns the glyphs up to high contrast rather than turning them on. Plus a
  reduced-motion setting. Full art spec, palette and validation tests:
  `ART.md`.

---

## 7. Open rules questions (defaults chosen, revisit after playtesting)

1. **Blocked tap cost** — settled: costs 1 heart, confirmed and not up for
   revision (section 1.5). It is the single riskiest rule in the game,
   because a mis-tap on a one-heart level ends the run, so the inert
   rendering and the gesture thresholds ship _with_ it rather than after it.
   If playtests show hearts lost to fat fingers rather than to misreads, the
   answer is stronger rendering and a wider tap tolerance — **not** a
   first-one-free grace, which would teach players that the first tap is a
   probe.
2. **Destroyed lane** — default: an arrow fired into a destroyed lane flies
   off the board and is removed, for free. This is a legal and sometimes
   necessary way to clear a blocker, and it is not a mistake — but it is
   irreversible and can strand a later layer (section 1.7). Alternative:
   forbid the tap.
3. **Bounce and direction** — default: the arrow returns unchanged. A
   variant where the bounce rotates the arrow is a possible later mechanic,
   not MVP.
4. **Wide block impact point** — default: any covered lane behaves
   identically. A variant where a wide block needs a matching hit on each
   covered lane is a candidate late-game mechanic.
5. **Gaps in the frame** — decided: supported from the start (section 1.2).
   They cost the engine nothing, because an open lane behaves exactly like a
   destroyed one, and shaped boards need them.
6. **Undo** — default: no undo, restart only. A mistake does not change the
   board, so there is nothing to undo after one; the only irreversible free
   action is firing into a destroyed lane, and undoing that would remove the
   one planning trap that makes destroyed lanes interesting.
7. **Lives on a restart** — decided: a restart always refills lives. The
   player is never blocked from retrying, so the ad is a convenience (keep
   this board) and never a toll gate.
