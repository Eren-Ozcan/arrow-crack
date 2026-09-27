# Reference: Amaze GO! — Ok Bulmaca

The incumbent in exactly our form. Read before any board, HUD, ad or store
decision.

**Listing data, pulled 2026-09-22** from
`play.google.com/store/apps/details?id=com.oakever.arrows`:

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| Developer    | Oakever Games Pte. Ltd. (Singapore)                                                   |
| Installs     | **100M+**                                                                             |
| Rating       | 4.5, from **241K reviews**                                                            |
| Rank         | **#5 top free puzzle**                                                                |
| Updated      | 17 Sep 2026                                                                           |
| Tags         | Puzzle, logic, single player, abstract, **offline**                                   |
| Monetization | **"Reklam içerir" — ads only. No in-app purchases listed.**                           |
| Data safety  | Shares location, personal info and 3 more types; collects personal and financial info |
| Also by them | Zen Word, Zen Color, Sudoku, Tile Explorer, Paint by Number — a calm-puzzle portfolio |

Screenshot observations are from a Turkish build at level 3675 ("Zorlu"), and
a later pull at level 3685 confirms the same shell unchanged (2026-09-25).

---

## 1. What they do

**Board.** One enormous grid — on the order of 30 x 30 — packed almost edge
to edge with tangled path arrows: thin salmon pipes with small heads, nearly
all one color, on mint. A shaped-silhouette variant (trophy, anchor, dog,
butterfly) runs on a kraft-paper theme.

**Colour carries no rule.** Every arrow behaves the same. That is why they
can run a low-contrast pastel palette across a thousand pieces.

**Difficulty is visual search.** The hard part is finding an arrow whose ray
is clear, not choosing between legal moves. Level 3675 tells you the content
model: procedural generation at volume, difficulty scaled by size and
density.

**Rules readable straight off their own store description:**

- _"Yanlış bir dokunuş, seviyede bir kalp kaybettirir"_ — a wrong tap costs a
  **heart, within the level.** Hearts, per level, paid for mistakes.
- _"Yolunuz net olmadığında yönleri vurgulamak için Uzun Basarak Rehberliği
  kullanın"_ — **long-press guidance** highlighting the direction.
- Hints are a separate button; the blue droplets in the HUD are a hint
  currency, not the hearts.

**The session shell**, read off their first-run screens:

- **The splash is a quote card**, not a logo plate: the app icon on a flat
  tinted background, one short calm line under it, signed with the game's
  name. The tint and the line change between launches, and the line knows
  whether you are new or returning. It is the de-stressor positioning
  delivered before a single tap.
- **The level screen is nearly empty chrome**: a small centred `Level N`, one
  hairline rule under it, then a lot of air with the board sitting below the
  middle of the screen.
- **Their level 1 has no colour rule at all** — every arrow is drawn in one
  dark ink, and the only lesson is "tap an arrow", taught by a speech bubble
  with a tail pointing at the board plus an animated hand. Colour arrives
  later, once tapping is understood.
- **Winning is confetti over the board**, with no words on it.
- **Three permission and consent screens stand between install and play**:
  a welcome card with an Accept button gating on Terms and Privacy, the iOS
  tracking prompt, and a notification prompt — all before the first tap.
- **The in-level HUD is two rows.** Identity first: back arrow, the level
  name with a difficulty word under it, a theme-palette button, a settings
  hex. Resources second: the hint currency on the left, the hint button with
  an **AD** badge on the right. Then a deep gap, then the board.
