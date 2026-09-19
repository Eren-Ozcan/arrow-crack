# Arrow Crack — Ad Plan

Binding source: `C:\Projects\pictures\ADS_POLICY.md` (studio-wide ad
placement policy). Nothing here may contradict it; if a new trigger is
wanted, that file is read first and updated afterwards. Account details live
in `STUDIO.md` (`yilkgamesstudio@gmail.com`).

Formats used: **interstitial** and **rewarded**. No banner. No App Open
(see 2.3).

**This file is also the product's main competitive wedge, not only a
compliance document.** The category leader — Amaze GO, 100M+ installs — ships
no remove-ads purchase at all, and its most-helpful reviews are complaints
that the ads run longer than the game (`REFERENCE.md` 2.2). Every restriction
below is therefore load-bearing twice over. Loosening one to chase revenue
trades the one thing we can credibly claim against a competitor with 241K
reviews.

---

## 1. Formats and triggers

| Format                | Trigger                                                                                 | Frequency guard                                                                |
| --------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Interstitial          | Leaving the **win** celebration screen (Next / Map / Android back)                      | Shared 5 min persistent cooldown, not before level 6, never on the fail screen |
| Rewarded — continue   | Out-of-hearts screen, "Continue with +1 heart" — the board is kept exactly as it stands | Max 2 continues per level attempt                                              |
| Rewarded — hint       | In-game HUD hint button, +1 hint to the balance                                         | 3 per level attempt; acquisition only from inside a level (`PROGRESSION.md` 4) |
| Rewarded — skip level | Out-of-hearts screen, only after 3 consecutive fails on the same level                  | Once per level; awards 0 stars                                                 |

Hearts are the game's only cost currency (see `DESIGN.md` section 1.5): a
blocked tap or a wrong-color shot costs 1 heart, levels grant 4 (to level
49), then 3, with a designated few granting exactly 1, and running out is the
only fail condition. The continue ad is therefore the one ad the player
actually wants.

### 1.1 Interstitial — exact flow

1. The last block shatters. The engine reports `won`.
2. Win animation plays: shatter particles, star reveal, score.
3. The celebration screen stays until the player leaves it, by the Next
   button, the Home button, **or the Android back button**.
4. `maybeShowInterstitial()` is called on the way out, after the screen has
   been dismissed.
5. The next screen (next level or map) appears once the ad closes.

Policy rule 3, reward first then ad: the celebration and the stars are fully
shown before the ad call. Policy rule 2, natural break point: the level is
over, nothing is in progress.

**Android back is wired to the same exit path as the buttons.** This is the
known gap in cengeBulmaca (`handleBack` never triggers the ad); it is closed
here from the start so the trigger is one single function with no back door.

### 1.2 Where an interstitial is explicitly NOT shown

- On app launch or on return from the background (rule 1).
- On the out-of-hearts screen. Failing is not a completed task, and that
  screen carries a rewarded button — stacking a forced ad on top of an
  opt-in one violates rule 6.
- On the **stuck** panel (`DESIGN.md` section 1.7). A board that can no
  longer be solved is a design consequence, not a player failure: the
  restart there is free, with no ad of any kind, not even rewarded.
- On restart, on quitting mid-level, or on entering the map/settings.
- Before level 6. The first five levels are the tutorial; the player has not
  yet decided whether they like the game.
- While any modal, tutorial overlay or toast is open (rule 4).
- After a rewarded ad, until the shared cooldown expires (rule 6).
- Ever, when `remove_ads` has been purchased (rule 7).

### 1.3 Rewarded ad rules

- Rewarded ads are opt-in and stay active after `remove_ads` (rule 7).
- Every rewarded show **writes** the shared last-full-screen-ad timestamp
  but never **reads** it — the player is never blocked from a reward they
  chose to watch (rule 6).
- The caps are enforced **in the game, not in the AdMob panel** (rule 10):
  when a cap is reached, the button is not rendered at all. A panel-side cap
  would let the player watch the ad and then lose the reward.
- The button is disabled while an ad is in flight and re-enabled when the
  promise settles, with a 60 s timeout so a plugin that never emits an event
  cannot lock it for the session.
- Reward is granted only on the `Rewarded` event; an early dismissal grants
  nothing and shows a neutral toast, not an error.

### 1.4 Balance impact of the rewarded rewards

- **Continue (+1 heart)** needs no star penalty of its own. Stars are counted
  from mistakes made (`DESIGN.md` section 1.6), and reaching the continue
  screen already means the mistakes were made — a player who continues has by
  definition landed on 1 star on a four-heart level, or 2 stars on a one-heart
  level. One rule, no special casing.
- The board is **kept**, not reset. That is the whole value of the ad: a
  restart is always free, so paying attention with an ad has to buy
  something a restart does not.
- Two continues per attempt is the cap. Past that the screen offers only
  restart and skip — an unbounded continue chain turns a hard level into a
  slot machine and drags the AdMob match rate down with it.
- **Hint** runs the on-device solver from the current state, so it works at
  any point in a level. If the solver hits its iteration cap and cannot
  produce a move, **no ad is shown** — an ad is never charged for a reward
  that cannot be delivered.
- The hint button states which of the two things a tap will do _before_ it is
  touched: an `AD` badge when it would play an ad, the balance when it would
  spend a hint. A rewarded ad the player did not expect is the fastest way to
  become the thing we are positioning against (`REFERENCE.md` 2.2).
- **Timed levels** replace the heart continue with **+30 seconds**, same cap
  of 2 per attempt (`PROGRESSION.md` 3).
