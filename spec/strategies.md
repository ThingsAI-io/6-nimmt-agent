# 6 Nimmt! — Strategy Interface Specification

> Part of the [Technical Specification](spec.md). See also: [Engine](engine.md) · [Simulator](simulator.md) · [CLI](cli.md) · [MCP Server](mcp.md)

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
   *  Use to update opponent models, card tracking, etc.
   *
   *  **Live play note:** In `recommend` mode, `onTurnResolved()` is called
   *  synthetically with resolutions reconstructed from
   *  `turnHistory`. See [§7 Live Play Mode](#7-live-play-mode-recommend). */
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

---

## 7. Live Play Mode (Recommend)

When invoked via `6nimmt recommend` (see [CLI](cli.md)) or the MCP `recommend` tool (see [MCP Server](mcp.md)), the strategy operates in **stateless mode** — no instance persists between calls. The strategy must reconstruct any needed internal state from the `CardChoiceState` or `RowChoiceState` provided.

> **Preferred path:** For live play, the [MCP server](mcp.md) `session_recommend` tool provides **stateful sessions** where the strategy instance persists across turns with full lifecycle hook support. The stateless reconstruction described here is used by CLI `recommend`, MCP `recommend` (stateless), and as a fallback when session mode is unavailable (e.g., after `resync_session`).

### 7.1 Reconstruction Contract

The CLI `recommend` command, MCP `recommend_once` tool, and MCP `resync_session`:
1. Instantiates a fresh strategy via the registry factory
2. Calls `onGameStart({ playerId, playerCount, rng })` using a deterministic RNG
3. Replays `turnHistory` entries as synthetic `onTurnResolved()` calls — each entry directly maps to a `TurnResolution`
4. Calls `chooseCard(state)` or `chooseRow(state)` as appropriate
5. Returns the result

This means:
- **Stateless strategies** (e.g., random) work unchanged — they don't use lifecycle hooks.
- **Stateful strategies** (e.g., Bayesian) receive full `TurnResolution` data (plays, row picks, board state) for each previous turn.
- **Cross-round state is lost.** This is an acceptable limitation — cross-round memory requires a persistent session.
- **The reconstruction is now complete** — no data is missing from the history.

### 7.2 Strategy Requirements for Live Play

Strategies that want to work well in live play SHOULD:
- Derive maximum insight from `turnHistory` (which provides full per-turn resolution including row picks and board states)
- Not depend on `onRoundEnd()` for current-round decisions
- Be tolerant of incomplete state (warnings from state validation should not crash the strategy)

Strategies MAY implement an optional method for richer reconstruction:

```typescript
interface Strategy {
  // ... existing methods ...

  /** Optional: Reconstruct internal state from visible history.
   *  Called by recommend before chooseCard/chooseRow.
   *  Default: no-op (stateless strategies ignore this). */
  reconstructFromHistory?(rounds: readonly RoundSummary[]): void;
}

interface RoundSummary {
  readonly round: number;
  readonly turns: readonly TurnHistoryEntry[];  // was TurnResolution[]
  readonly scores: readonly { id: string; score: number }[];
}
```

This is a **post-MVP enhancement**. For MVP, the synthetic `onTurnResolved()` replay from `turnHistory` is sufficient.
