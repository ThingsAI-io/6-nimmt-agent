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
  readonly players: readonly { id: string; strategy: string }[];
  /** Random seed for reproducibility. Auto-generated if omitted. */
  readonly seed?: string;
}

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

1. Initialise `GameState` with player definitions and seed.
2. Loop rounds until `isGameOver()`:
   a. `dealRound()` — shuffle and deal.
   b. Loop 10 turns:
      - Call each player's strategy `chooseCard()` (via [Strategy interface](strategies.md)).
      - `resolveTurn()` — place cards lowest-first.
      - If `needs-row-pick`, call the relevant strategy's `chooseRow()`, then `applyRowPick()`.
   c. `scoreRound()` — tally penalties.
3. Return `GameResult`.

---

## 5. BatchRunner

Runs N games with the same configuration:

1. Derive per-game seeds from base seed: `hash(batchSeed + gameIndex)`.
2. Run each game via `GameRunner`.
3. Aggregate results into `BatchResult` via `stats.ts`.

---

## 6. Seed Derivation

See [Engine spec §2.2](engine.md#22-seed--prng) for full seed/PRNG specification.

- Batch base seed → per-game seed: `hash(batchSeed + gameIndex)`
- Per-game seed → per-round seed: `hash(gameSeed + round)`
