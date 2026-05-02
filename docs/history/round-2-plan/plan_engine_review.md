# Plan Review: Engine Specification Alignment
> Reviewed against: spec/engine.md
> Plan version: commit ee1a61c

## Coverage Matrix

| Spec element | Plan task(s) | Status | Notes |
|---|---|---:|---|
| §1.1 `CardNumber` | T2A | Covered | Explicitly listed in `src/engine/types.ts`. |
| §1.2 `Row` | T2A, T2B | Covered | Type in T2A; row behavior in T2B. |
| §1.3 `Board` | T2A, T2C | Covered | Type in T2A; placement logic in T2C. |
| §1.4 `PlayerState` | T2A | Covered | Explicitly listed in `types.ts`. |
| §1.5 `GameState` | T2A, T2D | Covered | Type in T2A; lifecycle logic in T2D. |
| §1.5 `GamePhase` | T2A, T2D | Partial | Type exists; not all legal transitions are explicitly tested. |
| §1.5 `PendingTurnResolution` | T2A, T2D | Covered | Type in T2A; used by turn resolution in T2D. |
| §1.6 `CardChoiceState` | T2A, T2E | Partial | Type exists; projection acceptance is too weak for all required fields. |
| §1.6 `RowChoiceState` | T2A, T2E | Partial | Type exists; only a subset of required fields is explicitly asserted. |
| §1.7 `PlayCardMove` | T2A | Covered | Explicitly listed in `types.ts`. |
| §1.7 `PickRowMove` | T2A | Covered | Explicitly listed in `types.ts`. |
| §1.7 `Move` | T2A | Covered | Explicitly listed in `types.ts`. |
| §3.2 `TurnResolutionResult` | T2A, T2D | Partial | Type exists, but plan does not explicitly verify `applyRowPick()` always returns `completed`. |
| §3.3 `PlacementResult` | T2A, T2C | Covered | Explicitly listed in `types.ts`; used by placement fixtures. |
| §1.2 `tail()` | T2B | Covered | Explicitly listed. |
| §1.2 `penalty()` | T2B | Covered | Explicitly listed. |
| §1.2 `rowLength()` | T2B | Covered | Explicitly listed as `rowLength()`. |
| CardChoice visible fields | T2A, T2E | Partial | Present in type definitions, but no task explicitly verifies all fields are populated correctly. |
| RowChoice visible fields | T2A, T2E | Partial | Acceptance only mentions no hidden info + 3 row-choice-specific fields. |
| §2.1 `dealRound()` recollects all cards | T1G, T2D | Partial | Mentioned in reference model and implied in game lifecycle, but no dedicated engine test. |
| §2.1 shuffle + deal 10/player + place 4 board cards | T1G, T2A, T2D | Partial | Covered conceptually; no explicit engine acceptance for exact deal semantics. |
| §2.1 reset `collected`, `turn=1`, `phase="awaiting-cards"` | T2D | Partial | Not explicitly called out in acceptance/tests. |
| §2.1 `round-over` after turn 10 | T2D, T1F | Partial | Likely exercised by traces, but not explicitly enumerated. |
| §2.1 `scoreRound()` does **not** clear `collected` | T1E, T2D | Partial | Scoring covered; "does not clear collected" is not explicitly tested. |
| §2.1 `isGameOver()` checked only after scoring | T1E, T2D | Partial | End-of-round game-over is covered, but "never mid-round" is not explicitly tested. |
| §2.1.1 All 7 phase transitions | T2D | Partial | Not explicitly listed in acceptance; covered behaviorally. |
| §2.2 xoshiro256** | T1G, T2A | Partial | Required, but only determinism is tested. No known-answer vectors. |
| §2.2 SHA-256 seed derivation | T1G, T2A | Partial | Required, but no known-answer test vectors. |
| §2.2 Fisher-Yates shuffle | T1G, T2A | Partial | Required, but no independent correctness oracle. |
| §2.3 All 10 invariants | T2-GATE | Partial | Plan lists a subset with "etc." — not all explicitly enumerated. |
| §2.4 shared victory on tie | T1E, T4A | Covered | Explicitly listed in scoring fixtures and simulator results. |
| §3.1 Module structure (all 8 files) | T2A–T2E, T3A | Partial | `strategy.ts` deferred to Phase 3; barrel export before it exists. |
| §3.2 `createDeck()` | T2A | Missing | Plan uses `createFullDeck()` — API name mismatch. |
| §3.2 `createGame()` | T2D | Partial | Function exists; exact initial-state contract not explicitly tested. |
| §3.4 All preconditions | T2D | Partial | Wrong-phase mentioned generally; other preconditions not explicitly tested. |

## Gaps Found

1. **[Blocking] Public API drift: `createDeck()` is missing.**
   The spec requires `createDeck(seed)`, but the plan only schedules `createFullDeck()` in T2A. Direct API mismatch against §3.2.

2. **[Blocking] PRNG correctness is not independently verifiable.**
   T1G and T2A both require xoshiro256** + SHA-256 + Fisher-Yates, but the plan only checks determinism and differential agreement. If both implement the same wrong PRNG, the suite still passes.

3. **[Blocking] §3.4 precondition coverage is incomplete.**
   Missing explicit negative tests for: `createGame()` input validation, exactly one card per player in `resolveTurn()`, `scoreRound()` only at turn 10, `toCardChoiceState()` player existence, `toRowChoiceState()` pending-pick matching.

4. **[Blocking] Round-boundary semantics are under-specified in tests.**
   No explicit tests that `scoreRound()` leaves `collected` intact, that `dealRound()` reclaims all cards to a full 104-card deck, or round-start deck size for 2-player and 10-player cases.

5. **[Blocking] Not all §2.1.1 transitions and §2.3 invariants are explicitly covered.**
   T2-GATE says "etc." after listing a subset. Spec defines 7 legal transitions and 10 specific invariants.

6. **[Blocking] Phase 1 examples are internally wrong.**
   T1E "exact-66" example: `60 + cattleHeads([5,10,15]) = 67`, not `68`. T1F trace: `12` placed after `17` violates placement rules.

7. **[Non-Blocking] Visible-state projection acceptance is too weak.**
   T2E only checks "no hidden info" plus 3 row-choice fields. Does not verify all required fields.

8. **[Non-Blocking] Engine module ordering inconsistent with §3.1.**
   `strategy.ts` is part of engine module structure but deferred to Phase 3. Barrel export in T2E before `strategy.ts` exists.

9. **[Non-Blocking] Phase 1 fixtures don't cover visible-state, preconditions, or PRNG correctness.**

## Recommendations

1. Rename `createFullDeck()` to `createDeck(seed)` to match spec API exactly.
2. Add PRNG known-answer test fixtures (SHA-256 outputs, xoshiro256** sequences, shuffled deck orders for canonical seeds).
3. Add dedicated precondition negative tests for every §3.4 function.
4. Add explicit round-boundary tests (scoreRound preserves collected, dealRound reclaims all, deck size checks).
5. Enumerate all 7 transitions and all 10 invariants in T2-GATE — replace "etc." with explicit checklist.
6. Fix T1E and T1F examples before execution.
7. Strengthen T2E visible-state tests to cover all required fields.
8. Move `strategy.ts` to Phase 2 or add explicit barrel-update task in Phase 3.
