# 6 Nimmt! — Strategy Interface Specification

> Part of the [Technical Specification](spec.md). See also: [Engine](engine.md) · [Simulator](simulator.md) · [CLI](cli.md)

---

## 1. Interface

Strategies are pluggable via a single interface. New strategies are added by implementing the interface — no engine changes required (Open/Closed Principle).

```typescript
interface Strategy {
  /** Unique identifier, e.g. "random", "bayesian". Used in CLI and logs. */
  readonly name: string;

  /** Choose which card to play from hand. Called every turn. */
  chooseCard(state: CardChoiceState): CardNumber;

  /** Choose which row to pick up. Called only when the played card is
   *  lower than all row tails. */
  chooseRow(state: RowChoiceState): 0 | 1 | 2 | 3;

  // --- Lifecycle hooks (optional) ---

  /** Called once when a game begins. Use to initialise internal state.
   *  @param rng — a seeded PRNG for deterministic randomness. */
  onGameStart?(config: {
    playerId: string;
    playerCount: number;
    rng: () => number;
  }): void;

  /** Called after each turn resolves with full public resolution details.
   *  Use to update opponent models, card tracking, etc. */
  onTurnResolved?(resolution: TurnResolution): void;

  /** Called after each round is scored. */
  onRoundEnd?(scores: readonly { id: string; score: number }[]): void;
}

/** Public information about a resolved turn. */
interface TurnResolution {
  readonly turn: number;
  readonly plays: readonly { playerId: string; card: CardNumber }[];
  readonly rowPickups: readonly {
    playerId: string;
    rowIndex: number;
    collectedCards: readonly CardNumber[];
  }[];
  readonly boardAfter: Board;
}
```

Input types (`CardChoiceState`, `RowChoiceState`) are defined in the [Engine spec §1.6](engine.md#16-visible-state-strategy-input). `TurnResolution` is defined here.

**Information hiding invariant:** `chooseCard()` is called *before* card reveal — a strategy never sees other players' card choices for the current turn. Simultaneity is enforced architecturally by the `CardChoiceState` projection, not by convention.

---

## 2. Illegal Strategy Output

The engine validates every strategy response:

- **Card not in hand** → engine error (bug in strategy). The simulator logs the error and forfeits the player's turn by playing their lowest card.
- **Row index out of range** → engine error. The simulator picks the row with the fewest cattle heads.
- **Strategy throws** → caught by the simulator, logged, and treated as forfeit (lowest card / fewest-heads row).

---

## 3. Strategy: Random (Baseline)

The simplest possible strategy. Provides a performance floor for benchmarking.

- `chooseCard`: picks uniformly at random from hand, using the `rng` function provided via `onGameStart()` (not `Math.random()`), ensuring deterministic reproducibility.
- `chooseRow`: picks the row with the fewest total cattle heads (deterministic tiebreak by lowest row index).

**Rationale for chooseRow:** Even for "random", picking a random row to take would be pathologically bad and not useful as a baseline. The row-pick is a damage-mitigation decision with an obvious greedy answer; using it makes "random" a fairer baseline.

---

## 4. Strategy Registration

Strategies are registered in a map for CLI lookup:

```typescript
const strategies: ReadonlyMap<string, () => Strategy>;
// "random" → RandomStrategy
// "greedy" → GreedyStrategy (future)
// "bayesian" → BayesianStrategy (future)
```

The [CLI](cli.md) `strategies` command lists all registered strategies.

---

## 5. Module Structure

```
src/engine/strategies/
  random.ts        — Random baseline strategy
  index.ts         — Strategy registry (map of name → factory)
```

Future strategies are added here without modifying any existing code.

---

## 6. Strategy Randomness

Strategies requiring randomness (e.g. the random baseline) **must** use the `rng` function provided via `onGameStart()`, not `Math.random()`. This ensures deterministic reproducibility — the same game seed always produces the same game, including strategy decisions.

The `rng()` function returns a float in [0, 1) and advances the PRNG state on each call. Each strategy instance receives its own independent PRNG stream derived from the game seed and player ID.

Strategies that don't implement `onGameStart` (and thus have no `rng`) must be fully deterministic.
