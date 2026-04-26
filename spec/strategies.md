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
   *  lower than all row tails. Receives the triggering card and all
   *  revealed cards this turn for informed decision-making. */
  chooseRow(state: RowChoiceState): 0 | 1 | 2 | 3;
}
```

Input types (`CardChoiceState`, `RowChoiceState`) are defined in the [Engine spec §1.6](engine.md#16-visible-state-strategy-input).

---

## 2. Illegal Strategy Output

The engine validates every strategy response:

- **Card not in hand** → engine error (bug in strategy). The simulator logs the error and forfeits the player's turn by playing their lowest card.
- **Row index out of range** → engine error. The simulator picks the row with the fewest cattle heads.
- **Strategy throws** → caught by the simulator, logged, and treated as forfeit (lowest card / fewest-heads row).

---

## 3. Strategy: Random (Baseline)

The simplest possible strategy. Provides a performance floor for benchmarking.

- `chooseCard`: picks uniformly at random from hand.
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
