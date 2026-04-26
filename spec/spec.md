# 6 Nimmt! — Technical Specification

> This document specifies the **Game Engine** and **Simulator CLI** — the first deliverables of the project. See [intent.md](intent.md) for overall project vision and [rules/6-nimmt.md](rules/6-nimmt.md) for game rules.

---

## 1. Design Principles

- **SOLID throughout.** Single responsibility per module, open for extension (new strategies) without modifying core engine, depend on abstractions (Strategy interface) not implementations.
- **Separation of concerns.** The engine knows nothing about the CLI, the simulator, or the agent. The simulator knows nothing about the CLI's presentation. Each layer has a clear boundary.
- **Pure functions where possible.** Card penalty calculation, placement resolution, and row overflow are all pure and stateless — easy to test, easy to reason about.
- **Immutable game state.** Every engine operation returns a new state; no mutations. This makes replay, logging, and debugging trivial.
- **Deterministic reproducibility.** The engine and simulator accept an optional random seed so that any game can be replayed exactly.
- **AI-friendly CLI.** Argument names are explicit, unambiguous, and self-documenting. Output formats include both human-readable and structured JSON.

---

## 2. Data Model

### 2.1 Card

A card is identified solely by its **number** (1–104). The penalty value (cattle heads) is a pure, derived property — never stored, always computed.

```typescript
/** Card number, 1–104 inclusive. */
type CardNumber = number; // branded in implementation

function cattleHeads(card: CardNumber): number;
// 55 → 7, multiples of 11 → 5, multiples of 10 → 3,
// multiples of 5 (not 10, not 55) → 2, everything else → 1
```

**Rationale:** Storing penalty separately would violate DRY — the mapping is deterministic and well-defined.

### 2.2 Row

A row is an ordered list of cards (1–5 cards). The **last card** (tail) determines placement eligibility.

```typescript
interface Row {
  /** Cards in placement order, index 0 = first placed. Length 1–5. */
  readonly cards: readonly CardNumber[];
}
```

Derived properties (pure functions, not stored):

- `tail(row)` → last card number (placement comparison target)
- `penalty(row)` → sum of cattleHeads for all cards in the row
- `length(row)` → number of cards (if 5, next placement triggers overflow)

### 2.3 Board

The board is exactly 4 rows.

```typescript
interface Board {
  readonly rows: readonly [Row, Row, Row, Row]; // always exactly 4
}
```

### 2.4 Player State

```typescript
interface PlayerState {
  readonly id: string;
  readonly hand: readonly CardNumber[];
  /** Cards collected as penalties this round (not mixed with hand). */
  readonly collected: readonly CardNumber[];
  /** Cumulative score across all rounds. */
  readonly score: number;
}
```

### 2.5 Game State (Full — Simulator Internal)

The full game state is **only visible to the simulator**, never to strategies. It contains complete information.

```typescript
interface GameState {
  readonly board: Board;
  readonly players: readonly PlayerState[];
  readonly deck: readonly CardNumber[]; // remaining undealt cards
  readonly round: number;
  readonly turn: number; // 1–10 within a round
  readonly phase: GamePhase;
  /** In-flight turn resolution state. Present only during "resolving" / "awaiting-row-pick". */
  readonly pendingResolution?: PendingTurnResolution;
  /** Seed for deterministic replay. */
  readonly seed: string;
}

type GamePhase =
  | "awaiting-cards"     // players must choose a card to play
  | "resolving"          // cards revealed, being placed lowest-first
  | "awaiting-row-pick"  // a player must choose which row to take
  | "round-over"         // all 10 turns played, scoring
  | "game-over";         // a player hit 66+, final standings

/** Tracks the state of a turn being resolved card-by-card. */
interface PendingTurnResolution {
  /** All cards submitted this turn, sorted ascending by card number. */
  readonly sortedPlays: readonly { playerId: string; card: CardNumber }[];
  /** Index into sortedPlays — the next card to resolve. */
  readonly nextIndex: number;
  /** Present when resolution is paused for a row-pick decision. */
  readonly pendingRowPick?: { playerId: string; card: CardNumber };
}
```

