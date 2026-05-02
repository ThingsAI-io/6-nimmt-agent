# Card Priors Strategy

## Motivation

In 6 Nimmt!, not all cards are created equal. A card's numeric value determines its structural risk profile — independent of the current board state. Low cards (1–10) frequently fall below all row tops, forcing row picks. High cards (91–104) frequently become the 6th card on a row, triggering a 6 nimmt collection. Mid-range cards (41–60) are structurally safest.

This raises a question: **can we build a static prior over card values** — a lookup table of expected danger per card — that helps a strategy make better decisions without full simulation?

## Approach

We run thousands of games where all players use the same strong strategy (MCS with `scoring=relative`). For every card play, we record what happened. Over many games, patterns emerge that are properties of the *card values themselves*, not of any particular board state.

### What we collect per card (1–104)

| Stat | Meaning |
|------|---------|
| `timesPlayed` | Total times this card was played across all games |
| `timesOverflow` | Times this card triggered a **6 nimmt** (6th card placed on a row → collect 5 cards) |
| `timesRowPick` | Times this card fell **below all row tops** → player forced to pick up a row |
| `overflowPenalty` | Total cattle heads incurred from 6-nimmt events |
| `rowPickPenalty` | Total cattle heads incurred from row-pick events |
| `turnSum` | Sum of turn numbers when played (÷ timesPlayed = average play turn) |
| `heldLateCount` | Times this card was still in hand at turn 7+ (late game) |
| `heldLatePenalty` | Sum of final game scores for players holding this card late |

### Derived metrics

From the raw stats we compute:

- **E[penalty]** = `(overflowPenalty + rowPickPenalty) / timesPlayed` — expected cattle heads per play of this card
- **6 nimmt rate** = `timesOverflow / timesPlayed` — probability this card overflows a row
- **Row pick rate** = `timesRowPick / timesPlayed` — probability this card falls below all tops
- **Average play turn** = `turnSum / timesPlayed` — when strong players typically play this card
- **Late-hold danger** = `heldLatePenalty / heldLateCount` — correlation between holding this card late and losing

## Key findings (5-player, MCS N=100)

The penalty curve is **U-shaped**:

| Card range | 6 nimmt% | Row pick% | E[penalty] | Interpretation |
|-----------|----------|-----------|------------|----------------|
| 1–10 | 0% | 61% | 1.39 | Pure boulevard risk |
| 41–50 | 6.5% | 8.4% | 0.91 | Safest zone |
| 51–60 | 7.3% | 5.2% | 0.80 | **Optimal sweet spot** |
| 91–104 | 21.6% | 0% | 2.04 | Pure overflow risk (worst) |

High cards are more dangerous than low cards because overflow events collect full rows (~9 cattle heads average), while row-pick players can choose the cheapest row (~2 cattle heads).

## How this could be used

### 1. Hand-shape heuristic
A strategy could penalize plays that leave the hand with only extreme cards (all low or all high). The prior tells us which cards are risky to hold.

### 2. Tiebreaker for MCS
When two cards have similar simulation scores, prefer playing the one with higher structural E[penalty] (get rid of dangerous cards early).

### 3. Card ordering prior
Instead of always playing lowest-first or highest-first, use the U-shaped danger curve to inform play order: shed the extremes early, preserve the safe mid-range.

### 4. Boulevard detection
If your hand's average E[penalty] exceeds a threshold, you're approaching the boulevard of death. Trigger a more defensive strategy.

## Data accumulation

The script `scripts/card-priors.ts` saves results incrementally to `data/training/card-priors/`. Each run adds to accumulated stats:

```bash
npx tsx scripts/card-priors.ts --games 200 --mcPerCard 100   # first batch
npx tsx scripts/card-priors.ts --games 200 --mcPerCard 100   # accumulates (400 total)
```

Different configs (player count, MC budget) get separate files: `prior-p5-mc100.json`.

## Open questions

- Does the prior change meaningfully between 4-player and 6-player games? (The "ceiling of death" suggests high cards become safer with fewer players)
- Is E[penalty] stable enough across strategies to be useful as a fixed prior, or is it strategy-dependent?
- Can we use the average-play-turn data to detect when our strategy is making structurally unusual timing decisions?
