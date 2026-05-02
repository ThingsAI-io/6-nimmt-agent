# Audit Report: `johannbrehmer/rl-6-nimmt`

> **Source:** <https://github.com/johannbrehmer/rl-6-nimmt>  
> **License:** MIT (2020, Johann Brehmer & Marcel Gutsche)  
> **Language:** Python 3.6+ (PyTorch, OpenAI Gym)  
> **Audited:** 2026-04-26

---

## 1. Overview

A reinforcement-learning research project that implements 6 Nimmt! as an OpenAI Gym environment and trains multiple RL agents to play it. The project includes a tournament system with ELO ratings for comparing agent performance.

**Key result:** Monte-Carlo tree search (PUCT/AlphaZero-inspired) significantly outperforms deep RL methods (DQN, ACER, REINFORCE), which barely beat the random baseline.

| Agent | ELO | Win Rate | Mean Score |
|-------|-----|----------|------------|
| Alpha0.5 (PUCT) | 1806 | 42% | −7.79 |
| MCS (random playout) | 1745 | 40% | −8.06 |
| ACER (actor-critic) | 1629 | 18% | −12.28 |
| D3QN (Rainbow-ish) | 1577 | 17% | −13.32 |
| Random | 1556 | 19% | −13.49 |

---

## 2. Game Environment (`rl_6_nimmt/env.py`)

### 2.1 Implementation

OpenAI Gym `Env` subclass (`SechsNimmtEnv`). Configurable player count, but defaults to standard parameters: 104 cards, 4 rows, threshold of 6 cards per row.

### 2.2 State Representation

Observation is a flat float vector of shape **(47,)** (with summaries enabled):

| Segment | Size | Content |
|---------|------|---------|
| Hand | 10 | Card indices (0–103), −1 for empty slots |
| Player count | 1 | Number of players |
| Cards per row | 4 | Row lengths |
| Highest card per row | 4 | Row tail values |
| Penalty per row | 4 | Sum of cattle heads in each row (excluding tail) |
| Raw board | 24 | Flattened 4×6 grid, −1 for empty slots |

All values are raw (not normalized). A separate `SechsNimmtStateNormalization` PyTorch module normalizes to [−1, 1] for neural network input.

**Notably absent from state:**
- Other players' scores
- Cards already played / discard tracking
- Round number / turn number
- History of previous turns

### 2.3 Action Space

`Discrete(104)` — action is the card index to play. Legal actions are the cards currently in the player's hand.

### 2.4 Reward Function

- **Negative-only** (penalty minimization)
- Reward = −(cattle heads of collected cards) when a player triggers row overflow
- Sparse: zero reward on most turns
- No reward shaping or intermediate signals

### 2.5 Cattle Heads Scoring

```
Card 55:              7 points
Multiples of 11:      5 points (11, 22, 33, 44, 66, 77, 88, 99)
Multiples of 10:      3 points (10, 20, 30, 40, 50, 60, 70, 80, 90, 100)
Multiples of 5:       2 points (5, 15, 25, 35, 45, 65, 75, 85, 95)
All others:           1 point
```

This matches the standard 6 Nimmt! scoring rules.

### 2.6 Rule Simplifications

| Aspect | Standard 6 Nimmt! | This Implementation |
|--------|-------------------|---------------------|
| **Rule 4 (row pick)** | Player freely chooses which row to take | **Automatic:** greedy pick of row with fewest penalty points |
| **Game end** | Any player reaches ≥66 cattle heads | Hand empties (single round only) |
| **Multi-round** | Multiple rounds until ≥66 threshold | Single round per game |
| **Player count** | 2–10 | Tested with 2–4 |

**The rule 4 simplification is the most significant deviation.** It removes a key strategic decision point from the game. The code has a TODO acknowledging this.

### 2.7 Game Flow

1. Shuffle deck, deal 10 cards per player, place 4 cards as row starters
2. All players simultaneously select a card (via `step(actions)`)
3. Cards resolved in ascending order: each card placed on the row whose tail is the closest lower value
4. If card < all tails → automatic greedy row pick (simplified rule 4)
5. If row reaches 6 cards → overflow, player collects penalty
6. Repeat for 10 turns until hands empty

---

## 3. Agent Implementations (`rl_6_nimmt/agents/`)

### 3.1 Agent Registry

18 agent variants registered in a string-keyed dictionary:

```python
AGENTS = {
    "human": Human, "random": DrunkHamster,
    "reinforce": BatchedReinforceAgent, "acer": BatchedACERAgent,
    "dqn": DQNVanilla, "ddqn": DDQNAgent,
    "duelling_dqn": DuellingDQNAgent, "duelling_ddqn": DuellingDDQNAgent,
    "dqn_prb": DQN_PRBAgent, "ddqn_prb": DDQN_PRBAgent,
    "duelling_ddqn_prb": DuellingDDQN_PRBAgent,
    "dqn_nstep": DQN_NStep_Agent, "d3qn_prb_nstep": D3QN_PRB_NStep,
    "noisy_dqn": Noisy_DQN, "noisy_d3qn_prb_nstep": Noisy_D3QN_PRB_NStep,
    "noisy_d3qn": Noisy_D3QN,
    "mcts": MCSAgent, "pmcs": PolicyMCSAgent, "puct": PUCTAgent,
}
```