### 2.6 Visible State (Strategy Input)

Strategies receive **only what a real player would see**. Two distinct views exist for the two decision types:

#### Card Choice State

Provided when a player must choose which card to play.

```typescript
interface CardChoiceState {
  readonly board: Board;
  readonly hand: readonly CardNumber[];
  readonly playerScores: readonly { id: string; score: number }[];
  readonly playerCount: number;
  readonly round: number;
  readonly turn: number;
  /** Cards resolved in previous turns this round (all players, public info). Ordered by turn then resolution order. */
  readonly resolvedCardsThisRound: readonly CardNumber[];
}
```

#### Row Choice State

Provided when a player's card is lower than all row tails and they must pick a row.

```typescript
interface RowChoiceState {
  readonly board: Board;
  readonly hand: readonly CardNumber[]; // remaining hand (excluding the played card)
  readonly playerScores: readonly { id: string; score: number }[];
  readonly playerCount: number;
  readonly round: number;
  readonly turn: number;
  readonly resolvedCardsThisRound: readonly CardNumber[];
  /** The card this player played that triggered the forced row pick. */
  readonly triggeringCard: CardNumber;
  /** All cards revealed this turn (all players). Cards resolved before this one have already been placed. */
  readonly revealedThisTurn: readonly { playerId: string; card: CardNumber }[];
}
```

**Rationale:** Separating the two views enforces that each decision receives exactly the context it needs — no more, no less. The row-choice view includes the triggering card and current-turn reveals because those are critical to informed row selection.

### 2.7 Move

A move represents a player's decisions for a turn. There are two decision points, and they happen at different times:

```typescript
/** Decision 1: which card to play (every turn). */
interface PlayCardMove {
  readonly kind: "play-card";
  readonly card: CardNumber;
}

/** Decision 2: which row to pick up (only when card < all row tails). */
interface PickRowMove {
  readonly kind: "pick-row";
  readonly rowIndex: 0 | 1 | 2 | 3;
}

type Move = PlayCardMove | PickRowMove;
```

---

## 3. Game Lifecycle

### 3.1 Round Boundary

1. `dealRound()` shuffles the deck (using seed-derived PRNG), deals 10 cards per player, places 4 cards on the board. Resets `collected` to empty for all players. Resets `turn` to 1, `phase` to `"awaiting-cards"`.
2. Turns 1–10 proceed (card selection → resolution).
3. After turn 10, `phase` becomes `"round-over"`.
4. `scoreRound()` adds each player's `sum(cattleHeads(collected))` to their cumulative `score`, then clears `collected`.
5. `isGameOver()` is checked **only after scoring a round** — never mid-round. If any player's `score ≥ 66`, phase becomes `"game-over"`.
6. If not game-over, increment `round` and go to step 1.

### 3.2 Seed / PRNG

The `seed` in `GameState` is a base seed for the entire game. Per-round shuffles derive a sub-seed: `hash(seed + round)`. This ensures:

- The same seed always produces the same game.
- Individual rounds can be replayed independently.
- The seed is part of state for serialisation/replay, but the PRNG instance is not.

For batch simulation, each game gets a unique seed derived from the batch base seed: `hash(batchSeed + gameIndex)`.

### 3.3 Invariants

The following must hold at all times:

- All cards across board rows, player hands, player collected piles, and undealt deck are **unique** (no duplicates).
- The total cards across all locations equals 104.
- Each row contains **1–5 cards**, and cards within a row are in **strictly increasing** order of placement time (not necessarily value — but tails are always the most recently placed).
- Player count is **2–10**.
- Hands start at 10 cards and decrease by exactly 1 per turn.
- Scores are **non-negative** and **monotonically increasing** across rounds.

### 3.4 Tie-Breaking

If multiple players share the lowest score at game end, they all win (shared victory). The CLI reports all winners.

