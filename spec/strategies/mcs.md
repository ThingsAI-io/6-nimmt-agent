# Monte-Carlo Search (MCS) Strategy for 6 Nimmt!

## Overview

A Monte-Carlo Search strategy that simulates playout games from the current position to evaluate each possible card play. Inspired by AlphaZero's approach ("Alpha0.5" in the rl-6-nimmt reference implementation), adapted for 6 Nimmt!'s incomplete information setting.

**Key insight:** Unlike perfect-information games (chess, Go), 6 Nimmt! has hidden information (opponents' hands are unknown). MCS handles this by **sampling possible opponent hands** from the remaining card pool and simulating games against those sampled hands. Over many simulations, this produces robust move evaluations that account for uncertainty.

**Reference:** Johann Brehmer & Marcel Gutsche, "Beating 6 nimmt! with reinforcement learning" ([rl-6-nimmt](https://github.com/johannbrehmer/rl-6nimmt)). Their Alpha0.5 agent achieved a 42% win rate and ELO 1806, beating Monte-Carlo search (40%), ACER (18%), D3QN (17%), and Random (19%). It also beat a strong human player 3-2 in a 5-game match.

---

## Algorithm

### High-Level Flow

```
For each legal card in hand:
  Repeat N simulations:
    1. Sample opponent hands from unknown card pool
    2. Simulate game from current state to round-end
    3. Record our penalty score from the simulation
  Compute average penalty for this card
Choose card with lowest average penalty (least expected damage)
```

### Detailed Steps

#### 1. Card Memory (Information Tracking)

Maintain a set of **available cards** — cards that could be in opponents' hands:

```
availableCards = {1..104}
  - remove: my hand (known)
  - remove: board cards (visible)
  - remove: all previously played cards (observed in turn resolution)
```

At turn T in a round with N players:
- My hand has `10 - (T-1)` cards remaining
- Each opponent also has `10 - (T-1)` cards remaining
- `availableCards` contains exactly `(N-1) × (10 - T + 1)` cards (opponents' remaining hands)

#### 2. Sampling Opponent Hands (Information Set Sampling)

For each simulation, create a "determinized" game state:

```
shuffle(availableCards)
for each opponent i (1..N-1):
  opponent_hand[i] = availableCards[i*handSize .. (i+1)*handSize - 1]
  sort(opponent_hand[i])  // hands are always sorted
```

This is called **determinization** — we replace uncertainty with a concrete sample. Over many samples, this converges to the true expected value.

#### 3. Playout Simulation

From the sampled state, simulate the remainder of the round:

```
for each remaining turn:
  for each player:
    choose_action(player_hand, board)  → played_card
  resolve_turn(played_cards, board)  → penalties
  accumulate our_penalty
return total our_penalty for this round
```

#### 4. Action Selection During Playout

During simulation, players need a policy to select cards. Three options with increasing sophistication:

| Variant | Opponent Policy | Our Policy | Complexity |
|---------|----------------|------------|------------|
| **MCS** (pure random) | Random | Random (after first move) | Low |
| **PolicyMCS** | Neural network | Neural network | Medium |
| **PUCT** (Alpha0.5) | Neural network | PUCT formula | High |

**PUCT formula** (used for our first-move selection during simulation):

```
PUCT(a) = Q(a) + c_puct × P(a) × sqrt(N_total) / (1 + N(a))

where:
  Q(a) = normalized average return when action a was chosen (0 to 1)
  P(a) = prior probability from neural policy network
  c_puct = exploration constant (default 2.0)
  N(a) = number of times action a has been simulated so far
  N_total = total simulations so far
```

This balances exploitation (high Q) with exploration (high prior, low visit count).

#### 5. Final Decision

After all simulations complete, choose the card with **highest mean return** (least penalty):

```
best_card = argmax over legal_cards of mean(simulated_returns[card])
```

---

## Simplification: MCS Variant (No Neural Network)

For our initial implementation, we can use the **MCS variant** which requires no trained neural network:

- All simulated moves (both ours and opponents) are **uniformly random**
- Only the **first move** is varied systematically (one per legal action)
- Still achieves 40% win rate (ELO 1745) — strong enough to beat RL agents

### MCS Algorithm (Simplified)

```typescript
function recommendCard(hand: number[], board: Board, availableCards: number[], playerCount: number): number {
  const results: Map<number, number[]> = new Map();
  
  for (const card of hand) {
    results.set(card, []);
  }
  
  const nSimulations = Math.min(MAX_SIMS, SIMS_PER_CARD * factorial(hand.length));
  
  for (let sim = 0; sim < nSimulations; sim++) {
    // Sample opponent hands
    const opponentHands = sampleOpponentHands(availableCards, hand.length, playerCount - 1);
    
    // Create simulated game from current board state
    const simGame = createSimulation(board, hand, opponentHands);
    
    // Play out the round with random moves for everyone
    // But our first move is sampled proportionally or round-robin
    const firstCard = hand[sim % hand.length]; // or sample
    const penalty = playOutRound(simGame, firstCard);
    
    results.get(firstCard)!.push(penalty);
  }
  
  // Choose card with lowest average penalty
  let bestCard = hand[0];
  let bestMean = Infinity;
  for (const [card, penalties] of results) {
    const mean = penalties.reduce((a, b) => a + b, 0) / penalties.length;
    if (mean < bestMean) {
      bestMean = mean;
      bestCard = card;
    }
  }
  
  return bestCard;
}
```

---

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mcPerCard` | 50 | Simulations per candidate card |
| `mcMax` | 500 | Maximum total simulations (cap for large hands) |
| `cPuct` | 2.0 | PUCT exploration constant (Alpha0.5 variant only) |
| `simulationPolicy` | `"random"` | Policy for simulated moves: `"random"` (MCS) or `"neural"` (Alpha0.5) |

### Simulation Budget

The number of simulations scales with hand size:

```
n_simulations = min(mcMax, mcPerCard × hand.length)
```

| Cards in hand | Actual sims (mcMax=500) |
|--------------|-------------------------|
| 10 | 500 |
| 5 | 250 |
| 3 | 150 |
| 2 | 100 |
| 1 | 1 | (no choice) |

For turn 1 with 10 cards, we always hit the cap. This means each card gets ~10 simulations — enough for a decent estimate.

---

## Row Pick Decision

When forced to take a row (our card is lower than all row endings):

```
for each row (0..3):
  Simulate taking that row:
    - Penalty = sum of cattle heads in that row
    - Board state after = row replaced with our card
  Run MCS from resulting position for remaining turns
  
Choose row with lowest total expected penalty (immediate + future)
```

If time-constrained, fall back to **greedy minimum:** pick the row with fewest cattle heads.

---

## Comparison with Bayesian Strategy

| Aspect | Bayesian | MCTS |
|--------|----------|------|
| **Approach** | Analytical (expected value) | Empirical (simulation) |
| **Card probabilities** | Explicit belief distribution | Implicit via sampling |
| **Opponent modeling** | Assumes uniform random | Samples hands, plays them out |
| **Computation** | O(hand × rows) | O(simulations × turns × players) |
| **Accuracy** | Approximate (independence assumptions) | Converges to true value with more sims |
| **Row interactions** | Limited (one-step lookahead) | Full (simulates to round-end) |
| **Speed** | Very fast (<1ms) | ~27ms per decision (500 sims) |

**Key advantage of MCS:** It naturally captures **multi-turn interactions** — the penalty of a card isn't just about this turn, but how it affects the board for future turns. Bayesian only does one-step lookahead.

---

## Implementation Notes

### Integration with Our Engine

The MCS strategy needs:
1. **Game simulation capability** — ability to play out a round from any state (already have this in our engine)
2. **Card tracking** — available card pool (already maintained in session via `turnHistory`)
3. **Time budget** — configurable max simulations to meet BGA time constraints (~5-15s per turn)

### Performance Considerations

For live BGA play (5-15 second decision window):
- 500 simulations × 9 remaining turns × 4 players = ~18,000 game steps per decision
- Each game step is trivial (card placement + comparison) — should be <0.01ms
- **Measured time:** ~270ms per game (~27ms per decision) — well within budget

### Progressive Enhancement Path

1. **Phase 1: MCS** (random playouts) — no ML, deterministic, easy to test
2. **Phase 2: Heuristic policy** — use Bayesian scores as priors instead of uniform random
3. **Phase 3: PUCT** — trained neural policy for tree guidance (requires training infrastructure)

---

## Interaction with Session State

The MCTS strategy benefits greatly from **session state** (unlike one-shot recommendations):

- **Card memory** accumulates over the round as cards are revealed
- **Opponent play history** can inform a non-uniform opponent model (Phase 2+)
- **Running penalty totals** help evaluate row-take vs risk-taking decisions

Session events used:
- `round_started` → initialize card pool (104 - hand - board starters)
- `turn_resolved` → remove played cards from pool, update opponent model
- `session_recommend` → run MCTS with current state

---

## Expected Performance

Based on the reference implementation's tournament results:

| Variant | Expected Win Rate (4 players) | ELO |
|---------|-------------------------------|-----|
| Random baseline | ~19% | 1556 |
| MCS (random playouts) | ~40% | 1745 |
| Alpha0.5 (PUCT + neural) | ~42% | 1806 |

### Our Benchmark Results

#### MCS vs Random (100 games, 4 players, seed: bench-mcs-params)

| Strategy | mcPerCard | mcMax | Win Rate | Avg Score | Time/game |
|----------|-----------|-------|----------|-----------|-----------|
| mcs | 10 (default) | 100 | 64.0% | 37.3 | 57ms |
| mcs | 20 | 200 | 74.0% | 30.2 | 108ms |
| mcs | **50** | **500** | **82.0%** | **27.5** | **270ms** |
| bayesian-simple | K=200 | — | 70.0% | 32.5 | 567ms |

#### MCS vs Bayesian head-to-head (100 games, 4 players, seed: bench-mcs-vs-bayes)

Each game: 1×MCS + 1×bayesian-simple + 2×random

| MCS Config | MCS Win | Bayes Win | MCS Score | Bayes Score | Time/game |
|------------|---------|-----------|-----------|-------------|-----------|
| mcPerCard=10 (default) | 40.0% | 56.0% | 37.0 | 33.6 | 638ms |
| mcPerCard=20 | **61.0%** | 32.0% | 30.2 | 36.3 | 803ms |
| mcPerCard=50 | **75.0%** | 25.0% | **24.9** | 36.8 | 816ms |

**Conclusions:**

1. **MCS with adequate budget dominates bayesian.** At `mcPerCard=50`, MCS beats bayesian 3:1 in direct competition.
2. **MCS is more efficient.** Against random, MCS@50 achieves 82% win rate in 270ms/game vs bayesian's 70% in 567ms — better results at half the cost.
3. **The default budget (10) is too low.** This confirms the reference implementation's finding that simulation count is the key tuning parameter.
4. **Recommended production config:** `mcPerCard=50, mcMax=500` — best win rate at acceptable latency (~27ms per move decision).
