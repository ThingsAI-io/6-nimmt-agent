# Strategies

The engine ships with several pluggable strategies. All implement the same interface — `chooseCard()` and `chooseRow()` — so they can be swapped freely in simulations or live play.

## Available strategies

### `random`

Picks a card uniformly at random. Used as the baseline in benchmarks.

```bash
npm run play -- --strategy random
```

### `dummy-min`

Always plays the lowest card in hand.

```bash
npm run play -- --strategy dummy-min
```

### `dummy-max`

Always plays the highest card in hand.

```bash
npm run play -- --strategy dummy-max
```

### `bayesian-simple`

Maintains a probability distribution over cards not yet seen. Evaluates expected penalty for each candidate card given the current board and known card distribution.

```bash
npm run play -- --strategy bayesian-simple
```

### `mcs` — Monte Carlo Simulation

Simulates many random completions of the game from the current state and picks the card with the best expected score. Opponents are modeled as playing uniformly at random.

**Options:**

| Option | Default | Description |
|---|---|---|
| `mcMax` | `500` | Total number of Monte Carlo iterations |
| `mcPerCard` | `50` | Iterations per candidate card |
| `scoring` | `self` | `"self"` or `"relative"` (relative accounts for opponent penalties) |

```bash
# Default
npm run play -- --strategy mcs

# More iterations (slower but stronger)
npm run play -- --strategy mcs:mcMax=2000,mcPerCard=200
```

### `mcs-prior` — Monte Carlo + Prior Heuristic ⭐

**The strongest strategy.** Enhances MCS with:
- **Heuristic leaf evaluation** — simulates 1 turn forward, then scores remaining hand danger using a prior derived from 1300+ training games
- **Prior-weighted opponent model** — opponents play safe cards first (not uniform random)
- **Trapped card management** — turn-gated logic to dump low cards at the right time

Benchmarks: ~29% win rate vs plain MCS's ~24% (5-player, equal budget).

**Options:**

| Option | Default | Description |
|---|---|---|
| `mcPerCard` | `100` | Simulations per candidate card |
| `mcMax` | `1000` | Max total simulations |
| `simDepth` | `1` | Turns to simulate forward |
| `scoring` | `relative` | `"self"` or `"relative"` |
| `timingWeight` | `0.3` | Timing pressure multiplier (0.3–0.5 sweet spot) |
| `trappedDiscount` | `0.3` | Trapped card urgency ramp (0 = disabled) |
| `opponentModel` | `prior` | `"prior"` or `"uniform"` |

```bash
# Default (recommended for live play)
npm run play -- --strategy mcs-prior

# Tuned for faster decisions
npm run play -- --strategy mcs-prior:mcPerCard=50

# Disable trapped card heuristic (for benchmarking)
npm run play -- --strategy mcs-prior:trappedDiscount=0
```

## Benchmarking strategies

Use the simulator to compare strategies over many games:

```bash
# MCS-Prior vs 4 random players (1000 games)
npx tsx src/cli/index.ts simulate \
  --strategies mcs-prior,random,random,random,random \
  --games 1000 \
  --format json

# Bayesian vs MCS (2-player, 500 games)
npx tsx src/cli/index.ts simulate \
  --strategies bayesian-simple,mcs \
  --games 500

# MCS-Prior vs MCS head-to-head
npx tsx src/cli/index.ts simulate \
  --strategies mcs-prior,mcs,mcs,mcs,mcs \
  --games 200
```

## Strategy options syntax

Options are passed as colon-separated `key=val` pairs after the strategy name:

```
--strategy mcs-prior:mcPerCard=200,timingWeight=0.5
```

## Row pick

All strategies also implement `chooseRow()` for when your card is lower than all row tails and you must pick up a row. Most strategies default to picking the row with the fewest cattle heads.
