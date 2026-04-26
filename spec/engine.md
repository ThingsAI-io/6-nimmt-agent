# 6 Nimmt! — Game Engine Specification

> Part of the [Technical Specification](spec.md). See also: [Strategies](strategies.md) · [Simulator](simulator.md) · [CLI](cli.md) · [Game Rules](rules/6-nimmt.md)

---

## 1. Data Model

### 1.1 Card

A card is identified solely by its **number** (1–104). The penalty value (cattle heads) is a pure, derived property — never stored, always computed.

```typescript
/** Card number, 1–104 inclusive. */
type CardNumber = number; // branded in implementation

function cattleHeads(card: CardNumber): number;
// 55 → 7, multiples of 11 → 5, multiples of 10 → 3,
// multiples of 5 (not 10, not 55) → 2, everything else → 1
```

**Rationale:** Storing penalty separately would violate DRY — the mapping is deterministic and well-defined.

### 1.2 Row

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

### 1.3 Board

The board is exactly 4 rows.

```typescript
interface Board {
  readonly rows: readonly [Row, Row, Row, Row]; // always exactly 4
}
```

### 1.4 Player State

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

### 1.5 Game State (Full — Simulator Internal)

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

### 1.6 Visible State (Strategy Input)

Strategies receive **only what a real player would see**. Two distinct views exist for the two decision types. See [Strategy Interface](strategies.md) for how these are consumed.

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

### 1.7 Move

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

## 2. Game Lifecycle

### 2.1 Round Boundary

1. `dealRound()` shuffles the deck (using seed-derived PRNG), deals 10 cards per player, places 4 cards on the board. Resets `collected` to empty for all players. Resets `turn` to 1, `phase` to `"awaiting-cards"`.
2. Turns 1–10 proceed (card selection → resolution).
3. After turn 10, `phase` becomes `"round-over"`.
4. `scoreRound()` adds each player's `sum(cattleHeads(collected))` to their cumulative `score`, then clears `collected`.
5. `isGameOver()` is checked **only after scoring a round** — never mid-round. If any player's `score ≥ 66`, phase becomes `"game-over"`.
6. If not game-over, increment `round` and go to step 1.

### 2.2 Seed / PRNG

The `seed` in `GameState` is a base seed for the entire game. Per-round shuffles derive a sub-seed: `hash(seed + round)`. This ensures:

- The same seed always produces the same game.
- Individual rounds can be replayed independently.
- The seed is part of state for serialisation/replay, but the PRNG instance is not.

For batch simulation, each game gets a unique seed derived from the batch base seed: `hash(batchSeed + gameIndex)`.

### 2.3 Invariants

The following must hold at all times:

- All cards across board rows, player hands, player collected piles, and undealt deck are **unique** (no duplicates).
- The total cards across all locations equals 104.
- Each row contains **1–5 cards**, and cards within a row are in **strictly increasing** order of placement time (not necessarily value — but tails are always the most recently placed).
- Player count is **2–10**.
- Hands start at 10 cards and decrease by exactly 1 per turn.
- Scores are **non-negative** and **monotonically increasing** across rounds.

### 2.4 Tie-Breaking

If multiple players share the lowest score at game end, they all win (shared victory). The [CLI](cli.md) reports all winners.

---

## 3. Engine API

The engine is a pure library with no side effects. All functions take state in, return state out.

### 3.1 Module Structure

```
src/engine/
  card.ts          — CardNumber type, cattleHeads(), deck generation
  row.ts           — Row operations (tail, penalty, append, overflow check)
  board.ts         — Board operations (placement resolution, row selection)
  game.ts          — GameState transitions (deal, resolve turn, score round)
  visible-state.ts — GameState → CardChoiceState / RowChoiceState projection
  strategy.ts      — Strategy interface definition
  types.ts         — Shared type definitions (re-exports)
  index.ts         — Public API barrel export
```

### 3.2 Core Functions

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

### 3.3 Placement Rules (Deterministic)

These are pure functions implementing the rules from the [game rules spec](rules/6-nimmt.md):

```typescript
/** Given a card and a board, determine where it must go.
 *  Returns the row index, or null if card < all tails (player must choose). */
function determinePlacement(board: Board, card: CardNumber): PlacementResult;

type PlacementResult =
  | { kind: "place"; rowIndex: 0 | 1 | 2 | 3; causesOverflow: boolean }
  | { kind: "must-pick-row" };
```