### 3.2 Base Agent

All agents inherit from `Agent(nn.Module)`:
- `forward(state, legal_actions)` → `(action, info_dict)`
- `learn(state, reward, action, done, next_state, ...)` → loss
- Default optimizer: Adam, γ=0.99

### 3.3 Policy Gradient Agents

#### REINFORCE (`BatchedReinforceAgent`)
- **Network:** MLP (100, 100), ReLU, input = state + action (batched over legal actions)
- **Training:** End-of-episode, discounted returns × log-prob
- **Result:** Poor — did not clearly outperform random

#### ACER (`BatchedACERAgent`)
- **Network:** 2-head MLP (100, 100) — policy head + Q-value head
- **Training:** Off-policy with importance sampling, truncated at ρ=1.0, rollout length 10, warmup 100 steps
- **Loss:** Actor loss (IS-weighted) + correction term + critic loss (SmoothL1)
- **Result:** Slightly above random (ELO 1629 vs 1556)

### 3.4 Value-Based Agents (DQN Family)

Built via multiple inheritance, composing features:

| Feature | Variant |
|---------|---------|
| Base DQN | `DQNVanilla` — MLP (64,), ε-greedy (exp decay, min 5%) |
| Double DQN | `DDQNAgent` — target network, soft update τ=0.01 |
| Duelling | `DuellingDQNAgent` — V(s) + A(s,a) streams |
| Priority Replay | `DQN_PRBAgent` — SumTree-based, α=0.6, β=0.4→1.0 |
| N-Step Returns | `DQN_NStep_Agent` — multi-step TD targets |
| Noisy Nets | `Noisy_DQN` — factorized Gaussian noise, σ=0.5 |
| **Full combo** | `Noisy_D3QN_PRB_NStep` — all of the above (Rainbow-like) |

**Result:** D3QN variants reached ELO ~1577 — marginally above random.

### 3.5 Tree Search Agents

#### MCS (`MCSAgent`)
- Pure Monte Carlo search with random rollouts
- `mc_max=100` simulations per decision
- Maintains `available_cards` list for imperfect-information handling
- Recreates full `SechsNimmtEnv` for each rollout
- **Result:** ELO 1745, 40% win rate — strong

#### Policy MCS (`PolicyMCSAgent`)
- MCTS with learned neural policy for rollouts
- MLP (100, 100) guides rollout action selection
- Trained via policy gradient on rollout outcomes

#### PUCT (`PUCTAgent`)
- AlphaZero-inspired PUCT formula: `Q + c_puct × P × √N_total / (1 + N_action)`
- `c_puct=2.0`, neural policy prior
- Q-values normalized to [0, 1]
- **Result:** ELO 1806, 42% win rate — best agent

---

## 4. Tournament System (`rl_6_nimmt/tournament.py`)

### 4.1 Structure

- Randomly selects 2–4 agents per game
- Tracks per-agent: games played, scores, win fraction, ELO
- ELO: initial 1600, K=32 (annealed to 4 in later stages)
- Multi-player ELO via `multi_elo` library

### 4.2 Evolution

`evolve()` clones top performers and removes weakest:
- Copies best agents (deep clone via `torch.save/load`)
- Maintains lineage tracking (descendant chains)
- Supports configurable number of copies and max descendants

### 4.3 Experiment Protocol

4000 games total across 4 stages:
1. **Stage 1 (2000 games):** 5 agents, mc_max=200, K=32, evolve every 400 games
2. **Stage 2 (1200 games):** mc_max=400, K=16
3. **Stage 3 (800 games):** K annealed 32→16→8→4, 200 games per K value
4. **Final:** Keep best instance of each agent type, report results

---

## 5. Infrastructure & Utilities

### 5.1 Neural Network Components (`utils/nets.py`)

| Component | Purpose |
|-----------|---------|
| `MultiHeadedMLP` | Shared backbone + multiple output heads |
| `DuellingDQNNet` | V(s) + A(s,a) architecture |
| `NoisyLinear` | Parameterized noise for exploration |
| `NoisyFactorizedLinear` | Efficient factorized noise variant |
| `CNN` | Conv2D network (WIP, unused) |

### 5.2 Replay Buffers (`utils/replay_buffer.py`)

| Buffer | Sampling | Used By |
|--------|----------|---------|
| `History` | Uniform random | DQN, REINFORCE |
| `PriorityReplayBuffer` | TD-error weighted (SumTree) | DQN+PRB variants |
| `SequentialHistory` | Sequential rollouts | ACER |

