# User Notes on 6 Nimmt Strategy

> **Purpose:** This document collects raw observations and strategic concepts from human players. The goal is to distil these notes over time into a new, human-informed strategy — one grounded in the kind of pattern recognition and situational reasoning that experienced players develop through play, rather than pure simulation or search.

---

## The Boulevard of Death

### What It Is

The **boulevard of death** is a late-game trap where every card remaining in a player's hand falls below the last card of every row on the board. Once a player is in this situation, they are doomed: no matter which card they play, it will land below all four rows, forcing them to pick up a row on every single remaining turn. There is no escape — the player is systematically bled of points until the round ends.

### Illustrative Example

The board state below shows a textbook boulevard of death situation.

| Row | Cards                  | Top |
|-----|------------------------|-----|
| 1   | 56 · 89 · 90 · **91**  |  91 |
| 2   | 45 · 47 · 95 · **97**  |  97 |
| 3   | 52 · 53 · 80 · 94 · **99**  |  99 |
| 4   | 57 · 60 · 85 · 92 · **100** | 100 |

**Trapped player's hand:** 2 · 16 · 25 · 27 · 32

The four rows end on: **91, 97, 99, 100**.

Every card in the trapped player's remaining hand — **2, 16, 25, 27, 32** — falls below every row top. Each of the five remaining turns will force a row pickup, with no ability to dodge or manoeuvre.

It is not guaranteed that the other players are free from this predicament. They may also be stuck below the row tops, or on the verge of it. What the boulevard of death really creates is a **race to the bottom among the trapped players**: on each forced-pickup turn, whoever plays the lowest card must take a row first, while the others — still playing low cards — get to observe and react. The competition shifts from "who can place on a row" to "who among us loses the least."

This opens a narrow tactical escape: a player who recognises they are trapped early can deliberately **sacrifice the cheapest possible cards turn by turn**, hoping to outlast opponents who play slightly higher cards and exhaust their options faster. If the other trapped players burn through their mid-range low cards while you trickle out your 2s and 3s, you may eventually find yourself holding the *highest* low card in the group — recovering a sliver of control over which row you take, or even surviving one more turn penalty-free if an opponent's card happens to land just below a row top before yours does.

### The Competition That Precedes It

The boulevard of death doesn't happen by accident. It is the outcome of a competitive dynamic that plays out in the mid-game:

As rows accumulate high-value cards (pushing the row tops into the 70s, 80s, or higher), every player is implicitly competing to **hold at least one card that sits above at least one row top**. That card is your lifeline — it keeps you from being locked out.

The competition is therefore to **retain the highest possible "escape card"** relative to the current row tops. Players who ration their high cards carefully can stay just above the threshold. Players who burn their high cards early (to avoid pickups in earlier rounds) may find themselves with only low cards when the rows have crept into the 90s, condemning them to the boulevard.

There is also a secondary competition: when several players have no escape card, the one with the *highest* of their low cards can at least control *which* row they pick up (choosing the cheapest one). The player with the very lowest cards has no control at all — they are last to be placed and must take whatever row is left after others have exercised their grim choices.

### Strategic Implications

- **Don't cash all your high cards early.** Surviving a pickup in round 3 is far less costly than being permanently trapped from round 7 onward.
- **Watch row tops.** When rows are creeping toward 80+, ask yourself: do I still have a card above each of them? If not, you may already be in the corridor leading to the boulevard.
- **Pressure opponents.** If you can play cards that push row tops above an opponent's highest remaining card, you sentence them to the boulevard while keeping yourself free.
- **In a full boulevard situation, minimise losses.** Choose the row with the fewest bulls heads on each forced pickup; you cannot avoid paying, but you can control the price.
- **Play the boulevard offensively.** A deliberate strategy is to spend the early and mid game **locking the rows** — playing cards that push all four row tops high — while hoarding a reserve of high cards for yourself. As other players deplete their high cards coping with earlier threats, they eventually have nothing left above the row tops. You, still holding your high-card reserve, can place freely while they are systematically forced to pick up rows every turn. The cost is accepting some risk and possibly some early pickups to execute the lock; the payoff is owning the endgame entirely.

