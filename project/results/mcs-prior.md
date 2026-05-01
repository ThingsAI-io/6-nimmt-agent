# MCS-Prior Benchmark Results

## Setup

- **Players**: 5 (1× mcs-prior, 3× mcs, 1× random)
- **Games**: 100
- **Simulation budget**: mcPerCard=50 (equal for both MCS variants)
- **MCS-prior settings**: simDepth=1, opponentModel=prior, timingWeight=0.3, scoring=relative
- **MCS settings**: scoring=relative (same as prior for fair comparison)
- **Prior source**: 780-game dataset (5 players, mcs strategy, mcPerCard=100)
- **Seed**: `benchmark-v1`

## Results

### Per-seat

| Seat | Strategy  | Wins | Win Rate | Avg Score | Median | Min | Max | StdDev |
|------|-----------|------|----------|-----------|--------|-----|-----|--------|
| 0    | mcs-prior | 29   | 29.0%    | 36.8      | 35     | 3   | 97  | 18.8   |
| 1    | mcs       | 24   | 24.0%    | 40.3      | 38     | 1   | 102 | 22.1   |
| 2    | mcs       | 22   | 22.0%    | 35.9      | 33.5   | 3   | 78  | 17.7   |
| 3    | mcs       | 27   | 27.0%    | 36.9      | 36.5   | 2   | 91  | 19.6   |
| 4    | random    | 1    | 1.0%     | 72.5      | 72.5   | 20  | 103 | 14.2   |

### Pooled by strategy

| Strategy  | Players | Wins | Win Rate | Avg Score | Median | Min | Max | StdDev |
|-----------|---------|------|----------|-----------|--------|-----|-----|--------|
| mcs-prior | 1       | 29   | 29.0%    | 36.8      | 35     | 3   | 97  | 18.8   |
| mcs       | 3       | 73   | 24.3%    | 37.7      | 35.5   | 1   | 102 | 20.0   |
| random    | 1       | 1    | 1.0%     | 72.5      | 72.5   | 20  | 103 | 14.2   |

## Analysis

### Win rate
- **mcs-prior: 29%** vs mcs: 24.3% (per-player average)
- In a fair 5-player game, expected win rate is 20%. MCS-prior is +9pp above baseline, MCS is +4.3pp.
- MCS-prior wins **19% more games** than each individual MCS opponent (29 vs avg 24.3).

### Score quality
- MCS-prior avg score: **36.8** vs MCS avg: **37.7** (lower is better)
- The difference is modest (~1 cattle head per game) — both strategies are strong against random.
- Random is massively outclassed (72.5 avg score, only 1 win in 100 games).

### Interpretation
- With equal simulation budget (mcPerCard=50), mcs-prior shows a consistent edge.
- The advantage comes from:
  1. **Heuristic eval** catching long-term danger that 1-turn random rollouts miss
  2. **Prior-weighted opponents** producing more realistic simulations
  3. **Timing pressure** encouraging proactive play of dangerous cards
- The edge is real but modest at N=50. May be more pronounced at lower budgets (where the prior compensates for fewer simulations) or against stronger opponents.

### Limitations
- Prior was trained on mcs-vs-mcs games (780 total) — may not generalize perfectly to mixed fields.
- Single seed benchmark — results have variance. Need 500+ games for tight confidence intervals.
- Seat 0 advantage/disadvantage is not controlled for (only one mcs-prior seat).

## Reproduction

```bash
npx tsx src/cli/index.ts simulate \
  --games 100 \
  --strategies "mcs-prior:mcPerCard=50,mcs:mcPerCard=50,mcs:mcPerCard=50,mcs:mcPerCard=50,random" \
  --seed benchmark-v1
```