Priority buffer uses numba JIT for performance.

### 5.3 State Preprocessing (`utils/preprocessing.py`)

`SechsNimmtStateNormalization(nn.Module)` normalizes raw state to [−1, 1]:
- Cards: [0, 103] → [−1, 1]
- Player count: [0, 6] → [−1, 1]
- Row stats: scaled per feature
- Handles both single states and batched inputs

### 5.4 Dependencies

```
pytorch >= 1.4.0     # Deep learning framework
gym[atari] >= 0.17.0 # OpenAI Gym environment
numpy >= 1.16.0      # Numerical computing
numba                 # JIT compilation (replay buffer)
scipy >= 1.2.0       # Scientific computing
scikit-learn >= 0.21  # ML utilities
matplotlib >= 3.0     # Plotting
tensorboard           # Training visualization
configargparse        # Configuration management
```

---

## 6. Relevance to Our Project

### 6.1 Directly Relevant

| Component | Their Approach | Our Spec | Gap / Opportunity |
|-----------|---------------|----------|-------------------|
| **Cattle heads scoring** | Identical to standard rules | Identical | ✅ Validates our spec |
| **Card placement rules** | Correct (rules 1–3) | Correct | ✅ Consistent |
| **State representation** | Flat vector (47 floats) | Structured `GameState` with typed fields | Our model is richer — includes history, scores, phase |
| **Strategy interface** | `Agent.forward(state, legal_actions)` → action | `Strategy.chooseCard(state)` / `chooseRow(state)` | Our interface separates card choice from row choice (critical for rule 4) |
| **PRNG / seeding** | NumPy random (not deterministic across runs) | xoshiro256** with SHA-256 seed derivation | Our approach enables reproducible benchmarking |
| **Tournament / ELO** | Multi-player ELO with evolution | `BatchRunner` with statistical aggregation | We could add ELO as a metric in our stats module |
| **MCTS for 6 Nimmt!** | PUCT is best agent (ELO 1806) | Planned as future strategy | Validates MCTS as priority strategy to implement |

### 6.2 Key Findings for Our Strategy Design

1. **MCTS dominates deep RL** — PUCT (42% win rate) vs D3QN (17%) and ACER (18%). This suggests our strategy roadmap should prioritize MCTS-based approaches over pure neural network strategies.

2. **Deep RL barely beats random** — both D3QN and ACER struggled. The stochastic nature of 6 Nimmt! and sparse rewards make it a challenging RL environment. Reward shaping may help.

3. **Their state representation is impoverished** — no opponent score tracking, no discard history, no round/turn context. Our `CardChoiceState` and `RowChoiceState` are significantly richer and should enable better AI.

4. **Rule 4 simplification is a major gap** — they automated the row-pick decision (greedy), which removes a significant strategic element. Our separate `chooseRow()` method correctly models this decision point.

5. **Imperfect information handling** — their MCTS agents maintain `available_cards` tracking for hidden information. Our `CardChoiceState` already exposes `discardedCards` and `knownInformation`, which is better structured.

6. **Small network sizes sufficient** — policy agents use (100, 100) MLPs, DQN uses (64,). Game complexity doesn't require large networks.

7. **Rollout count matters** — PUCT with mc_max=400 outperformed mc_max=200. Search depth/breadth is more important than network sophistication.

### 6.3 What We Could Adopt

- **ELO rating system** for strategy comparison — post-MVP, once multiple strategy types exist (Bayesian, MCTS, etc.). Not needed for random-only baseline. Their `multi_elo` multi-player adaptation is a good starting point.
- **Tournament evolution** concept for strategy selection experiments (post-MVP)
- **PUCT formula** (c_puct × P × √N / (1+n)) as starting point for our MCTS strategy (post-MVP)
- **Priority replay buffer** architecture if we implement learning-based strategies (post-MVP)
- **Baseline comparison protocol** — their "5 agents, 4000 games, clone best" approach is sound (post-MVP)

### 6.4 What We Should Avoid

- **Simplified rule 4** — our spec correctly requires player choice; do not regress
- **Single-round games** — our spec correctly models multi-round play with ≥66 threshold
- **Flat state vector** — our structured typed state is better for both AI and human reasoning
- **Non-deterministic PRNG** — their NumPy random prevents reproducible benchmarks
- **No legal action enforcement** — they rely on agent cooperation; our engine should enforce preconditions

---

## 7. Summary

A well-structured RL research project that validates several of our design decisions (cattle heads scoring, rule correctness, MCTS as top strategy). Its main limitations — simplified rule 4, single-round games, flat state representation, non-deterministic PRNG — are all areas where our spec is already stronger. The dominant finding that MCTS beats deep RL for 6 Nimmt! should inform our strategy implementation priorities.
