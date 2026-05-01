# MCS-Prior Strategy

## Problem Statement

Pure MCS simulates opponents playing **uniformly at random** from unknown cards. This is unrealistic — real players (and even MCS bots) avoid dangerous cards early and play safe mid-range cards when possible. The card priors dataset quantifies this: cards 91–104 overflow 20% of the time, cards 1–10 trigger row picks 60%+ of the time, while cards 51–60 are safest.

Two problems result:
1. **Our agent holds dangerous cards too long** — random opponents in sim are chaotic enough to "accidentally" clear rows, making holding a 95 look safe. In reality, opponents play smart and rows stay full.
2. **Simulations are too noisy** — random play creates unrealistic game states, wasting simulation budget on unlikely futures.

The goal: MCS-prior should make our agent **proactively dump dangerous cards when the board is safe**, just as strong human players do — while also modeling opponents more realistically.

## Approach: Prior-Informed Monte Carlo

Three integration points where the prior improves MCS, ordered by expected impact:

### 1. Leaf Evaluation (Heuristic Residual)

**The highest-leverage improvement.**

Current MCS simulates the entire remaining round to completion. This is expensive (N simulations × remaining turns). With a prior, we can:

- Simulate only 1–2 turns forward (cheap)
- Evaluate the resulting hand + board state using the prior as a **heuristic score**

**Heuristic**: For each card remaining in hand after the short simulation:
```
handDanger = Σ E[penalty | card=v, turn≈t, board_context]
```

Where `E[penalty]` comes from the prior's per-card overflow rate, row-pick rate, and expected penalties, adjusted by the current board state (min row top, primed rows).

**Board-adjusted formula:**
```
For each card v in remaining hand at turn t:
  if v < minRowTop:
    rowPickRisk = prior.rowPickRate[v] × (minRowTop - v) / baselineMinTop[t]
  else:
    overflowRisk = prior.overflowRate[v] × primedRowCount / baselinePrimedRows[t]
  
  cardDanger = rowPickRisk × prior.avgRowPickPenalty[v]
             + overflowRisk × prior.avgOverflowPenalty[v]

  // Timing pressure: penalize holding cards past their natural play time
  timingPressure = max(0, t - prior.avgTurn[v]) × timingWeight
  cardDanger *= (1 + timingPressure)
```

The timing pressure term captures: "if this card is normally played by turn 3 but it's turn 7, danger is escalating." This makes MCS-prior proactively dump dangerous cards early — the heuristic explicitly rewards playing cards *before* their danger window rather than holding them and hoping.

This means: instead of N=100 full-round simulations, we can do N=200 **one-turn** simulations + heuristic eval. More samples, better coverage of the immediate uncertainty, with the prior handling long-term risk estimation.

### 2. Opponent Modeling (Weighted Card Selection)

Instead of opponents playing uniformly at random, weight their card selection by the prior:

```
P(opponent plays card v at turn t) ∝ 1 / E[penalty | v, t]
```

Cards with low expected penalty (safe mid-range) are played preferentially. Cards with high expected penalty (extremes) are held/avoided.

**Implementation**: When sampling opponent plays in simulation:
- Compute weight for each card in the sampled opponent hand
- Sample from weighted distribution instead of uniform

**Refinement by turn**: The prior tells us average turn played per card. Cards typically played early (prior.avgTurn < 4) should have higher weight in early turns, and cards typically held late (prior.avgTurn > 7) should have lower weight.

## Prior Data Requirements

The strategy loads the prior JSON at initialization:

```typescript
interface McsPriorOptions extends McsOptions {
  priorPath?: string;          // path to prior JSON (default: auto-detect)
  simDepth?: number;           // turns to simulate forward (default: 1 for heuristic mode, full for classic)
  opponentModel?: 'uniform' | 'prior';  // how opponents select cards
  leafEval?: 'simulate' | 'heuristic' | 'hybrid';  // terminal evaluation
}
```

From the prior JSON, the strategy extracts a lookup table at init:

```typescript
interface CardPrior {
  overflowRate: number;        // P(overflow | play this card)
  rowPickRate: number;         // P(row pick | play this card)
  avgOverflowPenalty: number;  // E[cattle | overflow]
  avgRowPickPenalty: number;   // E[cattle | row pick]  
  avgOverflowGap: number;     // E[card - rowTop | overflow]
  expectedPenalty: number;     // E[total penalty per play]
  avgTurn: number;             // when this card is typically played
}
```

And per-turn board context baselines:

```typescript
interface TurnBaseline {
  avgMinRowTop: number;
  avgMaxRowLen: number;
  avgPrimedRows: number;
  minRowTopP50: number;        // median min row top at this turn
}
```

## Implementation Phases

### Phase 0: Extract MCS utilities into `mcs-base.ts`

Refactor `mcs.ts` to pull shared logic into a reusable module:

**`src/engine/strategies/mcs-base.ts`** (new):
```typescript
// Shared simulation primitives
export function fewestHeadsRowIndex(rows: readonly (readonly CardNumber[])[]): 0|1|2|3;
export function cloneBoard(board: Board): CardNumber[][];
export function fisherYates<T>(arr: T[], rng: () => number): T[];
export function simulateTurn(plays: CardNumber[], board: CardNumber[][]): number[];
export function accumulateTurn(taggedPlays, board, totalPenalties): void;

// Shared card-counting state management
export function buildUnknownPool(hand, board, seenCards, turnHistory, initialBoardCards): CardNumber[];
export function updateSeenCards(seenCards: Set<number>, resolution: TurnResolution): void;

// Shared opponent hand sampling
export function sampleOpponentHands(unknownPool, opponentCount, cardsPerPlayer, rng): CardNumber[][];
```

**`mcs.ts`** becomes thin — imports from `mcs-base.ts`, keeps only `simulateRound()` and the strategy factory.

**`mcs-prior.ts`** imports the same base, adds prior loading, heuristic eval, weighted sampling.

### Phase 1: Heuristic leaf evaluation
- Reduce sim depth to 1–2 turns
- Score terminal states with prior-based hand danger + timing pressure
- Expected improvement: faster + better (can run 3–5× more simulations in same time budget)

### Phase 2: Opponent modeling
- Replace uniform sampling with prior-weighted sampling
- Expected improvement: more realistic simulations, better in crowded boards

## Validation

Benchmark against plain `mcs` using the existing card-priors script framework:
- Run 1000 games of `mcs-prior` vs 4× `mcs` (both at same time budget)
- Measure: win rate, avg final score, avg penalty per card played
- The strategy should show improvement even at lower mcPerCard (since each sim is more informative)

## Open Questions

1. **How sensitive is heuristic eval to prior accuracy?** The prior is built from MCS-vs-MCS games. Against human opponents, the distributions may differ. Should we support loading different priors?

2. **Diminishing returns of sim depth**: Is 1-turn simulation + heuristic always better than full simulation? Probably depends on turn number — early game (many turns remaining) benefits more from heuristic; late game (1–2 turns left) should simulate fully.

3. **Prior staleness**: The prior is static. Should the strategy adapt its internal model based on observed opponent behavior within the current game? (e.g., if opponents are clearly aggressive, adjust risk estimates up)