- **Skip level** awards 0 stars and unlocks the next level. It is the
  release valve that keeps a hard generated level from ending a session.

---

## 2. Implementation

### 2.1 Module shape

```
src/services/ads.ts     AdMob facade: consent, init, interstitial, rewarded
src/services/iap.ts     RevenueCat facade: remove_ads, restore
src/state/adState.ts    shared persistent cooldown + per-attempt cap counters
```

`ads.ts` no-ops on web/dev (`Capacitor.isNativePlatform()` is false), so the
game flow is never blocked in the browser. The engine and the UI never
import the AdMob SDK directly; they only call the facade.

### 2.2 Shared cooldown

One persistent timestamp shared by **all** full-screen formats:

```ts
const FULLSCREEN_COOLDOWN_MS = 5 * 60 * 1000;
const LAST_FULLSCREEN_KEY = "arrowCrack.ads.lastFullscreen";
```

- Written by interstitial **and** rewarded shows; read only by the
  interstitial.
- Stored in `localStorage` so a cold start does not hand out a fresh ad slot.
- A stored value that is corrupt, negative or in the future (device clock
  moved back) is treated as 0 — never as a permanent lock.

This is stricter than cengeBulmaca, where only the interstitial writes the
timestamp; policy rule 5 asks for one shared stamp, so it is shared here.

### 2.3 App Open

`@capacitor-community/admob` v8 exposes banner, interstitial, rewarded,
rewarded-interstitial and consent only — there is no App Open format.
Policy rule 1 says an unsupported App Open means **no ad at all** in that
slot, never an interstitial substitute. So Arrow Crack shows nothing on
launch or on foreground, same as cengeBulmaca and reefy.

### 2.4 UMP / GDPR consent

Order is mandatory and identical to cengeBulmaca:
`requestConsentInfo()` → `showConsentForm()` when REQUIRED and available →
`AdMob.initialize()`. `canRequestAds` is the single source of truth. If
consent cannot be obtained, the game continues **without ads** and startup
never blocks on it. A hand-rolled "I agree" screen is not acceptable — only
the Google-rendered form produces a real IAB TCF signal.

A GDPR message campaign must be created in the AdMob account under
"Privacy & messaging" before launch; without it the call returns
NOT_REQUIRED and nothing is shown.

### 2.5 Products

Two RevenueCat products:

- `remove_ads` — non-consumable, ₺149,99, section below. **The purchase we
  actually want.**
- `hint_pack` — consumable, +10 hints, priced well below `remove_ads` so it
  never competes with it. Offered only from the hint button inside a level
  (`PROGRESSION.md` 4.1); there is no shop screen.

### 2.6 remove_ads IAP

- RevenueCat, single non-consumable entitlement, mirroring cengeBulmaca.
- Price: **₺149,99** (Little Grand Hotel sells the same product at ₺49,99;
  this one is deliberately positioned higher). The category leader offers no
  such product at all while its reviewers ask for one by name
  (`REFERENCE.md` 2.2), so this is a filled gap, not a me-too SKU. Google Play sets the other
  currencies from the Turkish tier automatically — check the generated
  USD/EUR prices once, since auto-conversion can land on odd values.
- Removes interstitials only. Rewarded ads keep working (rule 7).
- Restore purchases available in Settings.
- `adsRemoved()` is checked as the first line of the interstitial path.

---

## 3. Setup checklist (AdMob console)

Nothing below exists yet — Arrow Crack is not an AdMob app.

- [ ] Create the app in AdMob (`yilkgamesstudio@gmail.com`, "Yilk Games").
      Use `?authuser=yilkgamesstudio@gmail.com` in the URL — the default
      profile account is the personal one, and the account switcher can open
      the signup wizard, which must never be filled in.
- [ ] Create the ad units: `Interstitial - Level Complete`,
      `Rewarded - Continue`, `Rewarded - Hint`, `Rewarded - Skip Level`.
      The continue unit serves both the heart continue and the timed +30 s.
      (One rewarded unit shared by all three triggers is also acceptable and
      simplifies reporting; decide before wiring.)
- [ ] Panel frequency cap on the interstitial unit: **2 shows / 1 hour**.
- [ ] Rewarded units: **no panel cap** (rule 10 — capped in game).
- [ ] Record the App ID and every unit id in this file and in `ADS_POLICY.md`
      section 3/4, as a new column/row for Arrow Crack.
- [ ] GDPR message campaign under "Privacy & messaging".
- [ ] Expect "Limited ad serving / review needed" until the app is live in
      production on Play and linked to the store listing. That is not a
      penalty.
- [ ] Data safety form in Play Console must declare the advertising ID.

---

## 4. Test plan

- Google test ad unit ids in debug builds; real ids only in release.
- Verify: no ad on launch; no ad on foreground return; no ad on the
  out-of-hearts screen; no ad of any kind on the stuck panel; no ad before
  level 6; no second interstitial within 5 minutes, including across a full
  app kill and relaunch.
- Verify a continue keeps the board byte-for-byte and adds exactly 1 heart,
  that the third continue is not offered, and that a dismissed ad grants
  nothing and leaves the screen usable.
- Verify the back button on the win screen shows the ad on the same terms as
  the buttons.
- Verify a rewarded watch pushes the interstitial out by 5 minutes.
- Verify `remove_ads` kills interstitials, keeps rewarded, and survives a
  reinstall via restore.
- Verify the game is fully playable with airplane mode on, with every ad
  call failing silently.