---

## 4. Engine API

The engine is a pure library with no side effects. All functions take state in, return state out.

### 4.1 Module Structure

```
src/engine/
  card.ts          — CardNumber type, cattleHeads(), deck generation
  row.ts           — Row operations (tail, penalty, append, overflow check)
  board.ts         — Board operations (placement resolution, row selection)
  game.ts          — GameState transitions (deal, resolve turn, score round)
  visible-state.ts — GameState → VisibleGameState projection
  strategy.ts      — Strategy interface definition
  types.ts         — Shared type definitions (re-exports)
  index.ts         — Public API barrel export
```

### 4.2 Core Functions

```typescript
/** Create a shuffled 104-card deck from a seed. */
function createDeck(seed: string): CardNumber[];

/** Deal a new round: 10 cards to each player, 4 to the board. */
function dealRound(state: GameState): GameState;

/** Resolve a set of played cards (one per player) against the board.
 *  Processes cards lowest-first. Returns either a completed state or
 *  a state paused at a row-pick decision. */
function resolveTurn(
  state: GameState,
  playedCards: readonly { playerId: string; card: CardNumber }[]
): TurnResolutionResult;

type TurnResolutionResult =
  | { kind: "completed"; state: GameState }
  | { kind: "needs-row-pick"; playerId: string; card: CardNumber; state: GameState };

/** Apply a row-pick decision and continue resolution. */
function applyRowPick(
  state: GameState,
  playerId: string,
  rowIndex: 0 | 1 | 2 | 3
): TurnResolutionResult; // may need another row-pick from a different player

/** Score the round: sum collected penalties into cumulative scores. */
function scoreRound(state: GameState): GameState;

/** Check if any player has reached 66+ points. */
function isGameOver(state: GameState): boolean;

/** Project full state to card-choice view for a specific player. */
function toCardChoiceState(state: GameState, playerId: string): CardChoiceState;

/** Project full state to row-choice view for a specific player. */
function toRowChoiceState(state: GameState, playerId: string): RowChoiceState;
```

### 4.3 Placement Rules (Deterministic)

These are pure functions implementing the rules from the [game rules spec](rules/6-nimmt.md):

```typescript
/** Given a card and a board, determine where it must go.
 *  Returns the row index, or null if card < all tails (player must choose). */
function determinePlacement(board: Board, card: CardNumber): PlacementResult;

type PlacementResult =
  | { kind: "place"; rowIndex: 0 | 1 | 2 | 3; causesOverflow: boolean }
  | { kind: "must-pick-row" };
```

---

## 5. Strategy Interface

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

### 5.1 Illegal Strategy Output

The engine validates every strategy response:

- **Card not in hand** → engine error (bug in strategy). The simulator logs the error and forfeits the player's turn by playing their lowest card.
- **Row index out of range** → engine error. The simulator picks the row with the fewest cattle heads.
- **Strategy throws** → caught by the simulator, logged, and treated as forfeit (lowest card / fewest-heads row).

### 5.2 Strategy: Random (Baseline)

The simplest possible strategy. Provides a performance floor for benchmarking.

- `chooseCard`: picks uniformly at random from hand.
- `chooseRow`: picks the row with the fewest total cattle heads (deterministic tiebreak by lowest row index).

**Rationale for chooseRow:** Even for "random", picking a random row to take would be pathologically bad and not useful as a baseline. The row-pick is a damage-mitigation decision with an obvious greedy answer; using it makes "random" a fairer baseline.

### 5.3 Strategy Registration

Strategies are registered in a map for CLI lookup:

```typescript
const strategies: ReadonlyMap<string, () => Strategy>;
// "random" → RandomStrategy
// "greedy" → GreedyStrategy (future)
// "bayesian" → BayesianStrategy (future)
```

---

## 6. Simulator

The simulator is a pure TypeScript module that runs complete games using the engine. It has no CLI dependency — the CLI is a thin wrapper.

### 6.1 Module Structure

