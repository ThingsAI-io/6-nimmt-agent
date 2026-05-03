# Competition Report: 1000-Game Tournament

> **Date:** 2026-05-02  
> **Duration:** ~43 minutes  
> **Seed:** `competition-bench-2026-05-02`  
> **ELO:** Standard chess (initial=1500, K=32, D=400, normalized by N−1)  
> **Player range:** 3–6 per game (random)

---

## Strategy Pool

| # | Strategy | Description |
|---|----------|-------------|
| 1 | `mcs-prior:mcPerCard=100` | Monte Carlo search with learned card priors, 100 rollouts/card |
| 2 | `mcs:mcPerCard=100` | Monte Carlo search, 100 rollouts/card |
| 3 | `mcs:mcPerCard=50` | Monte Carlo search, 50 rollouts/card |
| 4 | `bayesian-simple` | Bayesian row-gap estimation |
| 5 | `dummy-max` | Always plays highest card |
| 6 | `dummy-min` | Always plays lowest card |
| 7 | `random` | Uniform random card selection |

---

## ELO Leaderboard

| Rank | Strategy | ELO | ±StdDev | Games |
|------|----------|-----|---------|-------|
| 1 | **mcs:mcPerCard=100** | **1597** | ±14 | 475 |
| 2 | mcs:mcPerCard=50 | 1558 | ±15 | 491 |
| 3 | mcs-prior:mcPerCard=100 | 1500 | ±22 | 506 |
| 4 | bayesian-simple | 1431 | ±35 | 503 |
| 5 | dummy-max | 1367 | ±38 | 520 |
| 6 | random | 1198 | ±21 | 502 |
| 7 | dummy-min | 1083 | ±24 | 482 |

---

## Performance Statistics

| Strategy | Win Rate | Avg Score | Median | Min | Max | StdDev | Avg Winning Score |
|----------|----------|-----------|--------|-----|-----|--------|-------------------|
| **mcs:mcPerCard=100** | **38.5%** | **33.3** | 30 | 0 | 91 | 17.7 | 21.1 |
| mcs:mcPerCard=50 | 36.1% | 36.6 | 34 | 0 | 99 | 19.1 | 22.9 |
| mcs-prior:mcPerCard=100 | 34.3% | 37.5 | 36 | 1 | 94 | 18.8 | 24.5 |
| bayesian-simple | 25.0% | 43.1 | 42 | 0 | 100 | 22.3 | 22.8 |
| dummy-max | 16.0% | 48.2 | 48 | 2 | 93 | 21.1 | 25.0 |
| random | 5.3% | 61.8 | 66 | 3 | 106 | 18.2 | 32.1 |
| dummy-min | 3.2% | 66.0 | 69 | 7 | 111 | 18.4 | 26.1 |

---

## Key Findings

### 1. MCS dominates — more rollouts = better

`mcs:mcPerCard=100` is the clear winner with ELO 1597 (+97 above baseline) and 38.5% win rate. Doubling rollouts from 50→100 yields a meaningful +39 ELO improvement, confirming that computational budget directly translates to playing strength.

### 2. MCS-prior underperforms plain MCS

Surprisingly, `mcs-prior:mcPerCard=100` (ELO 1500) ranks **below** plain `mcs:mcPerCard=50` (ELO 1558). The learned card priors appear to hurt performance in this mixed-opponent pool. This aligns with the ETH paper finding that heuristic opponent modeling can degrade rollout quality.

### 3. Bayesian-simple is solidly mid-tier

At ELO 1431 and 25% win rate, `bayesian-simple` sits well above the naive strategies but ~170 points below the MCS variants. It's a strong baseline that requires zero computation.

### 4. dummy-max > random > dummy-min

Playing high cards (dummy-max, ELO 1367) significantly outperforms random play (ELO 1198), which in turn crushes always-low (dummy-min, ELO 1083). This confirms that in 6 Nimmt!, high cards have better placement options (more rows to legally attach to), while low cards are frequently "trapped" — forced to take a row.

### 5. Rating convergence

Standard deviations of 14–38 across 475–520 games indicate ratings have largely converged. The MCS strategies show the tightest convergence (±14–15), suggesting their performance is most consistent.

---

## Methodology Notes

- Each game randomly draws 3–6 players from the pool with replacement
- Same strategy can appear multiple times in one game (different seats tracked independently, then averaged)
- 1000 games × ~4.5 players/game = ~4,500 player-game observations total
- ELO uses pairwise decomposition (N-player → C(N,2) virtual 1v1 matchups)
- Rating changes normalized by (N−1) for stability across player counts
