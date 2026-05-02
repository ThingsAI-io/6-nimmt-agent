# Simulator

The simulator runs complete games between configurable strategy combinations entirely in memory — no browser, no BGA, no network. Use it to benchmark strategies and measure improvement.

## Basic usage

```bash
# MCS vs 4 random players
npx tsx src/cli/index.ts simulate \
  --strategies mcs,random,random,random,random \
  --games 1000

# Two strategies head to head
npx tsx src/cli/index.ts simulate \
  --strategies bayesian-simple,mcs \
  --games 500

# Reproducible run with a seed
npx tsx src/cli/index.ts simulate \
  --strategies mcs,random,random \
  --games 1000 \
  --seed my-seed-42
```

## Output

Default table output:

```
Strategy   Games   Win%    Avg Score   Std Dev
mcs        1000    58.2%   32.1        8.4
random     1000    41.8%   47.6        12.1
```

JSON output (for scripting):

```bash
npx tsx src/cli/index.ts simulate \
  --strategies mcs,random \
  --games 1000 \
  --format json
```

## Strategy options in simulations

Pass options using colon syntax:

```bash
npx tsx src/cli/index.ts simulate \
  --strategies "mcs:mcMax=200,random,random,random" \
  --games 500
```

## Player count

The number of players is inferred from the number of strategies. Pass 2–10 strategies.

## Reproducibility

The `--seed` flag fixes the RNG so results are reproducible across runs:

```bash
npx tsx src/cli/index.ts simulate --strategies mcs,random --games 100 --seed abc123
```
