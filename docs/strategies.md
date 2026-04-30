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

The strongest strategy. Simulates many random completions of the game from the current state and picks the card with the best expected score.

**Options:**

| Option | Default | Description |
|---|---|---|
| `mcMax` | `500` | Total number of Monte Carlo iterations |
| `mcPerCard` | `50` | Iterations per candidate card |

```bash
# Default
npm run play -- --strategy mcs

# More iterations (slower but stronger)
npm run play -- --strategy mcs:mcMax=2000,mcPerCard=200
```

## Benchmarking strategies

Use the simulator to compare strategies over many games:

```bash
# MCS vs 4 random players (1000 games)
npx tsx src/cli/index.ts simulate \
  --strategies mcs,random,random,random,random \
  --games 1000 \
  --format json

# Bayesian vs MCS (2-player, 500 games)
npx tsx src/cli/index.ts simulate \
  --strategies bayesian-simple,mcs \
  --games 500
```

## Strategy options syntax

Options are passed as colon-separated `key=val` pairs after the strategy name:

```
--strategy mcs:mcMax=1000,mcPerCard=100
```

## Row pick

All strategies also implement `chooseRow()` for when your card is lower than all row tails and you must pick up a row. Most strategies default to picking the row with the fewest cattle heads.
