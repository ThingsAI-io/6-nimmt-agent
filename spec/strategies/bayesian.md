# Bayesian Strategy for 6 Nimmt!

## Overview

A Bayesian strategy maintains a **probability distribution over unobserved cards** (opponents' hands) and uses it to estimate the expected penalty of each possible play. It updates beliefs after each turn based on revealed information.

---

## Information Available

At any decision point, the strategy knows:

| Source | Information |
|--------|-------------|
| Own hand | Exact cards remaining |
| Board | 4 rows with all visible cards |
| Turn history | All plays from all previous turns (who played what, where it landed) |
| Initial board | The 4 starter cards for this round |
| Player count | N players (2–10) |
| Round/turn | Position in game |
| Scores | Cumulative penalties per player |

### Derivable Knowledge

From the above, we can compute the **unobserved card pool**:

```
allCards = {1..104}
knownCards = hand ∪ boardCards ∪ allPlayedCards (from turnHistory)
unknownPool = allCards \ knownCards
```

At turn T, `unknownPool` has `104 - 4(board starters) - 10(my hand dealt) - (N-1)×10(opponents dealt)` at start, minus all revealed cards. Since each player plays one card per turn, after T-1 turns we've observed `(T-1) × N` plays.

**Key insight:** We don't know _which_ cards are in _which_ opponent's hand, but we know the _pool_ they were dealt from, and we observe their plays over time.

---

## Core Model: Card Location Beliefs

### State Representation

For each card `c` in `unknownPool`, maintain a probability distribution over its location:

```
P(card c is in player i's hand | observations so far)
```

At round start (before any plays), the prior is uniform:
```
P(c ∈ hand_i) = (10 - turnsPlayed) / |unknownPool|   for each opponent i
```

Since each opponent has `(10 - turnsPlayed)` cards remaining out of the unknown pool.

### Bayesian Updates

After each turn resolves, update beliefs:

1. **Direct elimination:** Card played by opponent i → remove from pool, P = 0 for all other locations.
2. **Indirect inference (optional, advanced):** If opponent i played card X, they _chose_ X over their other cards. Under an assumed opponent model (e.g., "opponents play somewhat rationally"), this makes certain cards more/less likely to be in their hand.

#### Simple Update (no opponent modelling)

After turn T where opponent i plays card c_i:
- Remove c_i from unknownPool
- Remaining cards redistributed uniformly among remaining hand slots

#### Advanced Update (opponent modelling)

Assume opponents play with a rough heuristic (e.g., "play a card close to but above a row tail"). If opponent i played 47 when a row tail is 45, infer they're more likely to hold cards near row tails. This is computationally expensive and may have diminishing returns vs. simple tracking.

**Recommendation:** Start with simple uniform tracking. Add opponent modelling as a later enhancement.

---

## Decision: Card Choice

For each card `c` in my hand, estimate:

```
E[penalty(c)] = Σ over possible opponent plays × P(those plays) × penalty(c given those plays)
```

### Simplified Monte Carlo Estimation

Exact computation is intractable (combinatorial explosion of opponent hand assignments). Use sampling:

1. **Sample K scenarios** from the belief distribution:
   - For each scenario, assign remaining unknown cards to opponents randomly (respecting hand size constraints)
   - For each opponent, sample a play using a simple heuristic (e.g., uniform random from their assigned hand)

2. **For each of my candidate cards**, simulate placement given each scenario:
   - Determine resolution order (ascending across all plays)
   - Compute which row the card lands on
   - Check if it causes overflow (6th card) or forces a row pick
   - Compute expected cattle heads collected

3. **Pick the card with lowest expected penalty.**

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `K` (samples) | Number of Monte Carlo scenarios | 200 |
| `opponentModel` | How to sample opponent plays | `"uniform"` |
| `riskWeight` | How much to weight overflow risk vs. average penalty | 1.0 |
| `lookAhead` | Turns to simulate ahead (1 = immediate, 2+ = multi-turn) | 1 |

---

## Decision: Row Choice

When forced to pick a row (card lower than all tails), the decision is deterministic given current state — no uncertainty. Use a greedy heuristic:

1. **Fewest cattle heads** (default — same as dummy strategies)
2. **Row length consideration** — prefer taking short rows (fewer penalty cards) even if individual cards are heavier
3. **Future board value** — prefer leaving the board in a state favourable for remaining hand cards

Option 3 requires lookahead and is a potential enhancement.

**Recommendation:** Start with fewest-cattle-heads. Revisit after measuring card-choice improvements.

---

## Computational Budget

| Player count | Unknown pool (turn 1) | Possible assignments | Feasible? |
|---|---|---|---|
| 2 | 80 cards, 1 opponent × 10 | C(80,10) ≈ 1.6×10^12 | Monte Carlo only |
| 5 | 50 cards, 4 opponents × 10 | Astronomical | Monte Carlo only |
| 10 | 0 cards at start (all dealt!) | Exactly 1 assignment | Can be computed exactly! |

**Special case:** In a 10-player game, `10×10 + 4 = 104` — the entire deck is dealt. After observing each opponent's first play, we can narrow possibilities significantly. By mid-round, we can often _deterministically_ know opponents' hands.

---

## Strategy Variants

### `bayesian-simple`
- Uniform prior over card locations
- No opponent modelling (opponents play uniform random)
- K=200 samples, 1-turn lookahead
- Fewest-heads row pick
- **Target:** 20-30% improvement over random

### `bayesian-adaptive` (future)
- Same as simple, but learn opponent tendencies from turn history
- Weight opponent play sampling by observed patterns (e.g., "this player tends to play high cards")
- K=500 samples
- **Target:** 5-10% improvement over bayesian-simple

### `bayesian-deep` (future)
- Multi-turn lookahead (2-3 turns)
- Board state evaluation function for row picks
- Opponent modelling with per-player profiles
- K=1000 samples
- **Target:** Additional 5% over adaptive

---

## Implementation Considerations

### Performance

The strategy must run within MCP timeout (default: 5000ms per decision). Budget:
- 200 samples × N opponents × placement simulation ≈ 1-5ms per card candidate
- 10 cards in hand × 5ms = 50ms per decision
- Well within budget for `bayesian-simple`

### State Tracking

The strategy uses `onTurnResolved()` to maintain:
- `unknownPool: Set<CardNumber>` — cards not yet observed
- `opponentHandSizes: Map<string, number>` — remaining cards per opponent
- `playHistory: Map<string, CardNumber[]>` — what each opponent has played

### Integration with Engine

```typescript
interface BayesianConfig {
  samples: number;           // Monte Carlo samples (default: 200)
  opponentModel: 'uniform' | 'heuristic';
  riskWeight: number;        // Penalty weight (default: 1.0)
  lookAhead: number;         // Turns ahead (default: 1)
}
```

The strategy implements the standard `Strategy` interface — no engine changes needed.

---

## Open Questions

1. **Opponent modelling value:** Is it worth modelling opponents as non-random? The marginal improvement may not justify the complexity. Need empirical testing.

2. **Sample count sensitivity:** How does performance scale with K? Diminishing returns likely set in around K=100-500. Need to benchmark.

3. **10-player determinism:** In a 10-player game, we can often reconstruct opponent hands exactly by mid-round. Should we have a special fast-path for this case?

4. **Row pick lookahead:** Is the naive "fewest heads" heuristic actually optimal? Could consider: "which row, if I take it, leaves the best board state for my remaining cards?"

5. **Risk aversion:** Should the strategy minimize _expected_ penalty (risk-neutral) or minimize _worst-case_ penalty (risk-averse)? A risk-averse variant might perform better in competitive settings.

6. **Card value heuristic:** Even without Monte Carlo, a fast heuristic could be: "play the card whose placement row has the most available slots (fewest existing cards)". How does this compare to full Bayesian sampling?