- **The home screen sells the meta, not the puzzle**: league and daily
  challenge cards at the top with a social-proof bubble ("can you beat
  75,031 players today?"), a mascot avatar, a currency balance, a row of
  level dots, and one large primary button at the bottom carrying the
  difficulty word and the level number. The puzzle itself is not on it.

### 1.1 Levels 1-15, walked screenshot by screenshot (2026-09-25)

Their own early curve, not just the steady-state 3600s board:

- **Level 1**: no HUD at all — no hearts, no hint button, nothing but the
  title and hairline. A handful of isolated arrows (3-4, see 1.2), all one
  dark ink, no colour. Teaching bubble "Tap an arrow" with a tail pointing at
  the board, plus a looping hand-tap animation over one arrow. Matches
  section 1's "their level 1 has no colour rule at all."
- **Levels 2-4**: same bare chrome (still no HUD), the layout grows a little
  each level (a nested square, the same mirrored, then ~11 arrows around a
  small nested spiral). The nesting is in the layout only — the pieces still
  sit in open space and never share a cell (1.2). Still one ink colour, no
  difficulty word shown yet.
- **Level 5**: HUD appears from nowhere, fully formed — 3 hearts top-left,
  hint button top-right, and a difficulty word ("Hard") under the level
  number for the first time. Board simultaneously jumps from a plain
  rectangle tangle to a shaped silhouette (a pair of glasses). Colour is
  still absent from the arrows themselves at this point (ink brown throughout
  levels 1-14) — their "colour carries no rule" claim reads literally: hue is
  reserved for theme decoration, not even introduced as a teaching layer.
- **Levels 6-14**: dense rectangular or silhouette boards, arrow count in the
  hundreds by level 8. The difficulty word under the level number is **not
  repeated every level** — it only reprints when the tier changes (e.g.
  level 5 says "Hard", level 6-13 mostly show bare "Level N", level 14 bare
  again). Read this as: the label is a tier-change toast, not a per-level
  stat.
- **Level 12 complete panel** ("Last Life Win!"): 3-star bar (2 gold + 1
  silver — their star art itself carries a partial-success reading, not just
  the count), a stat block (Difficulty: Normal, Time, Score, Today's Levels),
  then a second stat row (🎯 accuracy %, ✕ mistake count, 💡 hints used), then
  a horizontal level-select carousel (5 upcoming levels as coloured number
  chips — orange/purple/red, reading as a tier colour code) and a single
  "Next Level" button. Confirms section 1's "confetti with no words" claim is
  about the in-board celebration only; the panel underneath is fairly dense.
- **Level 14 mid-play**: caught with 1 heart already spent (third heart
  greyed out — the hearts, not the blue hint droplets of section 1) and a
  praise toast "Eagle Eye!" floating over the board. It is a direct example of
  what we chose not to do (`PROGRESSION.md` 2.1, nothing over the grid): their
  toast sits on the grid while a red-highlighted chain is mid-clear.
- **Level 15** ("Super Hard"): first appearance of the **AD badge on the hint
  button** across the whole walk — levels 5-14 show a plain hint icon (droplet
  balance, no badge), meaning at low levels the first hints are free/earned
  and the ad-gated hint only starts showing once the tier crosses into
  "Super Hard". Board is their densest shaped silhouette seen (a
  flower/butterfly mask), arrow count clearly beyond level 14.

### 1.2 Arrow geometry — counted, not guessed

Every piece is a single-head polyline (one arrowhead, orthogonal bends only,
constant pipe width regardless of level) occupying its own chain of grid
cells. Levels 1-4 are small enough to count exactly; levels 5+ are only
countable by zone-density estimate, and are labelled as such below rather
than given a false precise figure (`PROGRESSION.md` 2.4's own rule about
never inventing a number applies here too).

**Exact (levels 1-4):**

| Level | Arrows | Max turns | Max length (grid units) | Shape                             |
| ----- | ------ | --------- | ----------------------- | --------------------------------- |
| 1     | 3-4 \* | 1         | ~2                      | isolated, no touch                |
| 2     | 5      | 2         | ~3                      | nested square                     |
| 3     | 5      | 2         | ~3                      | nested square (mirrored layout)   |
| 4     | ~11    | 2-3       | ~4                      | rectangle w/ nested spiral cutout |

\* The two passes over the level 1 screenshot disagreed (3 vs 4). Recount
from the screenshot before quoting a number.

Levels 1-4 arrows never share a cell — each piece sits in open space. That
changes hard at level 5.

**Estimated by zone density (levels 5-15, ±15-20% — not exact counts):**

| Level | Shape                         | Arrow count (est.) | Max turns seen |
| ----- | ----------------------------- | ------------------ | -------------- |
| 5     | glasses silhouette (2 lenses) | ~80-85             | 4-5            |
| 6     | rectangle                     | ~110-130           | 4-5            |
| 8     | tall rectangle                | ~180-210           | 5-6            |
| 9     | rectangle                     | ~130-150           | 4-5            |
| 10    | burst/crown silhouette        | ~150-180           | 5              |
| 11    | rectangle                     | ~150-170           | 5              |
| 13    | tall rectangle (densest rect) | ~220-260           | 5-6            |
| 14    | rectangle                     | ~180-220           | 5-6            |
| 15    | flower/butterfly silhouette   | ~220-260           | 5-6            |

Pattern: from level 5 on, pieces interlock into one continuous woven mesh
(no more open-space isolation), arrow count roughly triples between the
tutorial and level 6, then keeps climbing with occasional dips on
shaped-silhouette levels (5, 10, 15) where the mask itself removes cells that
would otherwise hold arrows — the silhouette lowers count even as it raises
perceived difficulty (more scanning, less raw volume). Turn depth caps out
around 5-6 bends per arrow by level 8 and does not visibly grow past that
through level 15; density and interlock, not per-arrow complexity, are what
scale later.

Net: their difficulty presentation is **tiered, not per-level** (Normal →
Hard → Super Hard, label shown only on tier change), and their monetization
posture visibly tightens with tier — hint stays a free-feeling balance early,
picks up the AD badge only once boards get punishing. Neither of these change
anything in `PROGRESSION.md` (our tiers are the named level types in 3.2, not
a copy of theirs), but the AD-badge-appears-later pattern is worth naming
here in case a future hint-economy tweak considers gating by tier instead of
showing the badge from level 1.

**Positioning.** Their copy is relentlessly calm: _sakinleştirmek_,
_meditasyon gibi_, _ASMR_, _stresi azaltır_, _zihinsel sıfırlama_, "the ten
minutes before a meeting". They sell a **de-stressor**, not a challenge.

---

## 2. The three facts that matter most

### 2.1 Hearts and long-press are table stakes, not features

We arrived at per-level hearts for mistakes (`DESIGN.md` 1.5) and a
press-and-hold exit-ray guide (`ART.md` 3.2) on our own. The market leader
ships both. That is **validation that the mechanics are sound and proof that
neither differentiates us.** We keep them because a game without them would
feel worse, not because they win anything. Nothing in the plan changes; our
claim to distinctiveness has to rest elsewhere.

### 2.2 Their ad load is their weakest point, and the slot is empty

There is **no remove-ads product on the listing at all** — the badge says
ads only, no in-app purchases. And the most-helpful visible Turkish reviews
are all about exactly that:

- _"her oyun başı reklam insanı bunaltıyor … reklam süreleri oyundan daha
  uzun"_
- _"Reklamlar çok ve uzun. reklam arası ancak oynarsınız. kaldırıyorum"_
  — 15 people found this helpful
- A top review asks for precisely what we already planned: fewer ads, a
  rewarded "watch an ad, get a heart", and a **one-time remove-ads
  purchase**

`ADS.md` was written against a studio policy, not against a competitor, and
it lands exactly on this gap: one interstitial only when leaving a _won_
level, a five-minute shared persistent cooldown, nothing before level 6,
nothing on failure, nothing on the stuck panel, a rewarded continue for a
heart, and a ₺149,99 remove-ads IAP.

**This is the wedge.** Not "we also have arrows" — "we are the one you can
pay once to silence, and that does not interrupt you mid-puzzle even if you
never pay." It belongs in the first two lines of the store description and
in the review-reply template.

The discipline it demands: **do not drift.** Every future "just one more
placement" idea gets measured against a 100M-install competitor bleeding
goodwill on precisely that. `ADS.md` section 1.2's do-not-show list is a
competitive asset, not a compliance chore.

### 2.3 A quieter gap: data

They share location and personal info with third parties and collect
financial info. We collect analytics and the advertising ID — no location,
no accounts, local save (`TELEMETRY.md` 2). That is a visibly cleaner Data
Safety card, and it costs us nothing because we already decided against
accounts.

---

## 3. What we take

- **The arrow form itself** — path arrows with bends and one head.
- **Hearts for mistakes, per level** — already ours, now validated.
- **Long-press guidance** — already ours, now validated. Ours stops the
  guide at whatever is in the way, so the player can see what blocks a shot
  before paying a heart for it (`ART.md` 3.2).
- **A level path on the home screen** as the progression spine.
- **Shaped boards** — the most screenshot-able idea in the genre, cheap for
  us as a mask (`DESIGN.md` 1.10). What we add that they cannot: our frame
  traces the silhouette in breakable colored blocks, so the picture is also
  the stakes. Their shaped level is a picture you untangle; ours is a picture
  you take apart in the right order.
- **A grid-lines toggle** beside the hint button — a real legibility aid in a
  dense tangle, and free.
- **A rewarded hint with a visible AD badge** on the button.
- **A quote card for the splash**, replacing the Capacitor logo that ships
  today (`ART.md` 9). Ours is our own emblem, one line from
  `src/ui/strings.en.json`, and no invented attribution — the line is the
  game talking, not a fake author.
- **Quiet level chrome**: small title, one hairline, the board low on the
  screen with real air above it. Costs nothing and makes the tangle the only
  thing to look at.
- **One lesson per screen in the teaching levels**, bubble-with-a-tail over
  the board rather than a caption somewhere else.
- **A two-row HUD**: identity (back, level, settings) above resources
  (hearts or clock, and the hint). Ours already carries these; the split is
  what makes a dense board readable under them.
- **A primary button that names what it resumes** — the difficulty and the
  level number on the button itself, so the home screen answers "what am I
  about to play" without a tap.

## 4. What we deliberately do not take

- **Board size.** Their difficulty is scanning a 30 x 30 tangle; ours is
  ordering (`DESIGN.md` 1.8). We stay 6x6-9x9 and the 48dp cell floor is a
  hard limit, not a target. One of their own reviews complains _"oyun ekrana
  büyük geliyor"_ — the size is a cost to them, not only a choice.
- **The pastel monochrome palette.** They can afford low contrast because
  colour is decoration. Ours carries the rule: 3:1 minimum, separable under
  three kinds of colour blindness.
- **A consumable hint currency.** The droplet balance is a soft paywall.
  Ours: hearts are per level, a restart always refills, no meter, no timer,
  no lockout.
- **Leagues, daily challenges, social-proof copy.** Non-goals
  (`ROADMAP.md`).
- **Difficulty as a size dial.** We ship 2000 levels too, but not their
  way: every one is solver-verified and placed in a difficulty band, the
  board stops growing at eight columns, and the curve saturates by level 900
  and then waves rather than inflating (`DESIGN.md` 2). What keeps climbing
  is the tangle and the colour pressure, not the grid. Bands are retuned
  against real fail rates (`TELEMETRY.md` 3.2).
- **Their ad load.** Section 2.2. This is the one we must actively refuse,
  repeatedly, for as long as the game earns.
- **A tracking prompt.** We ship Android first, so there is no iOS tracking
  prompt. The advertising ID is still used by AdMob and declared on the Data
  Safety card (`TELEMETRY.md` 2.2); the only consent UI is Google's UMP form,
  and only where the law requires it (`ADS.md` 2.4).
- **A colourless level 1.** Theirs can teach tapping first because colour is
  decoration for them; ours is the rule, so a player who learns to tap
  without it learns the wrong game. Level 1 stays three colours, and the
  bubble teaches matching with them.
- **Consent screens before the first level.** No welcome gate, no tracking
  prompt, no notification prompt — only the UMP form where it is legally
  required, and startup never blocks on it. The privacy policy is a row in settings
  (`src/ui/settings.ts`), where a player can read it when they want to, and
  the first thing after launch is a board.
- **A theme picker.** Their palette is decoration, so re-skinning it is
  free. Ours carries the rule and is calibrated once (`ART.md` 2). The
  accessibility row turns the glyph redundancy up; it never repaints the
  set.
- **A mascot, a currency balance and social-proof copy on the home screen.**
  Ours shows the level path, the stars earned, and the button that resumes
  the run — the puzzle is the product.

---

## 5. Positioning

Amaze GO sells **calm** — a zen board to empty your head on the commute. It
anchors a whole calm-puzzle portfolio (Zen Word, Zen Color, Colorever), and
level 3675 exists because a de-stressor has to be endless.

Arrow Crack sells **a decision**. Every shot is a colour commitment, wide
blocks make several lanes one choice, hearts make a guess cost something,
and a level ends. Amaze GO asks _which arrow can move?_; Arrow Crack asks
_which arrow should move, and in what order?_

Going head-on for volume against 100M installs and 241K reviews is not a
plan. Three wedges are actually available:

1. **The frame.** A mechanic they do not have and cannot add without
   becoming a different game.
2. **Ad respect plus a remove-ads purchase.** Their loudest complaint, and
   an empty slot on their listing.
3. **Legibility and accessibility.** Always-on colour glyphs, a free
   exit-ray guide, a 48dp floor — in a genre whose leader ships a board a
   reviewer says does not fit the screen.

**Store consequence.** Screenshots lead with the frame: a layered stack
mid-peel or a wide block, never a tangle of arrows alone — that is
indistinguishable from theirs in a search result, and theirs has 241K
reviews. The icon is a block cracking under an arrow (`ART.md` section 9).
The short description carries the ad promise.

Also worth knowing: **Arrows – Puzzle Escape** (Lessmore GmbH, 4.6) is
listed by Play as a similar game and is the second competitor to look at
before launch.
