# Arrow Crack — Score, Combo, Level Types and Hints

`DESIGN.md` defines the rules. This file defines what the player earns for
playing them well: the score, the combo that scales it, the special level
types, the hint economy, and the celebration that pays all of it off.

Stars and score are **two separate systems and stay separate**:

- **Stars** gate progression. They come from mistakes only (`DESIGN.md` 1.6)
  and are unchanged by anything here.
- **Score** is the performance ladder. It is what a league would rank, and
  it exists from v1 even though leagues come later — a leaderboard cannot be
  retrofitted onto a game that never recorded a comparable number.

---

## 1. Score

### 1.1 The tension this design resolves

The core loop punishes haste: a blocked tap and a wrong colour each cost a
heart. A raw "faster = more points" multiplier would reward exactly the
behaviour the rules punish, and the two systems would fight.

**Decision: the multiplier is driven by an unbroken chain of correct shots.
Speed only decides how fast the chain climbs.** Haste without accuracy is
then punished twice — a heart and the whole multiplier — while a player who
reads the board and moves confidently is paid for both.

### 1.2 Formula

Scored on each shot that **lands a colour match** (a peel). An arrow that
flies off through an open or destroyed lane scores nothing; it is a
positioning move, not an achievement.

```
shotScore   = 100 × multiplier × layerBonus
layerBonus  = 1.0 normal layer, 1.5 the layer that destroys the block
levelScore  = Σ shotScore + cleanBonus + timeBonus
cleanBonus  = 1000 if the level was finished with zero mistakes
timeBonus   = timed levels only (section 3)
```

### 1.3 Combo multiplier

| Consecutive correct shots | Multiplier |
| ------------------------- | ---------- |
| 1-2                       | x1         |
| 3                         | x2         |
| 5                         | x3         |
| 8                         | x4         |
| 12+                       | x5 (cap)   |

The multiplier is shown as a badge and nothing else — the words that go with
it are saved for the end of the level (section 2).

- **A mistake resets the multiplier to x1.** Nothing else does — not a hint,
  not a pause, not a continue after an ad. The chain measures correct shots,
  and a player who watched an ad to keep going has not made a new mistake.
- **The hot window.** Each correct shot within **4 seconds** of the previous
  one advances the chain by 2 instead of 1. That is where "fire faster, score
  more" lives — inside correctness, never instead of it.
- The window is deliberately generous. It should reward a player who _knows_
  the next three moves, not one who can tap quickly. If playtests show people
  rushing into mistakes to keep it, widen the window rather than removing the
  chain.
- The multiplier is capped at x5 so a long easy level cannot out-score a hard
  one on length alone.

### 1.4 Combo reward: one earned special

Reaching the **x5 cap** upgrades one ordinary arrow still on the board into a
**Joker** (`DESIGN.md` 1.11), once per level attempt. The arrow is chosen as
the one whose colour currently matches nothing on the frame — the piece the
player was most stuck with — not at random.

This is the Candy Crush beat: skilled play produces a piece on the board, and
the score system stops being a number in the corner.

Deliberate limits, because an earned piece is the one thing in the game that
is not solver-verified:

- **Joker only.** Never a Bomb or a Ghost. The weakest special does the least
  damage to a difficulty band, and Ghost in particular would hand the player
  the one piece that cancels the tangle.
- **Once per level attempt**, and never on a level that already carries a
  designed special _and_ an earned one — two on the board at once is the
  ceiling (`DESIGN.md` 1.11).
- **Levels are proven solvable without it** (`CI.md` 2.2). An earned special
  may only ever make a level easier, so the solvability guarantee stands
  untouched. The stuck check runs on the live board, so an upgraded arrow is
  already counted there.
- It does not affect stars. Stars come from mistakes, and this rewards their
  absence in a different currency.

### 1.5 What score must not become

- It never gates progression, never unlocks anything, and never appears on
  the fail screen. A player who is struggling is not shown a number telling
  them they are bad at it.
- It is never spendable. Score is a record, not a currency; the hint economy
  (section 4) is deliberately separate so that "points" can never be
  perceived as something ads inflate.
- The one thing score does touch is the combo reward above, and that is a
  board piece the player earned in the moment — not a balance they spend.

---

## 2. Feedback and celebration

Score without feedback is a number in a corner. This is the part that makes
a good chain feel good — but **all praise text waits for the end of the
level.**

### 2.1 In-level: no words

While the board is live, feedback is silent and never sits over the grid:

- **Multiplier badge** in the HUD, growing and pulsing on each step up.
- **Floating score** rising from the block that was just peeled.
- Chain break is quiet: the badge shrinks back to x1. No sting, no red. The
  heart already delivered the bad news; a second punishment reads as nagging.

**No praise toasts during play.** A line of text over the board hides the
arrow the player was about to tap, and a hidden arrow costs a heart — the one
thing a celebration must never do. Everything the player earned is said
afterwards, when it can be read without cost.

### 2.2 Level complete

In this order, so each beat lands before the next starts:

1. The last block shatters, with a bigger shatter than a normal peel.
2. Confetti burst, one short celebratory sting.
3. Panel rises: stars reveal one at a time (200 ms apart), score counts up
   rather than appearing, best-score line updates if beaten.
4. **One** commentary line (section 2.3).
5. A **Perfect** badge if the level was finished with zero mistakes.
6. Buttons appear last, so nobody taps through the celebration by accident.
7. The interstitial fires only when the player leaves this screen
   (`ADS.md` 1.1) — never during it.

### 2.3 The commentary line

Exactly **one** line, chosen by the first rule that matches. A panel of five
compliments is noise; one specific sentence is a reward.

| Priority | Condition                                           | Line                                                  |
| -------- | --------------------------------------------------- | ----------------------------------------------------- |
| 1        | Zero mistakes **and** top multiplier reached        | "Flawless run."                                       |
| 2        | Won on the last heart, or with under 5 seconds left | "That was close."                                     |
| 3        | Score beats the player's own previous best          | "New personal best."                                  |
| 4        | A percentile is available (section 2.4)             | "Better than {n}% of players on this level."          |
| 5        | Zero mistakes                                       | "Not a single mistake."                               |
| 6        | —                                                   | nothing; the stars and the score speak for themselves |

The narrow-escape line matters most of them. Surviving on the last heart
is the most memorable thing that happens in a run, and naming it turns a
near-failure into a story the player tells themselves.

### 2.4 The percentile line — and the rule about honesty

The comparison needs a real distribution, which only exists once people have
played.

- The analytics retuning query (`TELEMETRY.md` 3.2) computes, per level, the
  distribution of **score** and of **completion time**, published as a Remote
  Config key `level_stats` and cached on device exactly like
  `levels_override`.
- Both are recorded from day one — `level_win` already carries `score` and
  `duration_ms`, and the save keeps a per-level best score and best time — so
  the comparison can be computed later without a second data-collection pass.
- The line prefers the score comparison. When only the time distribution is
  usable it becomes a speed line instead: "Faster than {n}% of players."
- The client finds which bucket the player's result falls into and shows the
  line. Everything is local at play time, so it works offline.
- **If no distribution is cached for that level, the line is not shown.**
  Never an invented percentage, never a placeholder, never a number seeded
  to flatter. The incumbent leans on social-proof copy
  (`REFERENCE.md` 1); we will use a real number or none at all. A player who
  catches one fabricated stat stops believing the rest of the game.
- Buckets of 5%, never a decimal. "Better than 85%" is a claim the data can
  carry; "better than 83.4%" is false precision on a number resampled last
  week.

### 2.5 Restraint

Every particle respects the reduced-motion setting (`ART.md` 7): the panel
and its text still appear, motion does not.

---

## 3. Timed levels

An occasional level type, clearly signposted, where the clock replaces
hearts.

- **No hearts.** The budget is **time**; a mistake costs **5 seconds**
  instead of a heart. Two separate failure currencies in one level would be
  unreadable, so a timed level has exactly one.
- The level fails when the clock reaches zero.
- **Continue** on failure is a rewarded ad for **+30 seconds**, board kept,
  same cap of 2 per attempt as the heart continue (`ADS.md` 1).
- Winning with under 5 seconds left triggers the narrow-escape line
  (section 2.3), the same as winning on the last heart.
- `timeBonus = 10 × seconds remaining`, so speed pays here explicitly — this
  is the mode where that is the point.
- Stars still come from mistakes, unchanged. A timed level is a different
  pressure, not a different scoring system.
- Frequency: roughly every 15 levels from level 25, and never adjacent to a
  one-heart level. The two special types are both spikes; back to back they
  read as a difficulty wall rather than as variety. In the shipped bundle
  that is levels **38, 53 and 68**, against one-heart levels at 20, 30, 40,
  50, 60, 70 and 80; the gate fails the build if those two lists ever touch.
- The engine enforces the single currency rather than trusting the level
  data: on a timed level a mistake counts for stars and costs five seconds,
  and `fire()` takes no heart (`DESIGN.md` 1.5). `hearts` in the level file
  is unused there.
