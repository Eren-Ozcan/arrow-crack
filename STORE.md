# Arrow Crack — Store Listing and Release Identity

Everything Play Console asks for, decided up front so submission is
assembly, not authoring.

**The game ships in English only.** One locale, one set of strings, one
listing. Strings still live in JSON behind a lookup so a second locale is a
content task later, not a refactor — but nothing is translated for v1, and no
string is written assuming it will be.

---

## 1. Identity

| Field                | Value                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Store title          | **Arrow Crack Arrow Pop Puzzle** (28 chars, limit 30)                                                        |
| In-app / spoken name | Arrow Crack                                                                                                  |
| Package id           | `com.yilkgames.arrowcrack` (studio convention, matching `com.yilkgames.telve`, `com.yilkgames.cosmicrumble`) |
| Category             | Puzzle                                                                                                       |
| Content rating       | Expected PEGI 3 / Everyone — no violence, no chat, no user content                                           |
| Developer            | Yilk Games (`yilkgamesstudio@gmail.com`)                                                                     |
| Licence              | Proprietary, `UNLICENSED`, same as cengeBulmaca                                                              |

## 2. Short description (80 char limit)

> Tangled arrow puzzle with breakable blocks. No ads mid-puzzle, ever.

67 characters. The ad promise is in the short description deliberately: it is
the line that shows in search results, and it is the one claim the category
leader cannot match (`REFERENCE.md` 2.2). It is also a promise `ADS.md` must
keep — if a placement is ever added mid-puzzle, this line becomes a lie and
has to change first.

## 3. Long description

The opening two lines carry the differentiator and the promise. No keyword
soup, no wall of emoji.

> **Every arrow is a decision.**
>
> A tangle of arrows fills the board. Around it sits a frame of coloured
> blocks, stacked in layers. Tap an arrow and it slides out along its own
> path — but only if nothing blocks it, and only the right colour breaks
> through. Fire them in the wrong order and the board fights back.
>
> **How it works**
>
> - Tap an arrow to send it out along its path
> - An arrow with something in its way cannot move
> - Matching colours peel a layer; the wrong colour bounces back
> - Every mistake costs a heart, and hearts are all you get
> - Clear every block on the frame to finish the level
>
> **What makes it different**
>
> - Layered blocks you can see through, so you can plan three moves ahead
> - Wide blocks fed by several lanes at once — one stack, one hard choice
> - Special arrows that each break exactly one rule, and obey the other
> - Shaped boards where the puzzle itself forms a picture
> - Timed levels and one-heart levels when you want the pressure
>
> **No ads in the middle of a puzzle**
> One ad when you finish a level and leave the screen. None while you play,
> none when you fail, none when you open the app. Watch one by choice for an
> extra heart or a hint — or buy Remove Ads once and never see another.
>
> **Plays anywhere**
> Fully offline. No account, no login, no location. Colour-blind friendly by
> default: every colour carries its own shape, always on.

## 4. ASO

- The title already carries "arrow" twice and "puzzle" once; the description
  does not need to repeat them mechanically.
- Terms worth appearing naturally in the first 250 characters: arrow puzzle,
  block puzzle, brain puzzle, offline puzzle, logic game.
- **Not** targeted: "zen", "calm", "relax", "ASMR". That is the incumbent's
  ground and their reviews are the proof they own it. Competing there means
  being compared on their terms.
- What we do target that they cannot: _no ads mid-game_, _remove ads_,
  _colour blind_, _offline_, _no account_.

## 5. Screenshots

Per `ART.md` section 9, and in this order — the first two are what most
people ever see:

1. A mid-game board with a layered stack **mid-peel**, the frame prominent.
2. A wide block being decided, with the exit-ray guide drawn.
3. A shaped level, the silhouette obvious.
4. The win panel: stars, score, a commentary line.
5. A special arrow about to fire, with the bomb's area outlined.
6. Settings, showing the colour-blind glyphs and Remove Ads.

Never a screenshot of arrows alone — that is indistinguishable from the
incumbent's, and theirs has 241K reviews behind it.

Feature graphic: one block cracking under one arrow, vermillion on blue,
heavy outline, the title set small. No screenshot collage.

## 6. Privacy, data safety, deletion

Studio-wide addresses, already live — **no game-specific page**
(`STUDIO.md`):

| Field            | URL                                                 |
| ---------------- | --------------------------------------------------- |
| Privacy policy   | `https://yilkgames.com/privacy-policy/`             |
| Account deletion | `https://yilkgames.com/account-deletion/`           |
| Data deletion    | `https://yilkgames.com/account-deletion/#data-only` |

**Before submitting:** if what this game collects is not already described on
that page, the page is updated _first_, then the URL goes into Play Console.
The site does not deploy on push — it needs
`npx wrangler pages deploy . --project-name=yilkgames-web` run by hand.

Data Safety answers:

- **Collected:** advertising ID (ads), app activity and diagnostics
  (analytics), purchase history (IAP).
- **Not collected:** location, contacts, messages, photos, files, name,
  email, anything user-generated. There are no accounts.
- Shared with third parties: the advertising ID with Google AdMob only.
- Encrypted in transit: yes. Deletion request: yes, via the URL above.
- A cleaner card than the incumbent's, which declares location and personal
  info sharing (`REFERENCE.md` 2.3). It is worth keeping that way.

## 7. Review replies

Reviews get answered, and two templates cover most of them.

**On ads** — the most common review in this category:

> Thanks for playing. Arrow Crack only shows an ad when you leave a finished
> level — never while you're playing, never when you fail, never on launch.
> Ads you watch for a heart or a hint are always your choice, and Remove Ads
> takes the rest away for good.

**On difficulty:**

> Sorry that one was rough. Long-press any arrow to see exactly where it
> would go and what it would hit — it's free and always available. If a level
> stays stuck, tell us the number: we tune levels from real play data and can
> push a fix without an app update.

Never argue with a review, never ask for a rating change, never mention the
competitor.

## 8. What's new

Short, specific, no marketing. "Levels 43-51 retuned from play data. Fixed a
case where the timer kept running after backgrounding." A changelog nobody
believes is worse than none.