```
src/sim/
  runner.ts   — GameRunner: runs a single game to completion
  batch.ts    — BatchRunner: runs N games, collects statistics
  stats.ts    — Statistical aggregation (win rates, score distributions)
  types.ts    — SimConfig, SimResult, BatchResult types
```

### 6.2 Types

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

## 7. CLI (`src/cli/`)

A thin presentation layer over the simulator. Designed for both humans and AI agents.

### 7.1 Design Goals

- **Explicit long names.** Every option has a long `--kebab-case` name. No ambiguity.
- **Short aliases for humans.** Common options also have single-letter aliases.
- **Structured output.** `--output-format json` for machine consumption, `table` (default) for humans.
- **Composable.** Each subcommand does one thing.

### 7.2 Commands

#### `simulate` — Run a batch of games

```
6nimmt simulate \
  --players "bayesian,random,random,random,random" \
  --games 1000 \
  --seed "reproducible-seed-42" \
  --output-format json
```

| Argument            | Alias | Type    | Default   | Description                                           |
|---------------------|-------|---------|-----------|-------------------------------------------------------|
| `--players`         | `-p`  | string  | (required)| Comma-separated strategy names, one per player seat   |
| `--games`           | `-n`  | number  | `100`     | Number of games to simulate                           |
| `--seed`            | `-s`  | string  | (auto)    | Base seed for reproducibility                         |
| `--output-format`   | `-f`  | string  | `table`   | Output format: `table`, `json`, `csv`                 |
| `--verbose`         | `-v`  | boolean | `false`   | Log each game result individually                     |

#### `strategies` — List available strategies

```
6nimmt strategies --output-format json
```

Outputs all registered strategy names with descriptions.

#### `play` — Run and display a single game turn-by-turn

```
6nimmt play \
  --players "bayesian,random,random,random" \
  --seed "debug-seed" \
  --output-format json
```

Outputs full game log: every turn, every placement, every pickup. Useful for debugging strategies.

### 7.3 JSON Output Schema (simulate)

```json
{
  "gamesPlayed": 1000,
  "players": ["bayesian", "random", "random", "random", "random"],
  "seed": "reproducible-seed-42",
  "results": {
    "bayesian": {
      "wins": 620,
      "winRate": 0.62,
      "avgScore": 18.4,
      "medianScore": 15,
      "minScore": 2,
      "maxScore": 71,
      "scoreStdDev": 12.3
    },
    "random": {
      "wins": 380,
      "winRate": 0.095,
      "avgScore": 34.7,
      "medianScore": 32,
      "minScore": 5,
      "maxScore": 89,
      "scoreStdDev": 18.1
    }
  }
}
```

---

## 8. Project Structure

```
src/
  engine/
    card.ts
    row.ts
    board.ts
    game.ts
    visible-state.ts
    strategy.ts
    types.ts
    index.ts
  engine/strategies/
    random.ts
  sim/
    runner.ts
    batch.ts
    stats.ts
    types.ts
    index.ts
  cli/
    index.ts
    commands/
      simulate.ts
      strategies.ts
      play.ts
    formatters/
      table.ts
      json.ts
      csv.ts
```

---

## 9. Testing Strategy

- **Engine unit tests:** Every pure function tested exhaustively — card penalties, placement logic, overflow, row picks. Property-based tests for invariants (e.g. "total cattle heads in deck always equals 104-card sum").
- **Strategy tests:** Random strategy produces valid moves for any legal game state.
- **Simulator integration tests:** A seeded game produces identical results across runs.
- **CLI tests:** Snapshot tests for output formats.

---

## 10. MVP Scope (First Deliverable)

1. ✅ Game rules spec (`spec/rules/6-nimmt.md`)
2. Engine data model and core placement/scoring logic
3. Random strategy
4. Simulator (single game + batch)
5. CLI with `simulate`, `strategies`, and `play` commands
6. Unit and integration tests

Out of scope for MVP: Bayesian strategy, neural net, BGA agent, browser extension.
