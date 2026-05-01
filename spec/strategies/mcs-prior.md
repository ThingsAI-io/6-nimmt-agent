# MCS-Prior Strategy

## Overview

MCS-Prior is a Monte Carlo Search strategy enhanced with heuristic hand evaluation derived from a pre-computed statistical prior (1300+ training games). It improves on plain MCS in two ways:

1. **Heuristic leaf evaluation** — Instead of simulating the entire round, simulate 1 turn forward and score the resulting hand using prior-derived danger estimates. More samples, less noise.
2. **Prior-weighted opponent model** — Opponents play safe cards first (inverse-danger weighting) instead of uniformly at random, producing more realistic simulations.

**Benchmark results:** ~29% win rate vs plain MCS’s ~24% (5-player, equal mcPerCard).

## Architecture

```
For each candidate card in hand:
  For N simulations:
    1. Sample opponent hands from unknown pool
    2. Opponents select cards via prior-weighted model (safe first)
    3. Simulate 1 turn (resolve placements + row picks)
    4. Score = immediate penalty + evaluateHand(remaining hand, new board)
  Pick card with lowest average score (relative to opponents)
```

## Heuristic: `evaluateHand`

Estimates total future penalty of holding a set of cards. Three components:

### A. Trapped Card Management

**What:** Cards below every row top (guaranteed row pick whenever played).

**Logic by phase:**

| Phase | Condition | Behavior | Rationale |
|-------|-----------|----------|-----------|
| Early game | `heuristicTurn <= 4` (game turns 1–3) | Suppress danger (×0.3 scale) | Low cards cost 1–3 heads. Focus on shedding high-penalty overflow cards (55=7 heads). |
| Mid/late + cheap row | `turn > 4` AND `minRowLen <= 2` | Amplify danger (×1.5 scale) | Short row = cheap pick window. Dump trapped cards NOW. |
| Mid/late + expensive rows | `turn > 4` AND `minRowLen > 2` | Moderate danger (×0.7 scale) | Wait for a cheaper opportunity. |

**Trapped discount (urgency ramp):**
```
urgency = (turn - 4) / 6          // 0.17 at turn 5, 1.0 at turn 10
cardDanger *= (1 + remainingTurns * trappedDiscount * urgency)
```

This ensures trapped cards are eventually played — the penalty grows each turn held.

### B. Overflow Risk

**What:** Cards above `minRowTop` that may trigger 6th-card overflow on primed rows.

```
scale = max(0.5, primedRowCount / baselinePrimedRows[turn])
cardDanger = overflowRate * avgOverflowPenalty * scale
```

Scaled relative to what’s “normal” for this turn number, from the prior baseline.

### C. Timing Pressure

**What:** Penalizes holding any card past its natural play window.

```
timingPressure = max(0, turn - prior.avgTurn) * timingWeight
cardDanger *= (1 + timingPressure)
```

**Example:** Card with avgTurn=3 at turn 7, timingWeight=0.3 → multiplier = 1 + 4×0.3 = 2.2×

## Opponent Model: `priorWeightedSelect`

Models opponents as rational agents who play safe cards early and hold dangerous cards:

```
weight(card) = (1 / (expectedPenalty + 0.1)) * (1 + timingBoost)
```

Where `timingBoost = max(0, turn - avgTurn) * 0.2` — overdue cards get forced out.

This matches observed behavior from training data: mid-range cards (40–60) are played early, extremes (1–10, 90–104) are held until necessary.

## Options

```typescript
interface McsPriorOptions {
  mcPerCard?: number;       // Simulations per candidate card (default: 100)
  mcMax?: number;           // Max total simulations (default: 10 * mcPerCard)
  scoring?: 'self' | 'relative';  // Score mode (default: 'relative')
  simDepth?: number;        // Turns to simulate forward (default: 1)
  opponentModel?: 'uniform' | 'prior';  // Opponent selection model (default: 'prior')
  timingWeight?: number;    // Timing pressure multiplier (default: 0.3)
  trappedDiscount?: number; // Trapped card urgency ramp (default: 0.3, 0=disabled)
}
```

### Key tuning decisions (from benchmarks)

| Parameter | Value | Justification |
|-----------|-------|---------------|
| `simDepth` | 1 | simDepth=2 underperforms (17% vs 22%) — more samples at depth 1 > fewer at depth 2 |
| `timingWeight` | 0.3 | Sweet spot (0.0 worst, 0.7 regresses — see results below) |
| `trappedDiscount` | 0.3 | Enables urgency ramp; 0 disables trapped management entirely |
| `scoring` | \'relative\' | Accounts for opponent penalties, not just our own |

## Prior Data

Baked-in TypeScript lookup table (`prior-table.ts`) generated from 1310 MCS-vs-MCS training games.

### Per-card statistics (`CARD_PRIOR[0..103]`)

```typescript
interface CardPrior {
  overflowRate: number;        // P(overflow | play this card)
  rowPickRate: number;         // P(row pick | play this card)
  avgOverflowPenalty: number;  // E[cattle | overflow]
  avgRowPickPenalty: number;   // E[cattle | row pick]
  avgOverflowGap: number;     // E[card - rowTop | overflow]
  expectedPenalty: number;     // E[total penalty per play]
  avgTurn: number;             // typical turn this card is played
}
```

### Per-turn baselines (`TURN_BASELINE[0..9]`)

```typescript
interface TurnBaseline {
  avgMinRowTop: number;    // average minimum row top at this turn
  avgMaxRowLen: number;    // average maximum row length
  avgPrimedRows: number;   // average number of rows with 5 cards
  minRowTopP50: number;    // median min row top
}
```

### Regenerating the prior

```bash
npx tsx scripts/build-prior-table.ts
```

Reads from `project/data/` training game JSON files.

## Benchmark Results

See `project/results/mcs-prior.md` for full tables. Summary:

### Head-to-head (1 mcs-prior vs 4 mcs, 200 games, mcPerCard=100)

| Strategy | Win Rate | Avg Score |
|----------|----------|-----------|
| mcs-prior | ~29% | ~18 |
| mcs (avg) | ~24% | ~21 |

### timingWeight sensitivity (200 games each)

| Weight | Win Rate |
|--------|----------|
| 0.0 | 18% |
| 0.15 | 23% |
| 0.3 | 27% |
| 0.5 | 26% |
| 0.7 | 22% |

### simDepth comparison (200 games)

| simDepth | Win Rate |
|----------|----------|
| 1 (default) | 22% avg |
| 2 | 17% |

## Design Philosophy

The strategy embodies a key 6 Nimmt insight: **you will pay for every dangerous card eventually — the question is when and how much.** The heuristic manages this by:

1. **Early game:** Shed high-penalty overflow cards (55, 66, etc.) while boards are sparse and placements are safe
2. **Mid game:** When cheap rows appear (1–2 cards), dump trapped cards (1, 2, 3...) at minimal cost
3. **Late game:** Urgency forces any remaining dangerous cards out before they compound

This matches strong human play: good players shed their worst cards early when the board cooperates, rather than hoping for favorable future states.

## Card Counting

Both `mcs` and `mcs-prior` track cards seen during the round via `seenCards` (updated in `onTurnResolved`). This narrows the unknown pool for opponent hand sampling.

**Important:** `seenCards` resets each round (`onRoundStart`) because decks regenerate via `createDeck(seed, round)` — cards can reappear across rounds.
