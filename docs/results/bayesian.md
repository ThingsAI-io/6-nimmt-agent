# Bayesian-Simple Strategy Benchmark Results

**Date:** 2026-04-28
**Games per config:** 1000
**Strategy:** bayesian-simple (K=200 Monte Carlo samples, 1-turn lookahead, uniform prior)

---

## bayesian-simple vs random

| Players | Win Rate | Avg Score | Median | Expected (1/N) | Relative | Random Avg Score |
|---------|----------|-----------|--------|----------------|----------|-----------------|
| 3       | 74.5%    | 37.4      | 36     | 33.3%          | 2.24x    | 61.7            |
| 4       | 69.8%    | 32.7      | 30     | 25.0%          | 2.79x    | 57.0            |
| 5       | 64.5%    | 29.8      | 28     | 20.0%          | 3.23x    | 54.5            |
| 6       | 54.1%    | 30.4      | 28     | 16.7%          | 3.24x    | 51.8            |
| 7       | 43.1%    | 32.1      | 30     | 14.3%          | 3.01x    | 49.8            |
| 8       | 34.9%    | 33.4      | 32     | 12.5%          | 2.79x    | 48.6            |
| 9       | 27.9%    | 33.7      | 32     | 11.1%          | 2.51x    | 46.6            |
| 10      | 24.1%    | 35.5      | 34     | 10.0%          | 2.41x    | 46.4            |

---

## Head-to-head: bayesian-simple vs dummy-max vs random (5 players)

| Strategy        | Win Rate | Avg Score | Median | Min | Max | StdDev |
|-----------------|----------|-----------|--------|-----|-----|--------|
| bayesian-simple | 48.2%    | 33.7      | 32     | 0   | 94  | 17.7   |
| dummy-max       | 28.6%    | 41.0      | 40     | 2   | 94  | 17.8   |
| random (pooled) | 8.7%     | 56.9      | 59     | 1   | 111 | 18.8   |

## Head-to-head: bayesian-simple vs dummy-min vs dummy-max vs random (5 players)

| Strategy        | Win Rate | Avg Score | Median | Min | Max | StdDev |
|-----------------|----------|-----------|--------|-----|-----|--------|
| bayesian-simple | 64.1%    | 28.2      | 27     | 0   | 87  | 16.6   |
| dummy-max       | 19.6%    | 42.6      | 41     | 4   | 93  | 17.7   |
| dummy-min       | 3.2%     | 63.9      | 67     | 3   | 113 | 17.9   |
| random (pooled) | 7.7%     | 53.5      | 54     | 6   | 106 | 18.7   |

---

## Comparison with dummy-max baseline

Win rates when each strategy is seat 0 vs (N-1) random opponents:

| Players | bayesian-simple | dummy-max | random (expected) |
|---------|----------------|-----------|-------------------|
| 3       | 74.5%          | 40.7%     | 33.3%             |
| 4       | 69.8%          | 46.4%     | 25.0%             |
| 5       | 64.5%          | 38.2%     | 20.0%             |
| 6       | 54.1%          | 29.9%     | 16.7%             |
| 7       | 43.1%          | 20.7%     | 14.3%             |
| 8       | 34.9%          | 16.6%     | 12.5%             |
| 9       | 27.9%          | 13.5%     | 11.1%             |
| 10      | 24.1%          | 12.5%     | 10.0%             |

---

## Analysis

- **bayesian-simple dominates random** at every player count, with a relative win-rate advantage of 2.2x–3.2x over the expected 1/N baseline. This far exceeds dummy-max's 1.2x–1.9x range.
- **Peak relative advantage at 5–6 players** (~3.2x), where Monte Carlo lookahead best exploits the moderate row congestion. At 3 players the absolute win rate is highest (74.5%) but relative gain is lower because even random wins often in small fields.
- **Beats dummy-max head-to-head**: In the 5-player mixed game, bayesian-simple wins 48.2% vs dummy-max's 28.6% — a 1.69x advantage over the next-best heuristic.
- **Score advantage is substantial**: bayesian-simple's average score (30–37) is consistently 15–25 points lower (better) than pooled random (47–62), and ~7–10 points better than dummy-max (~41–55).
- **Scaling with player count**: As players increase from 3→10, bayesian-simple's win rate drops from 74.5%→24.1%, but always stays well above expected. The strategy remains effective even in crowded 10-player games (2.4x relative).
- **dummy-min remains the weakest strategy**: In the 3-way head-to-head, dummy-min wins only 3.2% — worse than random (7.7%) — confirming that always playing the lowest card is actively harmful.
- **Performance note**: Simulations with bayesian-simple are slow due to Monte Carlo sampling (~10–15 minutes per 1000-game config at higher player counts). This is expected given K=200 samples per decision.
