# MCS (Monte-Carlo Search) Strategy Benchmark Results

**Date:** 2026-04-28
**Games per config:** 100
**Strategy:** mcs (full-round Monte-Carlo search, configurable `mcPerCard` and `mcMax`)
**Source:** Adapted from Brehmer & Gutsche's [rl-6-nimmt](https://github.com/johannbrehmer/rl-6nimmt)

---

## Configuration

MCS has two key parameters:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `mcPerCard` | Simulations per candidate card | 50 |
| `mcMax` | Total simulation cap across all cards | 500 |

Effective sims/card = `min(mcMax / hand.length, mcPerCard)`. With 10 cards in hand at round start: `min(500/10, 50) = 50` sims per card.

---

## MCS parameter sweep vs 3×random (4 players, 100 games, seed: bench-mcs-params)

Setup: 1×MCS + 3×random

| mcPerCard | mcMax | Win Rate | Avg Score | Time/game | Time/move (est) |
|-----------|-------|----------|-----------|-----------|-----------------|
| 10 | 100 | 64.0% | 37.3 | 57ms | ~6ms |
| 20 | 200 | 74.0% | 30.2 | 108ms | ~11ms |
| **50** | **500** | **82.0%** | **27.5** | **270ms** | **~27ms** |

**Comparison baseline (same setup, same seed):**

| Strategy | Win Rate | Avg Score | Time/game |
|----------|----------|-----------|-----------|
| bayesian-simple (K=200) | 70.0% | 32.5 | 567ms |

**Key takeaway:** MCS@50 beats bayesian's win rate (82% vs 70%) at half the wall-clock cost (270ms vs 567ms).

---

## MCS vs bayesian-simple head-to-head (4 players, 100 games, seed: bench-mcs-vs-bayes)

Setup: 1×MCS + 1×bayesian-simple + 2×random

| MCS Config | MCS Win Rate | Bayes Win Rate | MCS Avg Score | Bayes Avg Score | Time/game |
|------------|--------------|----------------|---------------|-----------------|-----------|
| mcPerCard=10, mcMax=100 | 40.0% | 56.0% | 37.0 | 33.6 | 638ms |
| mcPerCard=20, mcMax=200 | 61.0% | 32.0% | 30.2 | 36.3 | 803ms |
| **mcPerCard=50, mcMax=500** | **75.0%** | **25.0%** | **24.9** | **36.8** | **816ms** |

**Key takeaway:** With adequate budget, MCS dominates bayesian 3:1 in direct competition.

---

## Analysis

### Why simulation count matters so much

MCS simulates the **entire remaining round** (all future turns) with randomly sampled opponent hands. With only 10 sims/card, the variance of multi-turn outcomes makes estimates extremely noisy. At 50 sims/card, the law of large numbers kicks in and the multi-turn lookahead becomes an advantage rather than a liability.

### MCS vs Bayesian: architectural comparison

| Dimension | MCS (mcPerCard=50) | bayesian-simple (K=200) |
|-----------|--------------------|-------------------------|
| Lookahead depth | Full round (all remaining turns) | 1 turn only |
| Samples per card | 50 | 200 |
| Total evaluations | ~500 full-round sims | ~2000 single-turn sims |
| Opponent model | Random play | Random play |
| Time per game (vs random) | 270ms | 567ms |
| Win rate vs random (4p) | 82% | 70% |

The deeper lookahead of MCS is worth more than the higher sample count of bayesian. MCS can anticipate multi-turn cascading penalties (e.g., playing a card now that sets up a bad position 3 turns later).

### Performance scaling

Time complexity per move: `O(mcPerCard × hand.length × turnsRemaining × playerCount)`

At `mcPerCard=50` with a full hand (10 cards), early-round moves take ~27ms. Later moves are cheaper as hand shrinks and fewer turns remain to simulate.

---

## Recommended production config

```
mcs:mcPerCard=50,mcMax=500
```

This provides the best balance of strength and speed. For time-critical scenarios (e.g., BGA with sub-second response requirement), this is well within budget at ~27ms per decision.

For maximum strength with no time constraint:
```
mcs:mcPerCard=100,mcMax=1000
```

---

## Future work

- **Higher budgets:** Test mcPerCard=100, 200 to find diminishing returns curve
- **Hybrid playout policy:** Use bayesian scoring inside MCS simulations instead of random play
- **Player count scaling:** Benchmark at 2-10 players (more players = more uncertainty = may need higher budget)
- **Head-to-head at higher game counts:** Run 1000+ games for tighter confidence intervals
