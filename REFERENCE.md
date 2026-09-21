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

Screenshot observations are from a Turkish build at level 3675 ("Zorlu").

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
- **Four-digit level counts.** Generation at volume with difficulty as a
  size dial. Ours is 80 curated, solver-verified levels with a taught curve,
  retuned against real fail rates (`TELEMETRY.md` 3.2).
- **Their ad load.** Section 2.2. This is the one we must actively refuse,
  repeatedly, for as long as the game earns.

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