---

## Pulling the Rug

> **Applies to:** 4+ players. The move relies on herding multiple opponents simultaneously; with fewer players the effect is diluted and the self-sacrifice is harder to justify.

### What It Is

**Pulling the rug** is an offensive move that exploits the predictability of other players. When one row has a notably low top card — making it an obvious safe landing spot — most opponents will gravitate toward it, clustering their cards just above that number. You deliberately **sacrifice a card below that row's top**, taking the row on purpose, so that all the players who were counting on it suddenly have nowhere safe to land. Their cards, now orphaned, pile onto the remaining rows — including costly ones — and one or more of them absorbs significant penalties they thought they had avoided.

The key insight is that you choose *which* row to sacrifice. You pick up the cheap one, and let the crowd pay for the expensive ones.

### Illustrative Example

The board state before cards are revealed (bull counts computed from actual card rules):

| Row | Cards              | Top | Bulls |
|-----|--------------------|-----|-------|
| 1   | 22 · 27 · **36**   |  36 |   8   |
| 2   | 41 · **53**        |  53 |   2   |
| 3   | 17 · 67 · **79**   |  79 |   3   |
| 4   | 29 · 71 · 87 · **95** | 95 |  5   |

> Bull counts: 22 = ×11 → 5; 27 = odd → 1; 36 = even → 2; 41, 53 = odd → 1 each; 17, 67, 79 = odd → 1 each; 29, 71, 87 = odd → 1 each; 95 = ×5 → 2.

You are playing a 5-player game. Row 1 (top 36, **8 bulls**) is the danger zone — it is nearly full (3 cards) and loaded. Row 2 (top 53, **2 bulls**) is the obvious safe escape hatch: anyone holding a card between 54 and 66 will naturally drift there. Rows 3 and 4 are high and out of reach for most players this turn.

The other players hold: **38, 44, 56, 65** — a cluster that, left alone, would play out like this:
- 38 → Row 1 (4 cards)
- 44 → Row 1 (5 cards, **full**)
- 56 → Row 2 (top 53, closest below 56) → **safe**
- 65 → Row 2 (top 56) → **safe**

No pickup this turn. Row 1 fills quietly, and the two players with 56 and 65 glide onto the cheap Row 2 unharmed.

**The move:** you hold **31** (1 bull). You play it deliberately — it falls below all row tops, forcing a pickup. You choose **Row 2** (2 bulls). Row 2 resets with your 31 as its new top.

Now the turn resolves in ascending order:
- 38 → Row 1 (top 36, closest below 38) → Row 1: 4 cards
- 44 → Row 1 (top 38) → Row 1: **5 cards, full**
- 56 → Row 1 (top 44 is closest below 56; Row 2's reset top 31 is further away) → **6th card** → player with 56 picks up Row 1: 22 + 27 + 36 + 38 + 44 = **12 bulls**. Card 56 starts the new Row 1.
- 65 → Row 1 (new top 56) → safe

**You paid 2 bulls. The player with 56 paid 12 bulls — a cost they had every reason to believe they had avoided.**

### Why It Works

- **Herd behaviour is predictable.** Players naturally cluster toward the safest row, especially under time pressure. When 3–4 players all target the same row, removing it creates simultaneous chaos.
- **You control the sacrifice.** You pick up the row *you* choose — ideally the lightest one — not one assigned to you by circumstance.
- **Asymmetric damage.** Your cost is small and deliberate; the opponents' cost is large and unexpected. The efficiency is highest when the row you vacate was cheap and the rows the others fall onto are expensive.

### When to Use It

- 4+ players, where multiple opponents are predictably targeting the same row.
- The row you intend to pick up has few bull heads.
- The remaining rows that opponents will be forced onto carry high penalties.
- You have a card low enough to guarantee you pick up the target row (not just risk it).

### Risks

- If other players are also holding low cards, someone else may pick up the cheap row before you, leaving you to absorb a more expensive one.
- In 2–3 player games, the herd effect rarely materialises — opponents have too few cards clustering on any single row for the disruption to be worth the self-sacrifice.

---

*More notes to be added over time.*
