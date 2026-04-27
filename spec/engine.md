# 6 Nimmt! — Game Engine Specification

> Part of the [Technical Specification](spec.md). See also: [Strategies](strategies.md) · [Simulator](simulator.md) · [CLI](cli.md) · [MCP Server](mcp.md) · [Game Rules](rules/6-nimmt.md)

---

## 1. Data Model

### 1.1 Card

A card is identified solely by its **number** (1–104). The penalty value (cattle heads) is a pure, derived property — never stored, always computed.

```typescript
/** Card number, 1–104 inclusive. */
type CardNumber = number; // branded in implementation

function cattleHeads(card: CardNumber): number {
  // Rule priority (highest first):
  // 1. card === 55          → 7  (1 card)
  // 2. card % 11 === 0      → 5  (11,22,33,44,66,77,88,99 — 8 cards)
  // 3. card % 10 === 0      → 3  (10,20,30,40,50,60,70,80,90,100 — 10 cards)
  // 4. card % 5 === 0       → 2  (5,15,25,35,45,65,75,85,95 — 9 cards)
  // 5. otherwise            → 1  (76 cards)
}
```

**Invariant:** The sum of `cattleHeads(n)` for n = 1..104 is exactly 171.

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

**Board serialization:** When serialized to JSON (e.g., in CLI output or `recommend` input), a Board is represented as:
```json
{
  "rows": [[3, 17, 42], [8], [55, 60, 71, 88, 99], [12, 25]]
}
```
where each inner array is the cards in placement order. This is the only valid representation — arrays of arrays, not objects with `cards` properties.

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
  /** Cards played and resolved in previous turns this round, with player attribution. Reset by dealRound(). Includes the turn number for each card, enabling strategies to distinguish simultaneous plays within a turn from plays across turns. Ordered by turn ascending, then by card number ascending within each turn. */
  readonly resolvedCardsThisRound: readonly { playerId: string; card: CardNumber; turn: number }[];
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
  readonly playerScores: readonly {
    id: string;
    score: number;             // cumulative across rounds
    penaltyThisRound: number;  // cattle heads collected this round so far
  }[];
  readonly playerCount: number;
  readonly round: number;
  readonly turn: number;
  /** Cards resolved in previous turns this round (all players, public info). Includes the turn number for each card, enabling strategies to distinguish simultaneous plays within a turn from plays across turns. Ordered by turn ascending, then by card number ascending within each turn. All played cards included regardless of overflow or row picks. */
  readonly resolvedCardsThisRound: readonly { playerId: string; card: CardNumber; turn: number }[];
  /** The 4 cards that started the board rows at the beginning of this round. */
  readonly initialBoardCards: readonly CardNumber[];
}
```

#### Row Choice State

Provided when a player's card is lower than all row tails and they must pick a row.

```typescript
interface RowChoiceState {
  readonly board: Board;
  readonly hand: readonly CardNumber[]; // remaining hand (excluding the played card)
  readonly playerScores: readonly {
    id: string;
    score: number;             // cumulative across rounds
    penaltyThisRound: number;  // cattle heads collected this round so far
  }[];
  readonly playerCount: number;
  readonly round: number;
  readonly turn: number;
  /** Cards resolved in previous turns this round (all players, public info). Includes the turn number for each card, enabling strategies to distinguish simultaneous plays within a turn from plays across turns. Ordered by turn ascending, then by card number ascending within each turn. All played cards included regardless of overflow or row picks. */
  readonly resolvedCardsThisRound: readonly { playerId: string; card: CardNumber; turn: number }[];
  /** The 4 cards that started the board rows at the beginning of this round. */
  readonly initialBoardCards: readonly CardNumber[];
  /** The card this player played that triggered the forced row pick. */
  readonly triggeringCard: CardNumber;
  /** All cards revealed this turn (all players). Cards resolved before this one have already been placed. */
  readonly revealedThisTurn: readonly { playerId: string; card: CardNumber }[];
  /** Number of cards already resolved before this one (0-indexed into sorted plays). */
  readonly resolutionIndex: number;
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

1. `dealRound()` first returns all cards (board, hands, collected) to the deck to form the full 104-card deck, then shuffles using the seed-derived PRNG, deals 10 cards per player, and places 4 cards on the board. Resets `collected` to empty for all players. Resets `turn` to 1, `phase` to `"awaiting-cards"`. Note: with 10 players, the deck is fully exhausted after dealing (10×10 + 4 = 104).
2. Turns 1–10 proceed (card selection → resolution).
3. After turn 10, `phase` becomes `"round-over"`.
4. `scoreRound()` adds each player's `sum(cattleHeads(collected))` to their cumulative `score`. **Does not clear `collected`** — cards remain in the collected pile until `dealRound()` reclaims them. This preserves the "total cards = 104" invariant between rounds.
5. `isGameOver()` is checked **only after scoring a round** — never mid-round. If any player's `score ≥ 66`, phase becomes `"game-over"`.
6. If not game-over, increment `round` and go to step 1.

### 2.1.1 Phase Transition Table

| From               | To                  | Trigger                                        |
|--------------------|---------------------|------------------------------------------------|
| `"round-over"`     | `"awaiting-cards"`  | `dealRound()` called                           |
| `"awaiting-cards"` | `"resolving"`       | `resolveTurn()` called                         |
| `"resolving"`      | `"awaiting-row-pick"`| Card < all tails encountered during resolution |
| `"awaiting-row-pick"`| `"resolving"`     | `applyRowPick()` called, more cards to resolve |
| `"resolving"`      | `"awaiting-cards"`  | All cards resolved, turn < 10                  |
| `"resolving"`      | `"round-over"`      | All cards resolved, turn = 10                  |
| `"round-over"`     | `"game-over"`       | `scoreRound()` finds any score ≥ 66            |

Each function validates that the current phase matches its required precondition and throws on violation.

### 2.2 Seed / PRNG

The `seed` in `GameState` is a base seed for the entire game. Per-round shuffles derive a sub-seed: `hash(seed + round)`. This ensures:

- The same seed always produces the same game.
- Individual rounds can be replayed independently.
- The seed is part of state for serialisation/replay, but the PRNG instance is not.

For batch simulation, each game gets a unique seed derived from the batch base seed: `hash(batchSeed + gameIndex)`.

Implementation shall use a seeded xoshiro256** PRNG. Seed derivation uses SHA-256: `perRoundSeed = SHA256(gameSeed + '/' + round)`. Deck shuffling uses the Fisher-Yates algorithm.

### 2.3 Invariants

The following must hold at all times:

- All cards across board rows, player hands, player collected piles, and undealt deck are **unique** (no duplicates).
- The total cards across all locations equals 104.
- The board has **exactly 4 rows**.
- Each row contains **1–5 cards**, and cards within a row are in **strictly increasing order of value** (because each placed card must exceed the current tail per rule 1).
- Player count is **2–10**.
- Hands start at 10 cards and decrease by exactly 1 per turn.
- At round start (after `dealRound()`), the undealt deck contains exactly `100 − 10 × playerCount` cards.
- Scores are **non-negative** and **monotonically increasing** across rounds.
- All `PlayerState.id` values must be unique within a game.
- **Rule 4 (must-pick-row) can trigger at most once per turn**, and only for the lowest-valued card in that turn. Once that card becomes a row tail, all subsequent cards (which have higher values) will always find at least one eligible row.

**Player count affects game dynamics significantly.** All engine functions must work correctly across the full 2–10 range. Key differences:

| Players | Cards dealt | Deck remainder | Cards resolved per turn | Overflow likelihood |
|---------|------------|----------------|------------------------|---------------------|
| 2       | 24         | 80             | 2                      | Low — rows fill slowly |
| 5       | 54         | 50             | 5                      | Moderate |
| 10      | 104        | 0              | 10                     | High — rows fill quickly, cascading overflows likely |

All testing must cover at minimum **2, 5, and 10** player configurations.

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
/** Create the initial game state. Does NOT deal — call dealRound() next.
 *  Returns: round=1, turn=0, phase="round-over", empty hands/collected/board,
 *  full 104-card deck, score=0 for all players. */
function createGame(players: readonly { id: string }[], seed: string): GameState;

/** Create a shuffled 104-card deck from a seed. */
function createDeck(seed: string): CardNumber[];

/** Deal a new round: 10 cards to each player, 4 to the board. */
function dealRound(state: GameState): GameState;

/** Resolve a set of played cards (one per player) against the board.
 *  Processes cards lowest-first. Returns either a completed state or
 *  a state paused at a row-pick decision.
 *  Precondition: each played card must be in the corresponding player's hand.
 *  This function removes played cards from hands as part of resolution. */
function resolveTurn(
  state: GameState,
  playedCards: readonly { playerId: string; card: CardNumber }[]
): TurnResolutionResult;

type TurnResolutionResult =
  | { kind: "completed"; state: GameState }
  | { kind: "needs-row-pick"; playerId: string; card: CardNumber; state: GameState };

/** Apply a row-pick decision and continue resolution.
 *  Note: rule 4 can only trigger once per turn (for the lowest card),
 *  so the returned result will always be { kind: "completed" }. */
function applyRowPick(
  state: GameState,
  playerId: string,
  rowIndex: 0 | 1 | 2 | 3
): TurnResolutionResult;

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
```

**Note:** Tie-breaking for closest-tail is unnecessary: since all card values are distinct integers and only rows with `tail < card` are eligible, the differences `card - tail` are guaranteed to be distinct.

```typescript
type PlacementResult =
  | { kind: "place"; rowIndex: 0 | 1 | 2 | 3; causesOverflow: boolean }
  | { kind: "must-pick-row" };
```

**Note:** Overflow collection (rule 3 — 6th card on a row) is automatic and does not involve a `PickRowMove`. The engine collects the 5 cards and starts a new row without player interaction. `PickRowMove` is only produced for rule 4 (card lower than all tails).

### 3.4 Preconditions and Error Handling

Each engine function validates its preconditions and throws on violation (these indicate programmer bugs, not runtime conditions):

| Function | Required Phase | Key Preconditions |
|----------|---------------|-------------------|
| `createGame()` | (none) | 2–10 players, unique IDs, non-empty seed |
| `dealRound()` | `"round-over"` | — |
| `resolveTurn()` | `"awaiting-cards"` | Exactly one card per player, each card in player's hand |
| `applyRowPick()` | `"awaiting-row-pick"` | playerId matches pending pick, rowIndex 0–3 |
| `scoreRound()` | `"round-over"` | Turn = 10 (all turns completed) |
| `toCardChoiceState()` | `"awaiting-cards"` | playerId exists |
| `toRowChoiceState()` | `"awaiting-row-pick"` | playerId matches pending pick |

---

## 4. State Validation

The engine provides validation utilities that check a `CardChoiceState` or `RowChoiceState` for internal consistency. The `recommend` command calls these before running the strategy, and reports the result via `stateValid` and `stateWarnings`.

### 4.1 Validation Interface

```typescript
interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];   // hard failures — state is unusable
  readonly warnings: readonly string[]; // soft issues — state is usable but suspicious
}

/** Validates a CardChoiceState or RowChoiceState for internal consistency. */
function validateCardChoiceState(state: CardChoiceState): ValidationResult;
function validateRowChoiceState(state: RowChoiceState): ValidationResult;
```

### 4.2 Error Checks (state is invalid)

The following conditions produce **errors** — the state is unusable and the strategy must not run:

- All card numbers in range 1–104
- No duplicate cards across hand + board rows
- Exactly 4 rows on the board
- Each row has 1–5 cards
- Rows are strictly increasing (each card > previous)
- Player count 2–10
- Round ≥ 1
- Turn 1–10
- Hand is non-empty (for card choice)
- `triggeringCard` present for `RowChoiceState`, absent for `CardChoiceState`

### 4.3 Warning Checks (suspicious but not fatal)

The following conditions produce **warnings** — the state is usable but may indicate stale or inconsistent input:

- Hand size doesn't match expected `11 - turn` (could indicate stale state)
- Cards in `resolvedCardsThisRound` overlap with cards on board (possible stale read)
- `initialBoardCards` not all present as row heads or in resolved cards (could be stale)
- Total visible cards exceeds expected count for turn/player configuration
