# Audit Report: "Understanding reinforcement learning with 6nimmt!"

> **Authors:** Fabio Bertschi & Jean Mégret (ETH Zürich, Distributed Computing Group)  
> **Supervisors:** Béni Egressi, Prof. Dr. Roger Wattenhofer  
> **Date:** July 18, 2022  
> **Type:** Group project report  
> **Source file:** `tmp/ga2021_raw.txt`  
> **Based on:** [johannbrehmer/rl-6-nimmt](https://github.com/johannbrehmer/rl-6-nimmt) (also audited in `rl-6-nimmt.md`)  
> **Audited:** 2026-05-02

---

## 1. Overview

This ETH Zürich project builds on Brehmer's `rl-6-nimmt` codebase (our earlier audit target) to investigate whether RL methods can learn strong 6 Nimmt! policies. The paper has two main contributions:

1. **Explainability via "rigging"** — they test 5 hand-crafted heuristics (point, close, value, scattering, risk) and measure how closely the best bot's play matches each heuristic, trying to reverse-engineer what the RL agent learned.

2. **Faster MCTS variants** — they develop `PUCTAgentModDirV`, a neural-network-assisted MCTS that replaces full rollouts with a learned value function, achieving ~5× speedup. Given equal wall-clock time, it beats the original PUCT agent (Alpha0.5).

**Key finding:** Pure MCS (random rollouts) is nearly as strong as PUCT (neural-guided rollouts). The neural network component adds little playing strength but massive computational cost. Speed — not sophistication — is the dominant factor.

---

## 2. Experimental Setup

- **Player count:** Fixed at 5 (simplification; varying player count noted as a challenge)
- **Rule simplification:** Same as Brehmer — automatic greedy row pick (lowest penalty), not player choice
- **Evaluation:** Mean score and win rate over 30,000+ games for heuristic tests, 300–2000 games for bot-vs-bot (with high variance acknowledged)
- **Baseline:** Random agent (uniform card selection)

---

## 3. Heuristic Analysis (Chapter 4)

The authors test 5 heuristic "rigs" — modifications to either a random agent or the PUCT agent that bias card selection. Each rig is evaluated in two ways:
1. **Standalone:** Rigged random agent vs 4 random agents (30,000 games)
2. **Similarity:** How often rigged Alpha0.5 plays the same card as un-rigged Alpha0.5

### 3.1 Point Rig

Play cards with high/low cattle heads first (controlled by τ parameter).

**Result:** No significant difference from random baseline. Card value (penalty points) alone is not a useful selection criterion.

### 3.2 Close Rig ⭐

Play cards that are "safe" — close enough to a row tail that opponents can't fill the gap. A distance parameter relaxes the safety margin (distance=0 means perfectly safe; distance=2 includes cards 2 positions beyond safe zone). If multiple safe cards exist, play the smallest.

**Results:**
- Consistently outperforms random (best at distance=0–1)
- Alpha0.5 only plays close 31.5% of the time when it could (vs 20.9% for random) — weak correlation
- Rigging Alpha0.5 with close rig *hurts* performance (0.95× at distance=0, 0.75× at distance=4)
- No turn-dependency — Alpha0.5 doesn't play more conservatively as the game progresses

**Interpretation:** Playing safe is beneficial in isolation but insufficient — the AI trades safety for more nuanced positioning.

### 3.3 Value Rig

Bias card selection toward a center value using a Gaussian distribution multiplied over card probabilities.

**Results:**
- Playing high cards first reduces penalties significantly (~20% improvement over random at center=104)
- No correlation with Alpha0.5 behavior (43–53% similarity)
- Rigging hurts performance (0.65–0.78×)

### 3.4 Scattering Rig

Play cards that are isolated (far from other hand cards) or bunched together, controlled by τ. Isolation measured by average distance to n nearest neighbors.

**Results:**
- Playing isolated cards improves over random (τ < 0)
- Moderate similarity with Alpha0.5 at τ = −5 (0.868), and near-parity performance (1.02×)
- **Best correlation with actual AI behavior of any rig tested**

**Interpretation:** Playing isolated cards is a genuine strategy — these cards have fewer placement options and are riskier to hold.

### 3.5 Risk Rig

Combines distance-to-row-tail and penalty-if-taken into a risk matrix R:
```
d[i,j] = 1 + |card_i - top(row_j)| / 104    if card < row tail (underflow)
        = 1 - empty_slots(row_j) / 5          if card > row tail (normal)
        = 0                                    if card is safe on row j

p[i,j] = penalties(row_j) + penalties(card_i) + 1.65 × empty_slots(row_j)

R[i,j] = α × d[i,j] + p[i,j]
```
Where 1.65 is the average cattle heads per card across the deck.

**Results:**
- Best case matches value rig performance (prioritizing distance over points)
- Low similarity with Alpha0.5 (0.41–0.71)
- Rigging hurts performance (0.76–0.86×)

### 3.6 Summary of Heuristic Findings

| Heuristic | Beats Random? | Explains Alpha0.5? | Rigs Help Alpha0.5? |
|-----------|:---:|:---:|:---:|
| Point (cattle heads) | ✗ | ✗ | ✗ |
| Close (safe cards) | ✓ | Weakly | ✗ |
| Value (high first) | ✓ | ✗ | ✗ |
| Scattering (isolated) | ✓ | Best match | Neutral |
| Risk (distance+penalty) | ✓ | ✗ | ✗ |

**Key insight:** No single heuristic explains the AI's behavior. The AI uses a blend of factors that no individual rig captures. The scattering rig is closest — suggesting "play isolated/risky cards early" is a real learned strategy.

---

## 4. Neural MCTS Variants (Chapter 5)

### 4.1 Problem: AlphaZero Doesn't Fit 6 Nimmt!

The authors identify three fundamental barriers to a full AlphaZero implementation:

1. **Imperfect information:** State is partially observable (opponent hands hidden). From any restricted state, there are C(90,4) = 2.56M possible opponent card combinations.
2. **Multiplayer:** AlphaZero's minimax-based backup doesn't extend beyond 2 players.
3. **Enormous state space:** ~10¹⁹ restricted initial states, with the game tree growing to billions of nodes across 10 depth levels.

### 4.2 Approaches Tried

| Variant | Method | Speed vs PUCT | Result |
|---------|--------|:---:|--------|
| **Predict Q** | PUCT formula for move selection, but after 1 step use NN to predict Q(s,a) instead of full rollout | ~5× faster | Comparable to PUCT |
| **Predict V** ⭐ | Same as Predict Q, but NN directly predicts V(s) instead of averaging Q values | ~5× faster | Slightly better than Predict Q |
| **Separate NN** | Decouple actor (policy) and critic (value) into separate networks | ~5× faster | Slightly worse |
| **Multi-Step V** | Roll out k steps with NN, then predict V | Not implemented | — |

### 4.3 Training Details

- **Value network:** MSE loss between predicted V(s) and actual game return, stagnates at MSE ≈ 16 (≈ 4 points off on average in a game where mean score is ~9)
- **Policy network:** Cross-entropy loss pushing toward deterministic probabilities
- **Discount factor:** γ = 0.99 chosen as compromise (γ=1 is unstable, γ=0.98 trains smoother but wins less)
- **Architecture:** MLP (100, 100), same as Brehmer's original

### 4.4 Key Result: Speed Beats Sophistication

| Agent | mc=50 | mc=100 | mc=200 | mc=300 | mc=400 |
|-------|-------|--------|--------|--------|--------|
| MCS (random rollout) | 0.20s | 0.38s | 0.73s | 1.07s | 1.39s |
| PUCT (NN-guided rollout) | 1.24s | 2.41s | 4.73s | 6.95s | 9.09s |
| PUCTModDirV (NN value) | 0.29s | 0.58s | 1.17s | 1.71s | 2.22s |

Given equal time (PUCT@50mc ≈ PUCTModDirV@200mc):

| Agent | Win Rate | Mean Score |
|-------|----------|------------|
| PUCTModDirV (200mc) | **40%** | **−8.88** |
| PUCT (50mc) | 29% | −10.03 |
| Random 1 | 15% | −13.36 |
| Random 2 | 15% | −13.45 |

**The faster bot wins by a large margin** — more simulations per second > smarter simulations.

### 4.5 MCS with Heuristic Guidance (Failed)

The authors tried directing MCS rollout opponents using their best heuristics (play high, play close, play isolated) instead of random play. **This performed poorly** — worse than both pure MCS and PUCT.

| Agent | Mean Score (300 games) |
|-------|----------------------|
| MCS (1200 mc, random rollouts) | −8.48 |
| PUCT (200 mc) | −9.41 |
| MCS Modified (1000 mc, heuristic rollouts) | −10.72 |
| MCS Modified (200 mc) | −12.35 |
| Always Highest | −19.87 |

**This is a critical finding:** Smarter opponent modeling during rollouts doesn't help and may hurt. The authors found this "inexplicable" but we can hypothesize: heuristic rollouts make opponents correlated, reducing the diversity of simulated outcomes and causing the search to overfit to specific board trajectories.

---

## 5. Comparison with Our Approaches

### 5.1 Architecture Comparison

| Dimension | ETH (Bertschi & Mégret) | Our Project |
|-----------|------------------------|-------------|
| **Language** | Python (PyTorch, OpenAI Gym) | TypeScript (pure computation, no ML framework) |
| **Game model** | Single-round, 5 players fixed | Multi-round (≥66 threshold), 2–10 players |
| **Row pick** | Automatic greedy (lowest penalty) | Player choice via `chooseRow()` |
| **State** | Flat float vector (47 dims) | Structured typed `CardChoiceState` with history, scores, discard tracking |
| **PRNG** | NumPy (non-deterministic) | xoshiro256** with SHA-256 seed derivation (reproducible) |
| **Evaluation** | Win rate + mean score (300–30,000 games) | `BatchRunner` with configurable games, JSON/table output |

### 5.2 Strategy Comparison

| Strategy | ETH | Our Equivalent | Notes |
|----------|-----|---------------|-------|
| Random | ✓ | `random` | Identical concept |
| MCS (random rollout) | ✓ (MCSAgent) | `mcs` | Same core idea; we support configurable `mcPerCard`, `mcMax`, `scoring` mode |
| PUCT (AlphaZero-inspired) | ✓ (PUCTAgent / Alpha0.5) | — | We don't have this; our `mcs-prior` is a different approach |
| Policy MCS (NN-guided rollout) | ✓ (PolicyMCSAgent) | — | No NN-guided rollouts |
| PUCTModDirV (NN value function) | ✓ | — | Their strongest; we have no learned value function |
| DQN / ACER / REINFORCE | ✓ (all failed) | — | We skipped these based on their findings — correct decision |
| Bayesian (probability-based) | — | `bayesian-simple` | Not in their work; unique to us |
| MCS + Prior heuristic | — | `mcs-prior` ⭐ | Not in their work; our strongest strategy |
| Dummy (min/max) | — | `dummy-min`, `dummy-max` | Bookend baselines; they used "always highest" once |

### 5.3 What They Found That We Already Do

1. **MCS as core strategy** — their MCSAgent ≈ our `mcs`. Both use random rollouts with opponent cards sampled from remaining deck.
2. **Rollout count matters more than sophistication** — our `mcPerCard` / `mcMax` tuning aligns with this finding.
3. **Deep RL is not worth it for 6 Nimmt!** — we correctly skipped DQN/ACER/REINFORCE approaches.

### 5.4 What They Found That We Do Differently

1. **Opponent model in rollouts:** They found heuristic opponent modeling *hurts* MCS rollout quality (Section 4.5 above — "inexplicable" poor MCS_Mod performance). Our `mcs-prior` uses `opponentModel: "prior"` which biases opponents toward safe cards. **This is a potential concern** — but our approach may avoid their failure mode because:
   - We use soft priors (probability weights), not hard heuristic overrides
   - Our priors are derived from 1300+ training games (empirical), not hand-crafted
   - We only apply priors to the card *selection* distribution, not the full rollout policy
   - Our benchmark data shows mcs-prior beating plain mcs (~29% vs ~24% win rate)

2. **Scattering heuristic:** Their best-correlating heuristic (isolated cards) is *not* explicitly modeled in any of our strategies. Our `mcs-prior` trapped-card logic partially captures this for card 1, but general "play isolated cards first" is not a feature.

3. **Close rig / safe cards:** They found this helps vs random but doesn't explain strong play. Our `mcs-prior` doesn't explicitly model "safe" cards (cards that can't cause row pickup), though the MC simulations implicitly evaluate this.

### 5.5 Where We're Stronger

1. **Row pick decision:** We model it correctly; they removed it entirely
2. **Multi-round play:** We track cumulative scores; they only play single rounds
3. **Richer state:** Discard tracking, turn history, scores — all fed to strategies
4. **Reproducible benchmarks:** Seeded PRNG enables exact replay
5. **Prior-enhanced MCS:** Our `mcs-prior` with empirical priors, timing weight, and trapped card management has no equivalent in their work
6. **Live play integration:** BGA browser automation — they only run offline experiments

### 5.6 Where They're Stronger

1. **Learned value function:** `PUCTModDirV` can evaluate board states without full rollout — we have no equivalent
2. **PUCT tree policy:** UCB-based exploration/exploitation during search — our MCS explores uniformly
3. **Neural policy for rollouts:** Guides simulations with learned move probabilities — our rollout opponent model is statistical, not learned
4. **Explainability analysis:** Systematic rigging methodology to understand bot behavior — we haven't done this

---

## 6. Implementation Opportunities

### 6.1 Learned Value Function (High Priority) 🎯

**What:** Train a neural network to predict game outcome V(s) from a board state, then use it to shortcut MCS rollouts.

**Why:** Their biggest win. PUCTModDirV is 5× faster per simulation than full rollouts, and the time saved buys 4× more simulations, netting a significant win rate improvement.

**How in our repo:**
1. Create a new strategy `mcs-value` that extends `MCSBase`
2. Replace the full rollout in `simulateGame()` with a 1-step forward simulation followed by a value function call
3. The value function could be:
   - A lightweight MLP (input: board state as flat vector, output: expected penalty score)
   - Trained offline on completed simulation data (we already capture this in `data/training/`)
   - Or even a hand-crafted heuristic V(s) based on row danger + hand quality (no ML needed)
4. **Non-ML approach first:** A hand-tuned value function using our existing prior table + row analysis could achieve most of the speedup without needing PyTorch/TensorFlow:
   ```
   V(s) ≈ Σ(row_danger[j] × fill_fraction[j]) + Σ(card_risk[i] for i in hand)
   ```
   Where `card_risk` comes from our prior table and `row_danger` is based on row length and penalty sum.

**Estimated effort:** Medium. The infrastructure (MCSBase, prior table) exists. Main work is the value function design and integration into the simulation loop.

### 6.2 PUCT Tree Policy (Medium Priority)

**What:** Replace uniform random card selection in the first simulation step with UCB1/PUCT exploration:
```
score(a) = Q(a) + c × √(ln(N_total) / N(a))
```

**Why:** Concentrates simulation budget on promising moves. Their PUCT outperforms MCS at equal simulation count (though not at equal time).

**How in our repo:**
1. Add UCB tracking to `MCSBase`: per-card visit counts N(a) and average returns Q(a)
2. First simulation step uses PUCT formula to select the card; remaining steps use random/prior rollout
3. Expose `cpuct` as a strategy option (they used c=2.0)

**Risk:** Their own finding is that PUCT's NN component adds minimal value — the formula alone (without learned P(s,a)) may not help much. Worth benchmarking but don't over-invest.

### 6.3 Scattering / Isolation Heuristic (Low–Medium Priority)

**What:** Add a "card isolation" factor to `mcs-prior` that prefers playing cards far from other hand cards.

**Why:** Their best-correlating heuristic with strong AI behavior. Isolated cards have fewer safe placement options and are riskier to hold.

**How in our repo:**
1. In `mcs-prior.ts`, compute isolation score for each card in hand:
   ```
   isolation(card) = mean(|card - other| for other in hand) / 104
   ```
2. Add as a prior weight factor (like `timingWeight` and `trappedDiscount`)
3. Expose as `isolationWeight` option

**Risk:** Low — this is a simple heuristic multiplication. May overlap with what MC simulations already discover.

### 6.4 Risk Matrix Heuristic (Low Priority)

**What:** Port their risk matrix calculation (distance-to-row × penalty-if-taken) as a fast heuristic strategy.

**Why:** Could serve as a cheap alternative to MCS for time-pressured decisions (e.g., when BGA timeout is approaching).

**How in our repo:**
1. Create `risk-heuristic` strategy that computes R[i,j] for each card×row pair
2. Select the card that minimizes max risk across rows
3. Sub-10ms decisions — useful as fallback

**Note:** Their risk rig performed only marginally better than the value rig. This is low-priority unless we need a fast fallback.

### 6.5 Offline Training Pipeline (Future)

**What:** Use our simulation infrastructure to generate training data for a learned value function.

**How:**
1. Run `mcs-prior` vs `mcs-prior` games (thousands), recording full game states at each turn
2. Label each state with the actual final score delta
3. Train a lightweight model (could even be a decision tree or linear model — their MLP was only 100×100)
4. Ship the model weights as a static asset alongside the prior table

**Dependency:** Requires 6.1 (value function integration) first.

---

## 7. Priority Ranking

| # | Opportunity | Impact | Effort | Priority |
|---|-----------|--------|--------|----------|
| 1 | Hand-crafted value function for rollout shortcutting (6.1, non-ML path) | High | Medium | **Do next** |
| 2 | Scattering/isolation heuristic in mcs-prior (6.3) | Medium | Low | **Quick win** |
| 3 | PUCT tree policy (6.2) | Medium | Medium | Benchmark first |
| 4 | Risk matrix fallback strategy (6.4) | Low | Low | If needed |
| 5 | ML value function + training pipeline (6.1 ML path + 6.5) | High | High | Long-term |

---

## 8. Key Takeaways

1. **Speed dominates sophistication** in 6 Nimmt! AI — more simulations per second wins over smarter per-simulation decisions
2. **No single heuristic explains strong play** — the game requires blending multiple factors, which MC search does implicitly
3. **Heuristic opponent modeling in rollouts is risky** — their MCS_Mod with "smart" opponents performed worse than random rollouts. Our soft-prior approach may avoid this, but we should monitor for similar degradation
4. **A learned value function is the most promising next step** — even a crude V(s) estimate can replace expensive rollouts, buying 4–5× more simulations per time unit
5. **Deep RL (DQN, ACER, policy gradient) is a dead end for this game** — the stochasticity and imperfect information make sample-efficient learning extremely difficult
