# Arrow Crack — Telemetry and Level Delivery

Two things this file decides, because both touch the architecture and are
expensive to retrofit:

1. how level data reaches the player (section 1),
2. what the game measures, and how that feeds back into level difficulty
   (sections 2-4).

Neither exists in any other Yilk Games title yet — cengeBulmaca has no
analytics module and no remote config — so this is new studio
infrastructure, and it is kept small on purpose.

---

## 1. Level delivery

### 1.1 The problem

The difficulty bands in `DESIGN.md` section 4.3 are guesses. One-heart
levels give the player a single mistake, so a band that is 20% too hard does not produce
"a bit more challenge", it produces a churn wall. The bands can only be
corrected against real fail rates, which means **level data has to be
changeable without a store release**. A store update takes days to review
and reaches only a fraction of installs in the first weeks; a difficulty
mistake would stay live for a month.

### 1.2 Decision: bundled with remote override

- Every level ships **inside the app bundle**. The game is fully playable
  offline, on first launch, with no network call on the critical path. The
  bundle is always the fallback.
- On startup, in the background, the app fetches a **level manifest** and
  applies any override it contains. The result is cached to `localStorage`
  and used on subsequent launches.
- An override is applied only if it is newer, parses, and passes a sanity
  check (see 1.4). Anything else falls back to the bundled level. A failed
  fetch is a non-event: no error UI, no retry storm, no blocked startup.
- A level in progress is **never** swapped underneath the player. Overrides
  apply at the next level entry.

### 1.3 Transport: Firebase Remote Config

Firebase is already in the studio stack (cengeBulmaca uses Auth and
Firestore), so Remote Config adds no new vendor, no new billing
relationship, and no hosting to maintain. It also gives percentage rollouts
and audience conditions for free, which a plain hosted JSON file does not.

Two config keys are used. `levels_override` retunes levels; `level_stats`
publishes per-level **score and completion-time distributions**, which the win panel turns into the
"better than n% of players" line (`PROGRESSION.md` 2.4). `level_stats` is
cached the same way and is purely cosmetic: when it is missing, the line is
simply not shown, never faked.

- One config key, `levels_override`, holds a JSON object:
  `{ "version": 7, "levels": { "63": { ...LevelDef }, "71": { ... } } }`
- Only the levels that actually changed are listed. A full level list is
  never shipped through config — it would blow past the parameter size limit
  and make rollbacks unreadable.
- Rollback is setting `version` back and removing the entry; the client
  falls back to the bundled level on the next launch.

### 1.4 Client-side sanity check

An override is rejected, and the bundled level used instead, unless:

- the JSON matches the `LevelDef` shape and the schema version is one the
  client understands,
- `hearts` is between 1 and 5,
- the board is **solvable** — the on-device solver runs once against the
  override before it is accepted.

That last check is the important one: a bad remote push could otherwise ship
an unsolvable level to every installed device at once, with no way to take
it back from the client side. The solver already exists on device for the
stuck detection (`DESIGN.md` section 1.7); reusing it here costs nothing.

### 1.5 What is deliberately NOT remote

- Rules, ad triggers, prices, cooldowns. Those stay in code and go through
  review. A remote kill switch for ads would be convenient and is also the
  thing most likely to be pushed wrong at 2am.
- New levels. Remote config retunes existing levels; content additions ship
  as app updates.

---

## 2. Analytics

### 2.1 Vendor

Firebase Analytics, via `@capacitor-firebase/analytics`, behind
`src/services/analytics.ts`. No-op on web/dev, exactly like the ads facade.
Events are fire-and-forget; nothing in the game flow ever awaits one.

### 2.2 Consent

Analytics collection starts only after the UMP flow resolves (`ADS.md`
section 2.4). If consent is denied or unavailable, analytics stays off along
with ads. The Play Data Safety form declares the advertising ID and the
analytics collection together.

### 2.3 Event schema

Every event carries `level_id` and `level_band` (`1-30 | 31-49 | 50+`) where
it makes sense. Parameter names are snake_case, Firebase's convention.

| Event                                                | Parameters                                                                                                               | Why it exists                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `level_start`                                        | `level_id`, `level_type`, `hearts`, `attempt_no`                                                                         | Denominator for every rate below                                                                                                               |
| `level_win`                                          | `level_id`, `level_type`, `mistakes`, `stars`, `score`, `max_multiplier`, `shots_fired`, `duration_ms`, `continues_used` | Success side of the funnel; `mistakes` is the difficulty signal, `score` and `max_multiplier` are what a future league ranks                   |
| `level_fail`                                         | `level_id`, `level_type`, `mistakes`, `shots_fired`, `duration_ms`, `blocks_left`, `layers_left`                         | `blocks_left` says whether they were close or lost early                                                                                       |
| `level_stuck`                                        | `level_id`, `shots_fired`, `cause` (`flew_off` \| `other`)                                                               | Dead-state rate. Should be near zero; if it is not, the generator is producing traps that are not fair                                         |
| `level_quit`                                         | `level_id`, `shots_fired`, `mistakes`                                                                                    | Abandonment without win or fail — the quietest churn signal                                                                                    |
| `mistake`                                            | `level_id`, `kind` (`blocked_tap` \| `color_mismatch`), `shots_fired`, `hearts_left`                                     | **The single most important event in the game.** See 3.1                                                                                       |
| `hint_used`                                          | `level_id`, `shots_fired`, `source` (`balance` \| `ad` \| `iap`)                                                         | Where players get lost, and whether the hint economy is paid, watched or earned                                                                |
| `special_used`                                       | `level_id`, `kind` (`joker` \| `ghost` \| `bomb`), `source` (`designed` \| `combo`)                                      | Whether specials are being saved for the wrong moment, and whether the bomb's three peels land where intended                                  |
| `combo_break`                                        | `level_id`, `multiplier_at_break`                                                                                        | Whether the combo is pushing players into mistakes — if breaks cluster at high multipliers, the hot window is too tight (`PROGRESSION.md` 1.3) |
| `continue_offered` / `continue_taken`                | `level_id`, `continue_no`                                                                                                | Continue funnel and the real value of the continue ad                                                                                          |
| `skip_used`                                          | `level_id`, `fails_before`                                                                                               | Walls                                                                                                                                          |
| `ad_shown`                                           | `format`, `placement`, `result`                                                                                          | Ad health, cross-checked against the AdMob console                                                                                             |
| `purchase`                                           | `product`, `price`, `currency`                                                                                           | Conversion                                                                                                                                     |
| `level_override_applied` / `level_override_rejected` | `level_id`, `version`, `reason`                                                                                          | Proof the remote path works, and a loud signal when a bad override is pushed                                                                   |