- Announced on the level path and on a confirmation before entry, exactly
  like one-heart levels (`DESIGN.md` 1.5). A clock must never be a surprise.
- The generator must respect it: a timed level needs a **short par and a
  forgiving solution breadth**. Time pressure over a level that demands deep
  lookahead is not a challenge, it is a coin flip.

### 3.1 When the clock runs, and when it does not

A timed level has one budget, so every moment where the player is not
actually deciding must be off the clock. The clock **pauses** for:

- a rewarded ad, an interstitial, or any consent form,
- the app being backgrounded — and it stays paused until the player is back
  and has acknowledged a resume tap, so returning to a running clock is
  impossible,
- a hint being resolved, the stuck panel, and any modal or coach mark,
- the level-complete and out-of-time panels.

The clock **keeps running** during the exit-ray guide (long press), during
zooming and panning, and during arrow animations. Those are play.

Consequences worth stating: a player can never gain time by backgrounding the
app, and can never lose time to an ad. Both directions matter — the first is
an exploit, the second is the ad interrupting play, which is the thing this
whole product is positioned against (`REFERENCE.md` 2.2).

### 3.2 Level type summary

| Type      | Budget                     | Failure          | Notes                                                   |
| --------- | -------------------------- | ---------------- | ------------------------------------------------------- |
| Normal    | 4 hearts (3 from level 50) | Out of hearts    | The default                                             |
| One-heart | 1 heart                    | First mistake    | Precision beat, ~every 10 levels from 20                |
| Timed     | A clock, −5 s per mistake  | Clock at zero    | Speed beat, ~every 15 levels from 25                    |
| Shaped    | As its base type           | As its base type | A mask (`DESIGN.md` 1.10); can combine with either beat |

---

## 4. Hints

A hint highlights the next good move, computed by the on-device solver
(`DESIGN.md` 1.7). It is the pressure valve for a stuck player.

### 4.1 Acquisition — in-level only

Hints are a small balance, and **the only place to acquire one is inside a
level**. There is no shop screen, no store tab, no home-screen offer.

| Source                              | Amount | Cap                                      |
| ----------------------------------- | ------ | ---------------------------------------- |
| Rewarded ad, from the hint button   | +1     | 3 per level attempt                      |
| Hint pack IAP, from the same button | +10    | —                                        |
| Level completion with 3 stars       | +1     | First clear only, so it cannot be farmed |

A player who never pays and never watches still earns hints by playing well,
which is the point: the hint economy must not read as a paywall around
difficulty we created.

### 4.2 Rules

- The balance persists across levels; only **acquisition** is gated to the
  level screen. A player who buys a pack mid-level keeps the rest.
- `remove_ads` does not disable the rewarded hint (studio policy rule 7,
  `ADS.md` 1.3) — it is opt-in and stays available after purchase.
- **No ad is charged when the solver cannot produce a move** (`ADS.md` 1.4).
- Using a hint does **not** cost a heart, does not break the combo, and does
  not affect stars. It costs the hint, nothing else. A hint that also
  punished would go unused, and an unused valve is not a valve.
- The hint button carries a visible `AD` badge when the next tap would play
  an ad, and shows the balance when it would spend one. The player always
  knows which of the two is about to happen before they touch it.

### 4.3 The IAP

A consumable hint pack alongside the existing `remove_ads` non-consumable,
both through RevenueCat. Pricing is set with the store listing; the
constraint is that it must look small next to `remove_ads` at ₺149,99, since
`remove_ads` is the purchase we actually want people to make
(`REFERENCE.md` 2.2).

---

## 5. Leagues — designed for, not built

Leagues are a **post-launch** feature and an explicit non-goal for v1
(`ROADMAP.md`). What v1 must do is avoid making them impossible later:

- **Record the score.** Per level: best score, stars, mistakes, whether it
  was a clean solve. Locally, in the schema-versioned save.
- **Emit it.** `level_win` already carries `mistakes` and `stars`; it gains
  `score`, `max_multiplier` and `level_type` (`TELEMETRY.md` 2.3).
- **Keep the score formula versioned.** A `scoreVersion` in the save, so a
  later formula change does not silently make old scores incomparable — the
  first thing that breaks a leaderboard is a rebalance nobody versioned.
- Anything server-side — accounts, weekly buckets, anti-cheat — stays out of
  v1. Note that scores computed on device are trivially forgeable, so a real
  league needs server-side validation of the witness path, not just a
  submitted number. Better to know that now than to discover it with a
  leaderboard full of impossible scores.
