# 6 Nimmt! — Game Engine Specification Review

> **Reviewed spec version:** [`ff62ef1`](https://github.com/ThingsAI-io/6-nimmt-agent/commit/ff62ef1)

**Reviewer:** Game Engine Software Engineer
**Spec files reviewed:** `spec/engine.md`, `spec/spec.md`, `spec/rules/6-nimmt.md`, `spec/strategies.md`, `spec/simulator.md`, `spec/cli.md`, `spec/intent.md`
**Date:** 2025-07-17

---

## Executive Summary

The specification is well-structured with clean separation of concerns, immutable state, and a solid type system. However, there are several gaps that would force an implementer to make assumptions: the `cattleHeads` precedence rules are ambiguous, the `GameState` lacks fields needed to produce the `CardChoiceState.resolvedCardsThisRound` view, and there is no `createGame()` function to bootstrap the initial state. The spec is close to implementation-ready but needs targeted fixes.

**Implementation Readiness: Needs Minor Fixes**

---

## Findings

### BUG — Issues where the specification is incorrect

#### BUG-1: `cattleHeads()` precedence is ambiguous and could produce wrong results

**Spec section:** `engine.md` §1.1

The comment reads:

```
// 55 → 7, multiples of 11 → 5, multiples of 10 → 3,
// multiples of 5 (not 10, not 55) → 2, everything else → 1
```

This relies on evaluation order for correctness (55 is also a multiple of 5 and 11). An implementer using `if/else if` chains would get it right, but one using a flat `switch` on divisibility or a lookup table could easily mis-prioritize. The rules doc (§Cards) is explicit that 55 is the unique 7-head card, but the engine spec's one-line comment is not a complete specification.

**Fix:** Replace the comment with an explicit priority-ordered specification:

```typescript
function cattleHeads(card: CardNumber): number {
  // Rule priority (highest first):
  // 1. card === 55          → 7
  // 2. card % 11 === 0      → 5  (11,22,33,44,66,77,88,99)
  // 3. card % 10 === 0      → 3  (10,20,30,40,50,60,70,80,90,100)
  // 4. card % 5 === 0       → 2  (5,15,25,35,45,65,75,85,95)
  // 5. otherwise            → 1  (76 cards)
}
```

Add a spec invariant: "The 104 cards must yield exactly: 1×7 + 8×5 + 10×3 + 9×2 + 76×1 = 171 total cattle heads."

---

#### BUG-2: Simulator `GameRunner` loop doesn't handle chained row picks

**Spec section:** `simulator.md` §4

The GameRunner loop says:

> If `needs-row-pick`, call the relevant strategy's `chooseRow()`, then `applyRowPick()`.

But `applyRowPick()` itself returns `TurnResolutionResult`, which could be *another* `needs-row-pick` from a different player later in resolution order. The spec describes this correctly in `engine.md` §3.2 (`applyRowPick` comment says "may need another row-pick from a different player"), but the simulator loop doesn't reflect it.

With multiple players whose cards are lower than all row tails in the same turn, the loop needs to be:

```
while result.kind === "needs-row-pick":
    call strategy.chooseRow() for result.playerId
    result = applyRowPick(...)
```

**Fix:** Change simulator §4 step 2b to:

> - `result = resolveTurn()` — place cards lowest-first.
> - While `result.kind === "needs-row-pick"`: call the relevant strategy's `chooseRow()`, then `result = applyRowPick()`.

---

### AMBIGUITY — Multiple valid interpretations

#### AMBIGUITY-1: No `createGame()` / `initializeGame()` function defined

**Spec section:** `engine.md` §3.2

The API defines `createDeck()`, `dealRound()`, `scoreRound()`, etc., but there is no function to create the initial `GameState`. An implementer must decide:

- What are the initial values for `round`, `turn`, `phase`, `score`?
- Is `dealRound()` called on a pre-existing state, or does it also serve as initialization?
- How is the initial `seed` set and the player list established?

**Fix:** Add an explicit `createGame()` function:

```typescript
/** Create the initial game state. Does NOT deal — call dealRound() next. */
function createGame(players: readonly { id: string }[], seed: string): GameState;
// Returns: round=1, turn=0, phase="round-over" (or a new "not-started" phase),
// empty hands/collected, empty board, full 104-card deck, score=0 for all.
```

---

#### AMBIGUITY-2: When exactly does a played card leave the player's hand?

**Spec section:** `engine.md` §1.4, §3.2

The `PlayerState.hand` is defined, and the invariant says "Hands start at 10 cards and decrease by exactly 1 per turn." But no function signature specifies *when* the card is removed from the hand:

- Does `resolveTurn()` remove all played cards from hands?
- Or does the caller remove them before calling `resolveTurn()`?

Since `resolveTurn` accepts `playedCards` as a separate parameter (not part of `GameState`), the played cards must still be in the hand at call time. But this isn't stated.

**Fix:** Add to `resolveTurn` documentation: "Precondition: each played card must be in the corresponding player's hand. The function removes played cards from hands as part of resolution."

---

#### AMBIGUITY-3: Phase transitions are implicit

**Spec section:** `engine.md` §1.5, §2.1

The five phases are defined, and §2.1 describes the lifecycle, but the transitions are not explicitly enumerated. An implementer must infer:

| From | To | Trigger |
|------|----|---------|
| `"round-over"` / initial | `"awaiting-cards"` | `dealRound()` |
| `"awaiting-cards"` | `"resolving"` | `resolveTurn()` called |
| `"resolving"` | `"awaiting-row-pick"` | card < all tails encountered |
| `"awaiting-row-pick"` | `"resolving"` | `applyRowPick()` called, more cards to resolve |
| `"resolving"` | `"awaiting-cards"` | all cards resolved, turn < 10 |
| `"resolving"` | `"round-over"` | all cards resolved, turn = 10 |
| `"round-over"` | `"game-over"` | `scoreRound()` finds score ≥ 66 |

**Fix:** Add an explicit phase transition table to §2.1 or as a new §2.x. Also specify which function is responsible for each transition and what the precondition phase must be for each function call.

---

#### AMBIGUITY-4: Row-pick during overflow vs. row-pick for low card — different mechanics, same `PickRowMove`

**Spec section:** `engine.md` §3.3

There are two distinct scenarios where a player interacts with row collection:

1. **Overflow (6th card rule):** The card *must* go on a specific row (closest-tail rule applies), but that row already has 5 cards. The player *automatically* takes the 5 cards — **no choice involved**. The played card starts the new row.
2. **Card lower than all tails:** The player *chooses* a row, takes all cards from it, and their card starts the row.

The `PlacementResult` type correctly distinguishes these (`causesOverflow: boolean` vs `must-pick-row`), but the Move type uses the same `PickRowMove` for both. Since overflow is deterministic (no player choice), this is fine — `PickRowMove` is only ever used for scenario 2. However, this should be explicitly stated to prevent confusion.

**Fix:** Add a note to §1.7 or §3.3: "Overflow collection (rule 3) is automatic and does not involve a `PickRowMove`. `PickRowMove` is only produced for rule 4 (card lower than all tails)."

---

#### AMBIGUITY-5: Tie-breaking for placement distance is not addressed

**Spec section:** `engine.md` §3.3

Rule 2 says the card goes on the row with the closest tail. The spec doesn't mention tie-breaking. While it's mathematically impossible (all card numbers are unique integers, so `|card - tail_a| ≠ |card - tail_b|` when `tail_a ≠ tail_b` and both `< card`), this non-obvious fact should be stated explicitly so implementers don't waste time adding unnecessary tie-breaking logic.

**Fix:** Add a note: "Tie-breaking for closest-tail is unnecessary: since all card values are distinct integers and only rows with `tail < card` are eligible, the differences `card - tail` are guaranteed to be distinct."

---

### GAP — Missing information

#### GAP-1: `resolvedCardsThisRound` has no backing data in `GameState`

**Spec section:** `engine.md` §1.5, §1.6

`CardChoiceState.resolvedCardsThisRound` provides "Cards resolved in previous turns this round (all players, public info)." But `GameState` has no field tracking historical card plays within a round. The only resolution-related field is `pendingResolution`, which is ephemeral and only exists during a single turn's resolution.

An implementer must either:
1. Add a `resolvedCardsThisRound: CardNumber[]` field to `GameState`, or
2. Derive it by diffing the deck/hands/board/collected (complex and error-prone).

**Fix:** Add to `GameState`:

```typescript
/** Cards played and resolved in previous turns this round, in resolution order. */
readonly resolvedCardsThisRound: readonly CardNumber[];
```

And specify that `resolveTurn` appends to this, while `dealRound` resets it to `[]`.

---

#### GAP-2: No validation or error handling spec for engine functions

**Spec section:** `engine.md` §3.2

The engine functions have no specified preconditions or error behavior:

- What if `resolveTurn()` is called with duplicate player IDs?
- What if a player submits a card not in their hand?
- What if `resolveTurn()` is called during `"awaiting-row-pick"` phase?
- What if `applyRowPick()` is called with a mismatched `playerId`?
- What if `dealRound()` is called when `phase !== "round-over"`?

The strategy spec (§2) defines fallback behavior for illegal *strategy* outputs, but the *engine* functions have no error contract.

**Fix:** For each function, add:
- **Preconditions:** required phase, valid inputs.
- **Error behavior:** throw (for programmer errors / invariant violations) or return a result type. Recommend throwing for precondition violations since they indicate bugs, not runtime conditions.

---

#### GAP-3: No specification for how the `play` CLI command log is structured

**Spec section:** `cli.md` §2 (`play` command)

The `play` command says it "Outputs full game log: every turn, every placement, every pickup." But unlike the `simulate` command which has a JSON schema (§3), the `play` command has no output schema. An implementer would need to design the log format from scratch.

**Fix:** Add a `play` output schema showing the structure of per-turn, per-round, and game-end log entries, at minimum for the JSON output format.

---

#### GAP-4: 10-player edge case not called out

**Spec section:** `engine.md` §2.1, §2.3

With 10 players: 10 × 10 hand cards + 4 board cards = 104 cards. The deck is completely exhausted after dealing — zero cards remain. This is a valid and legal configuration, but noteworthy because:

- The `deck` field in `GameState` will be empty `[]` — code must not assume `deck.length > 0` after dealing.
- There are exactly enough cards for one round's deal. If the game lasts multiple rounds, `dealRound` must reshuffle all 104 cards (collected + board + hands should all be returned to the deck before reshuffling).

The spec says `dealRound` "shuffles the deck" but doesn't specify that it first recollects all cards from the board, hands, and collected piles back into the deck.

**Fix:** Clarify in §2.1 step 1: "`dealRound()` first returns all cards (board, hands, collected) to the deck, then shuffles the full 104-card deck, then deals."

---

#### GAP-5: `StrategyStats` aggregation for duplicate strategy names is unspecified

**Spec section:** `simulator.md` §3, `cli.md` §3

`BatchResult.perStrategy` is a `ReadonlyMap<string, StrategyStats>` keyed by strategy name. The CLI example shows `--players "bayesian,random,random,random,random"` — four players all named "random."

How is `StrategyStats.wins` counted? If any of the 4 random players wins, does "random" get +1 win? Are scores averaged across all 4 random players per game, or per player-game? `winRate` of 0.095 in the example suggests per-player counting (380 wins / 4 players / 1000 games ≈ 0.095), but this isn't documented.

**Fix:** Explicitly specify: "When multiple players share a strategy name, their results are pooled. `wins` counts the number of player-games won (a game with 2 random winners counts as 2). `winRate = wins / (gamesPlayed × playersWithThisStrategy)`. `avgScore` averages over all player-game scores."

---

#### GAP-6: No specification for card ordering within `resolvedCardsThisRound`

**Spec section:** `engine.md` §1.6

`resolvedCardsThisRound` is described as "Ordered by turn then resolution order," but the spec should clarify: is resolution order the ascending card-number order (as per the lowest-first resolution rule), and does this include cards that triggered row picks?

**Fix:** State explicitly: "Resolution order is ascending by card number within each turn (matching the lowest-first processing rule). All played cards are included regardless of whether they triggered overflow or row picks."

---

### SUGGESTION — Improvements

#### SUGGESTION-1: Add a total cattle heads invariant for testing

The 104 cards produce exactly 171 total cattle heads (7 + 40 + 30 + 18 + 76). This is a valuable test invariant.

**Fix:** Add to §2.3 Invariants: "The sum of `cattleHeads(n)` for n = 1..104 is exactly 171."

---

#### SUGGESTION-2: Define the PRNG algorithm explicitly

**Spec section:** `engine.md` §2.2

The spec says "seed-derived PRNG" and "hash(seed + round)" but doesn't specify *which* hash or PRNG algorithm. For cross-implementation reproducibility (e.g., if someone rewrites the engine in another language), the specific algorithm matters.

**Fix:** Specify the algorithm, e.g.: "Use a seeded xoshiro256** PRNG. Seed derivation uses SHA-256: `perRoundSeed = SHA256(gameSeed + '/' + round)`. The shuffle uses the Fisher-Yates algorithm."

---

#### SUGGESTION-3: Add a `GameEvent` type for the `play` command log

The `play` command needs structured output, and the engine's pure functions could optionally emit events (as return values, not side effects) for observability:

```typescript
type GameEvent =
  | { kind: "round-start"; round: number }
  | { kind: "cards-revealed"; plays: { playerId: string; card: CardNumber }[] }
  | { kind: "card-placed"; playerId: string; card: CardNumber; rowIndex: number }
  | { kind: "overflow-collected"; playerId: string; rowIndex: number; cards: CardNumber[] }
  | { kind: "row-picked"; playerId: string; rowIndex: number; cards: CardNumber[] }
  | { kind: "round-scored"; scores: { playerId: string; roundPenalty: number; totalScore: number }[] }
  | { kind: "game-over"; winner: string[] };
```

---

#### SUGGESTION-4: Specify `PlayerState.id` uniqueness constraint

**Spec section:** `engine.md` §1.4

Player IDs are strings but no uniqueness constraint is stated. Add to §2.3 Invariants: "All `PlayerState.id` values must be unique within a game."

---

#### SUGGESTION-5: Consider adding `cardsAlreadyPlacedThisTurn` to `RowChoiceState`

**Spec section:** `engine.md` §1.6

`RowChoiceState.revealedThisTurn` shows all cards played this turn, but doesn't distinguish which have already been resolved (placed on the board) vs. which are still pending. Since the board state reflects already-placed cards, this is inferable — but making it explicit would reduce strategy implementation effort.

---

## Summary Table

| ID | Severity | Section | Summary |
|----|----------|---------|---------|
| BUG-1 | BUG | §1.1 | `cattleHeads` precedence ambiguous |
| BUG-2 | BUG | sim §4 | GameRunner loop doesn't handle chained row picks |
| AMBIGUITY-1 | AMBIGUITY | §3.2 | No `createGame()` function |
| AMBIGUITY-2 | AMBIGUITY | §1.4, §3.2 | Card removal from hand timing unclear |
| AMBIGUITY-3 | AMBIGUITY | §1.5, §2.1 | Phase transitions implicit, not tabulated |
| AMBIGUITY-4 | AMBIGUITY | §3.3 | Overflow vs. must-pick-row mechanics conflatable |
| AMBIGUITY-5 | AMBIGUITY | §3.3 | Placement tie-breaking impossibility not stated |
| GAP-1 | GAP | §1.5, §1.6 | `resolvedCardsThisRound` has no backing state |
| GAP-2 | GAP | §3.2 | No error handling / precondition spec |
| GAP-3 | GAP | cli §2 | `play` command has no output schema |
| GAP-4 | GAP | §2.1 | 10-player deck exhaustion + round reset unspecified |
| GAP-5 | GAP | sim §3 | Duplicate strategy aggregation undefined |
| GAP-6 | GAP | §1.6 | `resolvedCardsThisRound` ordering underspecified |
| SUGGESTION-1 | SUGGESTION | §2.3 | Add total cattle heads invariant (171) |
| SUGGESTION-2 | SUGGESTION | §2.2 | Specify PRNG/hash algorithm |
| SUGGESTION-3 | SUGGESTION | cli §2 | Add `GameEvent` type for `play` log |
| SUGGESTION-4 | SUGGESTION | §1.4 | Specify player ID uniqueness |
| SUGGESTION-5 | SUGGESTION | §1.6 | Enrich `RowChoiceState` with placement status |

---

## Implementation Readiness

**Needs Minor Fixes**

The core game logic (placement rules, overflow, scoring, turn resolution) is well-specified and correct. The type system and discriminated unions are sound. The two BUGs are easily fixable (clarify precedence, fix the loop). The GAPs around `resolvedCardsThisRound` backing state and `createGame()` must be resolved before implementation begins, but none require architectural changes. An experienced engineer could start implementing the card/row/board layers immediately while the game-lifecycle gaps are addressed.
