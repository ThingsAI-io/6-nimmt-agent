# 6 Nimmt! — Simulator Specification

> Part of the [Technical Specification](spec.md). See also: [Engine](engine.md) · [Strategies](strategies.md) · [CLI](cli.md)

---

## 1. Overview

The simulator is a pure TypeScript module that runs complete games using the [engine](engine.md). It has no CLI dependency — the [CLI](cli.md) is a thin wrapper over it.

---

## 2. Module Structure

```
src/sim/
  runner.ts   — GameRunner: runs a single game to completion
  batch.ts    — BatchRunner: runs N games, collects statistics
  stats.ts    — Statistical aggregation (win rates, score distributions)
  types.ts    — SimConfig, SimResult, BatchResult types
  index.ts    — Public API barrel export
```

---

## 3. Types

```typescript
interface SimConfig {
  /** Player definitions: strategy name for each seat. 2–10 players. */
  readonly players: readonly {
    id: string;
    strategy: string;
    params?: Record<string, unknown>;  // strategy-specific configuration
  }[];
  /** Random seed for reproducibility. Auto-generated if omitted. */
  readonly seed?: string;
}

// The `params` field is passed to the strategy factory function, enabling
// parameterised strategies (e.g., risk tolerance for heuristic strategies).
// Strategies that don't accept parameters ignore this field.

interface GameResult {
  readonly seed: string;
  readonly rounds: number;
  readonly playerResults: readonly PlayerResult[];
}

interface PlayerResult {
  readonly id: string;
  readonly strategy: string;
  readonly finalScore: number;
  readonly rank: number; // 1 = winner (lowest score)
}

interface BatchResult {
  readonly gamesPlayed: number;
  readonly config: SimConfig;
  readonly perStrategy: ReadonlyMap<string, StrategyStats>;
}

interface StrategyStats {
  readonly wins: number;
  readonly winRate: number;
  readonly avgScore: number;
  readonly medianScore: number;
  readonly minScore: number;
  readonly maxScore: number;
  readonly scoreStdDev: number;
}
```

---

## 4. GameRunner

Runs a single game to completion:

1. Initialise `GameState` with player definitions and seed via `createGame()`.
2. Loop rounds until `isGameOver()`:
   a. `dealRound()` — recollect all cards, shuffle, and deal.
   b. Call each strategy's `onGameStart()` [lifecycle hook](strategies.md) (first round only) or skip.
   c. Loop 10 turns:
      - Call each player's strategy `chooseCard()` (via [Strategy interface](strategies.md)).
      - `result = resolveTurn()` — place cards lowest-first.
      - While `result.kind === "needs-row-pick"`:
        - Call the relevant strategy's `chooseRow()` for `result.playerId`.
        - `result = applyRowPick(...)`.
      - Notify all strategies via `onTurnResolved()` with the turn's public resolution details.
   d. `scoreRound()` — tally penalties.
   e. Notify all strategies via `onRoundEnd()` with updated scores.
3. Return `GameResult`.

---

## 5. BatchRunner

Runs N games with the same configuration:

1. Derive per-game seeds from base seed: `SHA256(batchSeed + '/' + gameIndex)`.
2. Run each game via `GameRunner`.
3. Aggregate results into `BatchResult` via `stats.ts`.

---

## 6. Seed Derivation

See [Engine spec §2.2](engine.md#22-seed--prng) for full seed/PRNG specification.

- Batch base seed → per-game seed: `SHA256(batchSeed + '/' + gameIndex)`
- Per-game seed → per-round seed: `SHA256(gameSeed + '/' + round)`

---

## 7. Aggregation Semantics

When multiple players share a strategy name, their results are pooled:

- `wins` counts the number of player-games won (a game where 2 players tie for lowest score counts as 2 wins).
- `winRate = wins / (gamesPlayed × playersWithThisStrategy)`.
- `avgScore`, `medianScore`, `minScore`, `maxScore`, and `scoreStdDev` are computed over all player-game final scores for that strategy.

**Example:** with `--strategies mcs-prior,random,random,random,random` and 1000 games, the `random` strategy has 4000 player-game data points.

---

## 8. Player Count Considerations

The simulator must work correctly for **all valid player counts (2–10)**. Key differences across the range:

- **2 players:** Long games (few penalties per round), low overflow frequency, large deck remainder (80 cards unused per round). Tests must verify the game still terminates in reasonable time.
- **10 players:** Short games (many penalties per round), frequent overflow cascades, zero deck remainder. Tests must verify `dealRound()` handles the fully-exhausted deck correctly.
- **Mid-range (3–9):** Varying dynamics; no special handling needed, but should be covered by parameterized testing.

Integration and smoke tests should run at minimum **2, 5, and 10** player configurations to cover the extremes and a midpoint. See [Harness](harness.md) Layer 5 for statistical checks per player count.
