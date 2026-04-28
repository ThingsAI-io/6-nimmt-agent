# Dummy Strategies Benchmark Results

**Date:** 2026-04-28
**Games per config:** 1000
**Setup:** 1 dummy strategy + (N-1) random players

---

## dummy-min vs random

| Players | Win Rate | Avg Score | Expected (1/N) | Relative |
|---------|----------|-----------|----------------|----------|
| 3 | 17.2% | 64.6 | 33.3% | 0.52x |
| 4 | 16.6% | 59.2 | 25% | 0.66x |
| 5 | 13% | 57.8 | 20% | 0.65x |
| 6 | 10.4% | 56.3 | 16.7% | 0.62x |
| 7 | 8.4% | 54.3 | 14.3% | 0.59x |
| 8 | 11.3% | 49.8 | 12.5% | 0.9x |
| 9 | 7.7% | 50.5 | 11.1% | 0.69x |
| 10 | 8.7% | 47.9 | 10% | 0.87x |

## dummy-max vs random

| Players | Win Rate | Avg Score | Expected (1/N) | Relative |
|---------|----------|-----------|----------------|----------|
| 3 | 40.7% | 54.5 | 33.3% | 1.22x |
| 4 | 46.4% | 43.5 | 25% | 1.86x |
| 5 | 38.2% | 40.9 | 20% | 1.91x |
| 6 | 29.9% | 41.1 | 16.7% | 1.79x |
| 7 | 20.7% | 42.8 | 14.3% | 1.45x |
| 8 | 16.6% | 44.5 | 12.5% | 1.33x |
| 9 | 13.5% | 42.9 | 11.1% | 1.22x |
| 10 | 12.5% | 43.0 | 10% | 1.25x |

---

## Analysis

- **dummy-max** consistently outperforms random across all player counts (1.2x–1.9x relative win rate).
- **dummy-min** consistently underperforms random (0.5x–0.9x) — always playing the lowest card forces frequent row picks.
- **dummy-max peaks at 4–5 players** (~1.9x relative advantage), where the strategy benefits most from resolving last while rows haven't filled yet.
- At higher player counts (7–10), dummy-max's advantage diminishes as rows fill faster and even high cards can trigger overflows.
- **dummy-min's avg score improves** with more players (64.6 → 47.9) because penalties are distributed across more players, but it still loses more often.

