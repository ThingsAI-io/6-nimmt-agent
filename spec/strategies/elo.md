# 6 Nimmt! — ELO Rating Specification

> Part of the [Technical Specification](../spec.md). See also: [Simulator](../simulator.md) · [Strategies](../strategies.md) · [CLI](../cli.md)
>
> **Prior art:** `johannbrehmer/rl-6-nimmt` tournament system (`tournament.py`) using the [`multi_elo`](https://pypi.org/project/multi-elo/) Python library. See [audit](../audits/rl-6-nimmt.md) §4 and [audit](../audits/ethz-bertschi-megret-2022.md) §2.

---

## 1. Purpose

The current `BatchRunner` produces aggregate statistics (win rate, mean score, std dev) but has no notion of *relative strength over time*. ELO ratings fill this gap:

- **Quantify relative skill** between strategies on a single numeric scale
- **Track rating evolution** across games, revealing whether strategies converge, diverge, or plateau
- **Enable tournament formats** where strategies can be compared head-to-head across many games
- **Provide a familiar metric** — ELO is universally understood in competitive contexts

---

## 2. Multi-Player ELO Formula

We use **standard chess ELO** with a pairwise decomposition for multi-player games.

> **Note:** This differs from BGA's ELO which uses elastic K (60→40), K×(N/2) scaling, and a 600-point rating diff cap. We deliberately use the simpler standard formula for reproducibility and comparability with academic literature.

### 2.1 Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Initial Rating** | 1500 | Standard chess ELO starting point |
| **K (development coefficient)** | 32 | Standard FIDE rapid chess K-factor |
| **D (scaling factor)** | 400 | Standard; 400-point diff → 10:1 expected odds |
| **N-player normalization** | ÷(N−1) | Stabilizes rating changes across 2–10 player games |

### 2.2 Expected Score

For players *i* and *j* with ratings R_i and R_j:

```
E(i, j) = 1 / (1 + 10^((R_j - R_i) / 400))
```

Player *i*'s total expected score against all opponents:

```
E_i = Σ_{j ≠ i} E(i, j)
```

### 2.3 Actual Score

After a game, players are ranked by final penalty score (lowest = best). Player *i*'s actual score against each opponent *j*:

```
S(i, j) = 1.0   if rank_i < rank_j    (i finished ahead)
         = 0.5   if rank_i == rank_j   (tie)
         = 0.0   if rank_i > rank_j    (i finished behind)
```

Total actual score:

```
S_i = Σ_{j ≠ i} S(i, j)
```

### 2.4 Ranking from Scores

Players are ranked by **ascending penalty score** (lower = better). Ties are handled by **fractional ranking**: if two players share penalty 12 and would be ranks 2 and 3, both get rank 2.5.

### 2.5 Rating Update

```
R_i' = R_i + K × (S_i - E_i) / (N - 1)
```

The division by `(N - 1)` normalizes the pairwise sum so that K=32 produces similar magnitude updates whether a game has 2 or 10 players.

---

## 3. Configuration

### 3.1 Defaults

| Parameter | Default | Description |
|-----------|---------|-------------|
| `initialRating` | `1500` | Starting ELO for all strategies |
| `K` | `32` | Development coefficient (constant, no schedule) |
| `D` | `400` | Scaling factor in expected score formula |

### 3.2 Comparison with BGA

| Aspect | BGA | Our Implementation |
|--------|-----|-------------------|
| Initial rating | 1500 | 1500 |
| K (early games) | 60 (first 30 games) | 32 (constant) |
| K (established) | 40 | 32 (constant) |
| N-player scaling | K × (N/2) — amplifies | K / (N−1) — normalizes |
| Rating diff cap | 600 | None |
| D | 400 | 400 |

Source: https://el.doc.boardgamearena.com/Rating

---

## 4. Module Structure

```
src/sim/
  elo.ts    — ELO calculation: expected score, actual score, rating update
  types.ts  — EloConfig, EloRating, EloSnapshot (new types alongside existing)
```

The ELO module is a **pure calculation layer** that sits alongside `stats.ts`. It does not replace existing statistics — it adds a new dimension.

---

## 5. Types

```typescript
/** Per-strategy ELO tracking state */
interface EloRating {
  readonly strategy: string;
  readonly rating: number;
  readonly gamesPlayed: number;
  readonly history: readonly number[];  // rating after each game
}

/** Snapshot of all ratings at a point in time */
interface EloSnapshot {
  readonly ratings: ReadonlyMap<string, EloRating>;
  readonly totalGames: number;
  readonly config: EloConfig;
}

/** Single game result for ELO processing */
interface EloGameInput {
  /** One entry per player, sorted by seat index */
  readonly players: readonly {
    readonly strategy: string;
    readonly penaltyScore: number;
  }[];
}
```

---

## 6. Core Functions

### 6.1 `computeExpectedScore`

```typescript
/**
 * Compute player i's expected score against all opponents.
 * Returns value in [0, N-1] where N is player count.
 */
function computeExpectedScore(
  playerRating: number,
  opponentRatings: readonly number[],
  D?: number,
): number;
```

### 6.2 `computeActualScore`

```typescript
/**
 * Compute player i's actual score from game ranks.
 * Ties produce fractional scores (0.5 per tied opponent).
 * Returns value in [0, N-1].
 */
function computeActualScore(
  playerRank: number,
  allRanks: readonly number[],
  playerIndex: number,
): number;
```

### 6.3 `rankFromScores`

```typescript
/**
 * Convert penalty scores to fractional ranks (1 = best).
 * Ties get the average of the ranks they span.
 */
function rankFromScores(penaltyScores: readonly number[]): number[];
```

### 6.4 `updateRatings`

```typescript
/**
 * Process one game result through the ELO system.
 * Returns updated EloSnapshot with new ratings for each participating strategy.
 *
 * When multiple players share a strategy, their results are treated independently
 * (each seat is a separate ELO entity). The strategy's displayed rating is the
 * average across its seats.
 */
function updateRatings(
  snapshot: EloSnapshot,
  game: EloGameInput,
): EloSnapshot;
```

---

## 7. Integration with BatchRunner

### 7.1 Per-Game Hook

After each `GameRunner` completes, feed the result into the ELO system:

```typescript
const eloInput: EloGameInput = {
  players: gameResult.playerResults.map(p => ({
    strategy: p.strategy,
    penaltyScore: p.finalScore,
  })),
};
eloSnapshot = updateRatings(eloSnapshot, eloInput);
```

### 7.2 Extended BatchResult

```typescript
interface BatchResult {
  // ... existing fields ...
  readonly elo?: EloSnapshot;  // present when ELO tracking is enabled
}
```

### 7.3 CLI Integration

Enable ELO tracking via the `simulate` command:

```bash
# Run tournament with ELO tracking
npx tsx src/cli/index.ts simulate \
  --strategies mcs-prior,mcs,bayesian-simple,random,random \
  --games 1000 \
  --elo

# Custom K factor
npx tsx src/cli/index.ts simulate \
  --strategies mcs-prior,mcs,bayesian-simple,random,random \
  --games 5000 \
  --elo --elo-k 16

# Output includes ELO table
```

### 7.4 Output Format

When `--elo` is enabled, the simulator appends an ELO table:

```
ELO Ratings (after 1000 games, K=32):
  Strategy         Rating  ±StdDev  Games
  mcs-prior         1612    ±24      1000
  mcs               1548    ±22      1000
  bayesian-simple   1487    ±26      1000
  random            1432    ±18      2000
```

In JSON output mode, the `elo` field contains the full `EloSnapshot`.

---

## 8. Convergence & Statistical Validity

### 8.1 Minimum Games

From the ETH paper (Bertschi & Mégret §3.1): at least **30,000 games** are needed for random agent results to stabilize. For ELO specifically:

- **100 games** per strategy — ratings begin to separate but are volatile (±50 points)
- **1,000 games** per strategy — ratings are meaningful for ordering (±20 points)
- **10,000+ games** per strategy — stable ratings suitable for fine-grained comparison

### 8.2 Confidence Interval

Rating uncertainty can be estimated from the standard deviation of the rating history over the last N games. A simple approach:

```
uncertainty = stddev(history.slice(-N)) where N = min(100, history.length)
```

This is reported as `±StdDev` in the output table.

---

## 9. Differences from Prior Art

| Aspect | Brehmer / ETH (`rl-6-nimmt`) | Our Implementation |
|--------|-------|-----|
| **Library** | Python `multi_elo` package | Pure TypeScript, zero dependencies |
| **Initial rating** | 1600 | 1500 (more standard) |
| **K factor** | 32, manually annealed to 4 in stages | 32 default, optional decay schedule |
| **Player handling** | Each agent instance is separate | Per-strategy pooling (seats share a strategy identity) |
| **Tie handling** | Fractional positions via `searchsorted` | Fractional ranks (standard competition ranking) |
| **Normalization** | None (K unadjusted for player count) | Divide by N−1 to stabilize across player counts |
| **Evolution** | Clone top agents, remove worst | Not applicable (strategies are stateless) |
| **Output** | Inline tournament table | Structured `EloSnapshot` + CLI table + JSON |

---

## 10. Non-Goals

- **Agent evolution** — their tournament clones/removes agents based on ELO. Our strategies are fixed, so evolution doesn't apply. ELO is purely a measurement tool.
- **Online learning** — ELO tracks rating, not strategy parameters. Strategies don't adapt based on their rating.
- **Cross-session persistence** — ratings live within a single batch run. Persisting ratings across runs (e.g., to a file) is a future extension.