Nothing that identifies a person is collected, and no free-text field is
ever sent.

### 2.4 Volume

`mistake` fires several times per level and is the highest-volume event. It
is capped at **20 per level attempt**; a player who has made twenty mistakes
in one level has already told us everything the data can say.

---

## 3. How the data feeds back into difficulty

### 3.1 The blocked-tap check (first thing to look at)

`mistake` splits into `blocked_tap` and `color_mismatch` for one reason: a
blocked tap costs a heart (`DESIGN.md` section 1.5), and that rule is the
riskiest in the game. The split tells us which of two very different worlds
we are in:

- Mostly `color_mismatch` → the rule works. Players are losing lives to
  puzzle misreads, which is the intended skill.
- A high and flat `blocked_tap` rate, especially early in a level and on
  one-heart levels → blocked arrows are not reading as blocked. **The rule
  itself is settled (`DESIGN.md` 1.5) and is not the variable being tuned
  here.** The fixes, in order: make the exit-ray guide more discoverable,
  widen the tap tolerance in the gesture thresholds, and only then consider
  putting a treatment back on the blocked arrow itself (`ART.md` 6.1). A first-one-free grace is explicitly not on the list — it
  would turn the first tap of every level into a free probe.

Threshold to act on: `blocked_tap` above **25%** of all mistakes, sustained
across bands.

### 3.2 Difficulty retuning loop

1. Per level, compute win rate on first attempt, median mistakes, quit rate,
   skip rate, stuck rate, and the **score and completion-time distributions**
   that feed `level_stats`.
2. Flag a level when it falls outside its band's target: first-attempt win
   rate under 25% or over 90%, quit rate over 15%, or any stuck rate above
   2%.
3. Feed the flagged levels back into the generator's difficulty model
   (`DESIGN.md` section 4.3) — the model's bands are the thing being
   calibrated, not just the individual level.
4. Regenerate or hand-fix, verify with the solver, push through
   `levels_override`.
5. Watch `level_override_applied` and the level's rates for a week.

Steps 1-2 run as a scheduled query, not by eyeballing dashboards.

### 3.3 Target rates (starting assumptions, to be replaced by real data)

| Band             | First-attempt win rate | Median mistakes                            |
| ---------------- | ---------------------- | ------------------------------------------ |
| 1-30             | 70-90%                 | 0-1                                        |
| 31-49            | 50-75%                 | 1-2                                        |
| 50+              | 40-65%                 | 1-2                                        |
| one-heart levels | 30-50%                 | 0 (you solve it clean or the attempt ends) |

---

## 4. Performance budget

The solver now runs on the device after every resolved tap (stuck
detection), and on demand for hints and for override validation. That makes
it the only part of the game that can miss a frame.

### 4.1 Target device

A 2019-class low-end Android phone: 4 cores, 3 GB RAM, Android 9. Concretely
the studio's test target is a device in the Snapdragon 4xx / Helio A-series
class. If it is smooth there, it is smooth on everything newer.

### 4.2 Budgets

| Work                             | Budget                       | On overrun                                   |
| -------------------------------- | ---------------------------- | -------------------------------------------- |
| Frame render                     | 16 ms (60 fps)               | Drop particles first, never input latency    |
| Solver — stuck check after a tap | **8 ms**, hard iteration cap | Assume solvable, show nothing                |
| Solver — hint                    | 250 ms, may show a spinner   | No move found → no ad charged (`ADS.md` 1.4) |
| Solver — override validation     | 1 s, off the critical path   | Reject the override, use the bundled level   |
| Cold start to first frame        | 2 s                          | —                                            |

The stuck check is the tight one. It runs after every tap, and it **fails
open**: on the iteration cap it reports "solvable" and the panel is simply
not shown. A false stuck panel — telling a player their solvable board is
dead — is far worse than a missed one, where the player just restarts.

### 4.3 How the budget is kept

- The solver runs against a packed board representation (typed arrays,
  bitmasks per lane), not the object graph the UI renders from.
- It runs in a **Web Worker** so a slow search never blocks input or
  animation; the result arrives asynchronously and the stuck panel appears a
  frame or two late, which is invisible.
- The main-thread handle waits for the search budget plus a **2 s grace** and
  no longer. A worker that fails to load, errors, or goes silent past that
  grace resolves the caller with no answer, which reads as fail-open: board
  solvable, no hint. Once the worker has errored every later question fails
  open immediately rather than waiting again.
- The stuck check is skipped entirely when it cannot matter: no arrow was
  consumed and no layer changed, so the reachable state set did not shrink.
  In practice this skips it on every mistake, which is exactly when the
  player is tapping fastest.
- Level fixtures carry a recorded worst-case node count; a solver change
  that regresses it fails CI.
