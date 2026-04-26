# Implementation Plan — 6 Nimmt! Engine + Simulation CLI

> **Milestone:** Engine and simulation CLI working end-to-end  
> **Approach:** Fully agent-driven — no human writes or reviews code  
> **Execution:** Tasks dispatched via `/fleet` to parallel agent groups  
> **Spec commit:** `77d4c58` (branch: `draft`)

---

## Dependency Graph

```
T0 (scaffold)
├──► T1A (cattle-heads fixture)       ─┐
├──► T1B (placement fixture)           │
├──► T1C (overflow fixture)            │
├──► T1D (must-pick-row fixture)       ├──► T1-VERIFY (harness gate)
├──► T1E (round-scoring fixture)       │        │
├──► T1F (full-game-trace fixture)     │        │
├──► T1G (reference model)            ─┘        │
├──► T1H (anti-cheat lint rules)  ──────────────┤
│                                               │
│    ┌──────────────────────────────────────────┘
│    ▼
│   T2A (types + card + PRNG) ──► T2B (row) ──► T2C (board)
│                                                    │
│                                               T2D (game lifecycle)
│                                                    │
│                                               T2E (visible-state + barrel)
│                                                    │
│                                               T2-GATE (engine fixture tests)
│                                                    │
│                                               T2-REVIEW (adversarial review)
│                                                    │
│                              ┌─────────────────────┘
│                              ▼
│                         T3A (strategy interface + random + registry)
│                              │
│                         T3-TEST (strategy validation)
│                              │
│                         T4A (GameRunner)
│                              │
│                         T4B (BatchRunner + stats)
│                              │
│                         T4-TEST (sim integration + statistical smoke)
│                              │
│                    ┌─────────┴─────────┐
│                    ▼                   ▼
│              T5A (CLI scaffold)   T5B (formatters)
│                    │                   │
│                    ├───────────────────┘
│                    ▼
│              T5C (simulate + strategies + play commands)
│                    │
│              T5-TEST (CLI tests)
│                    │
│              T6-E2E (integration)
│                    │
│              T6-CI (CI pipeline)
│                    │
│              T6-REVIEW (final adversarial review)
│                    │
│                  ✅ MILESTONE
```

---

## Fleet Dispatch Plan

| Fleet # | Tasks | Parallelism | Gate |
|---------|-------|-------------|------|
| **Fleet 1** | T0 | 1 agent | Must pass `npm install && npx tsc --noEmit` |
| **Fleet 2** | T1A, T1B, T1C, T1D, T1E, T1F, T1G, T1H | 8 parallel | — |
| **Fleet 3** | T1-VERIFY | 1 agent | All fixtures pass reference model; lint rules pass |
| **Fleet 4** | T2A, T2B, T2C | 3 sequential* | `npx tsc --noEmit` after each |
| **Fleet 5** | T2D, T2E | 2 sequential* | `npx tsc --noEmit` after each |
| **Fleet 6** | T2-GATE, T2-REVIEW | 1+1 sequential | All fixture tests pass, review produces 0 regressions |
| **Fleet 7** | T3A, T3-TEST | 2 sequential | Strategy tests pass |
| **Fleet 8** | T4A, T4B, T4-TEST | 3 sequential | Sim tests + 10K-game smoke pass |
| **Fleet 9** | T5A, T5B, T5C, T5-TEST | 4 sequential | CLI tests pass |
| **Fleet 10** | T6-E2E, T6-CI, T6-REVIEW | 3 sequential | Full CI green, adversarial review produces 0 regressions |

*Sequential within the fleet because of type dependencies, but dispatched as one fleet.

---

## Phase 0: Project Scaffold

### T0 — Initialize TypeScript Project
- **Agent type:** `general-purpose`
- **Inputs:** `spec/spec.md` (project structure), `spec/harness.md` (anti-cheat requirements)
- **Creates:**
  - `package.json` — project metadata, scripts (`build`, `test`, `test:fixtures`, `test:smoke`, `lint`)
  - `tsconfig.json` — strict mode, ES2022 target, paths for `src/` and `test/`
  - `vitest.config.ts` — test runner config with separate projects for unit/fixture/smoke
  - `.eslintrc.cjs` — base config (anti-cheat rules added in T1H)
  - Directory structure: `src/engine/`, `src/engine/strategies/`, `src/sim/`, `src/cli/`, `test/unit/`, `test/fixtures/`, `test/reference/`, `test/smoke/`, `test/invariant/`
  - Stub `src/engine/index.ts` (empty barrel) so TypeScript compiles
- **Acceptance:**
  - `npm install` succeeds
  - `npx tsc --noEmit` succeeds
  - `npx vitest run` succeeds (0 tests, 0 failures)
  - `npx eslint .` succeeds
- **Notes:**
  - Use `vitest` (not jest) — faster, native ESM, TypeScript-first
  - Use `commander` for CLI argument parsing
  - Pin dependency versions in package.json
  - Add `bin` field pointing to `src/cli/index.ts` for `6nimmt` command

---

## Phase 1: Harness Foundation

> All Phase 1 tasks depend on T0. Tasks T1A–T1H are **fully parallel** (Fleet 2).

### T1A — Golden Fixture: `cattle-heads.json`
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md` (card rules), `spec/engine.md` §1.1 (cattle heads function)
- **Creates:** `spec/fixtures/cattle-heads.json`
- **Schema:**
  ```json
  {
    "description": "All 104 cards with correct cattle head values",
    "source": "spec/rules/6-nimmt.md",
    "cards": [
      { "number": 1, "cattleHeads": 1 },
      { "number": 2, "cattleHeads": 1 },
      ...
      { "number": 104, "cattleHeads": 1 }
    ],
    "sentinels": [
      { "number": 55, "cattleHeads": 7, "reason": "Special card" },
      { "number": 50, "cattleHeads": 3, "reason": "Multiple of 10, not 11" },
      { "number": 100, "cattleHeads": 3, "reason": "Multiple of 10" },
      { "number": 5, "cattleHeads": 2, "reason": "Multiple of 5, not 10" },
      { "number": 11, "cattleHeads": 5, "reason": "Multiple of 11" }
    ],
    "checksum": { "totalCattleHeads": 171, "totalCards": 104 }
  }
  ```
- **Acceptance:**
  - File contains exactly 104 card entries
  - Numbers 1–104, no duplicates, no gaps
  - `sum(cattleHeads)` = 171
  - Rule priority is correct: 55→7, %11→5, %10→3, %5→2, else→1
  - Sentinel checks match the documented special cases
- **Verification method:** Agent must include a self-check script (or inline assertion) that validates the fixture against the rules. The agent should enumerate every card and verify the cattle heads value using the priority rules from spec.

### T1B — Golden Fixture: `placement-scenarios.json`
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md` (placement rules 1–4), `spec/engine.md` §3.3 (placement logic)
- **Creates:** `spec/fixtures/placement-scenarios.json`
- **Requirements (≥20 scenarios):**
  - **Basic placement (rule 1+2):** Card goes to row with closest lower tail
    - All 4 rows eligible — card goes to closest tail
    - Only 1 row eligible — card goes there
    - 2 rows eligible with different gaps
    - Card = tail + 1 (minimum gap)
    - Card much larger than all tails
  - **Overflow (rule 3):** Row already has 5 cards
    - Single overflow in a turn
    - Multiple overflows in the same turn (different players)
    - Overflow changes board, affecting later placements in same turn
  - **Must-pick-row (rule 4):** Card lower than all tails
    - Card lower than all 4 tails
    - After row pick, subsequent card placements use modified board
  - **Edge cases:**
    - Board with rows of varying lengths (1, 2, 3, 4, 5 cards)
    - Card 1 (always triggers rule 4 unless it's a tail)
    - Card 104 (always has an eligible row)
- **Schema per scenario:**
  ```json
  {
    "id": "placement-basic-closest-tail",
    "description": "Card 33 placed on row with tail 30, not 29",
    "board": { "rows": [[25, 29], [10, 17, 30], [40], [80, 90]] },
    "card": 33,
    "expected": { "kind": "place", "rowIndex": 1, "causesOverflow": false }
  }
  ```
- **Acceptance:** Each scenario hand-verified against rules. Include at least 3 from each category above.

### T1C — Golden Fixture: `overflow-scenarios.json`
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md` (rule 3), `spec/engine.md` §3.3
- **Creates:** `spec/fixtures/overflow-scenarios.json`
- **Requirements (≥5 scenarios):**
  - Row with exactly 5 cards, 6th card triggers collection
  - Multiple overflows in one turn
  - Overflow after a rule-4 row pick in same turn
  - Overflow that changes which row a subsequent card goes to
  - Verify collected cards = the 5 existing cards (not the triggering card)
- **Schema per scenario:**
  ```json
  {
    "id": "overflow-basic",
    "description": "6th card on row 0 triggers collection of 5 cards",
    "board": { "rows": [[3, 12, 24, 55, 78], [40], [60], [90]] },
    "plays": [{ "playerId": "p0", "card": 80 }],
    "expected": {
      "collected": { "p0": [3, 12, 24, 55, 78] },
      "boardAfter": { "rows": [[80], [40], [60], [90]] }
    }
  }
  ```
- **Acceptance:** Each scenario's expected output is hand-derived from rules.

### T1D — Golden Fixture: `must-pick-row-scenarios.json`
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md` (rule 4), `spec/engine.md` §3.3
- **Creates:** `spec/fixtures/must-pick-row-scenarios.json`
- **Requirements (≥5 scenarios):**
  - Player picks a row with 1 card (collects 1 card)
  - Player picks a row with 5 cards (collects 5 cards)
  - Player picks row with fewest cattle heads
  - After row pick, board is modified for subsequent cards in same turn
  - Rule 4 only triggers for the lowest card in a turn (invariant check)
- **Schema per scenario:**
  ```json
  {
    "id": "must-pick-1-card-row",
    "description": "Card 2 < all tails, player picks row 2 (1 card, tail=60)",
    "board": { "rows": [[10, 20], [30, 40, 50], [60], [70, 80, 90, 95]] },
    "plays": [{ "playerId": "p0", "card": 2 }],
    "rowChoice": { "playerId": "p0", "rowIndex": 2 },
    "expected": {
      "collected": { "p0": [60] },
      "boardAfter": { "rows": [[10, 20], [30, 40, 50], [2], [70, 80, 90, 95]] }
    }
  }
  ```
- **Acceptance:** Each scenario's expected output is hand-derived from rules.

### T1E — Golden Fixture: `round-scoring-scenarios.json`
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md` (scoring + game-over), `spec/engine.md` §2.1
- **Creates:** `spec/fixtures/round-scoring-scenarios.json`
- **Requirements (≥5 scenarios):**
  - Player hits exactly 66 → game over
  - Player hits 67+ → game over
  - Multiple players hit ≥66 in same round → game over, lowest wins
  - ALL players ≥66 → game over, lowest still wins
  - No player ≥66 → game continues (not over)
  - Tie for lowest score → shared victory
  - Score = sum of cattleHeads of collected cards (not card numbers!)
- **Schema per scenario:**
  ```json
  {
    "id": "exact-66-triggers-game-over",
    "description": "Player reaches exactly 66 cattle heads, game ends",
    "playersBefore": [
      { "id": "p0", "score": 60, "collected": [5, 10, 15] },
      { "id": "p1", "score": 20, "collected": [1, 2] }
    ],
    "expected": {
      "scoresAfter": [{ "id": "p0", "score": 68 }, { "id": "p1", "score": 22 }],
      "gameOver": true,
      "winners": ["p1"]
    }
  }
  ```
- **Acceptance:** All cattle-heads sums manually verified. Game-over logic matches rules.

### T1F — Golden Fixture: `full-game-traces.json`
- **Agent type:** `general-purpose`
- **Inputs:** All spec files, `spec/rules/6-nimmt.md`
- **Creates:** `spec/fixtures/full-game-traces.json`
- **Requirements (≥2 complete games):**
  - **Game 1:** 2 players, short game (few rounds) — minimum complexity, full trace
  - **Game 2:** 4–5 players, multi-round game — exercises more interactions
  - Each game trace includes:
    - Seed used
    - Initial deck order (from seed)
    - Every round: deal results, all 10 turns with plays → placements → board state after each card
    - Row picks where they occur
    - Round scores
    - Final results with rankings
  - Every intermediate state is fully specified — no gaps
- **Schema:**
  ```json
  {
    "id": "2-player-short-game",
    "seed": "trace-seed-001",
    "playerCount": 2,
    "rounds": [
      {
        "round": 1,
        "deckOrder": [3, 55, 17, ...],
        "dealtHands": { "p0": [3, 12, ...], "p1": [55, 8, ...] },
        "initialBoard": [[17], [42], [78], [99]],
        "turns": [
          {
            "turn": 1,
            "plays": [{ "playerId": "p0", "card": 12 }, { "playerId": "p1", "card": 55 }],
            "resolution": [
              { "card": 12, "playerId": "p0", "placement": { "kind": "place", "rowIndex": 0, "causesOverflow": false } },
              { "card": 55, "playerId": "p1", "placement": { "kind": "place", "rowIndex": 2, "causesOverflow": false } }
            ],
            "boardAfter": [[17, 12], ...]
          }
        ],
        "roundScores": [{ "id": "p0", "penalty": 5, "totalScore": 5 }, ...]
      }
    ],
    "finalResults": [{ "id": "p0", "finalScore": 42, "rank": 2 }, { "id": "p1", "finalScore": 31, "rank": 1 }],
    "winners": ["p1"]
  }
  ```
- **Critical constraint:** The agent must play out each game step-by-step following the rules exactly. Every intermediate board state must be consistent with the previous state + the card placed. The trace must be a valid game under the rules — no shortcuts.
- **Acceptance:** A separate verification pass (in T1-VERIFY) replays the trace against the reference model.

### T1G — Reference Model
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md`, `spec/engine.md`, `spec/harness.md` §Layer 3
- **Creates:**
  - `test/reference/reference-model.ts` — ~200 lines, deliberately naive implementation
  - `test/reference/index.ts` — barrel export
- **Requirements:**
  - Hardcoded lookup table for `cattleHeads()` — all 104 values, no computation
  - `determinePlacement()` — iterate all 4 rows, find eligible ones (tail < card), pick closest
  - `resolveOverflow()` — if row has 5 cards, collect them, start new row
  - `resolveTurn()` — sort plays ascending, resolve one-by-one, handle overflows and row picks
  - `scoreRound()` — sum cattleHeads of collected cards for each player
  - `isGameOver()` — any player score ≥ 66
  - `getWinners()` — player(s) with lowest total score
  - `dealRound()` — recollect all cards, shuffle with seed, deal 10/player + 4 to board
- **Style constraints:**
  - Flat imperative code, no abstractions, no classes
  - No imports from `src/` (completely independent)
  - Each function ≤30 lines
  - Inline comments referencing rule numbers from `spec/rules/6-nimmt.md`
  - Must use the same PRNG algorithm (xoshiro256**) and seed derivation (SHA-256) as specified in `spec/engine.md` §2.2 — otherwise differential testing won't work
- **Acceptance:**
  - Compiles with `npx tsc --noEmit`
  - Self-test: reference model can play a complete game to termination

### T1H — Anti-Cheat ESLint Rules
- **Agent type:** `general-purpose`
- **Inputs:** `spec/harness.md` §Layer 6
- **Creates:**
  - `.eslintrc.cjs` update (or `eslint.config.js` if using flat config)
  - Custom ESLint rule or config restricting `src/engine/**`:
    - No imports of `fs`, `path`, `child_process`, `process.env`, `http`, `https`, `net`
    - No string literals matching fixture file names (`cattle-heads`, `placement-scenarios`, etc.)
    - No references to test framework APIs (`describe`, `it`, `test`, `expect`, `jest`, `vitest`)
    - No `NODE_ENV` or `process.env.TEST` conditionals
- **Acceptance:**
  - `npx eslint src/engine/` passes on clean engine stubs
  - Creating a test file in `src/engine/` that imports `fs` fails lint
  - Creating a file referencing `describe` in `src/engine/` fails lint

### T1-VERIFY — Harness Verification Gate
- **Agent type:** `general-purpose`
- **Depends on:** T1A–T1H (all complete)
- **Purpose:** Verify all harness artifacts are internally consistent and correct
- **Actions:**
  1. Create `test/fixtures/fixture-runner.test.ts` — test runner that loads each fixture and runs it against the reference model
  2. Create `test/fixtures/cattle-heads.test.ts` — validates cattle-heads.json (104 cards, sum=171, priority rules)
  3. Create `test/fixtures/trace-replay.test.ts` — replays full-game-traces.json against reference model, asserts every intermediate state matches
  4. Run all fixture tests: `npx vitest run test/fixtures/`
  5. Run lint: `npx eslint .`
- **Acceptance:**
  - All fixture tests pass against the reference model
  - Full game traces replay correctly (every intermediate state matches)
  - Lint passes
  - No circular dependencies between test/ and src/
- **This is the critical trust gate.** If fixtures and reference model disagree, the harness is broken. Fix before proceeding.

---

## Phase 2: Engine Implementation

> Sequential dependencies between engine modules due to type imports.  
> Each task must pass `npx tsc --noEmit` and fixture tests for its scope.

### T2A — Types, Card Module, PRNG
- **Agent type:** `general-purpose`
- **Depends on:** T1-VERIFY
- **Inputs:** `spec/engine.md` §1.1, §1.4–1.7, §2.2
- **Creates:**
  - `src/engine/types.ts` — `CardNumber`, `Row`, `Board`, `PlayerState`, `GameState`, `GamePhase`, `PendingTurnResolution`, `CardChoiceState`, `RowChoiceState`, `PlayCardMove`, `PickRowMove`, `Move`, `TurnResolutionResult`, `PlacementResult`
  - `src/engine/card.ts` — `cattleHeads()`, `createFullDeck()`, `isValidCardNumber()`
  - `src/engine/prng.ts` — xoshiro256** implementation, SHA-256 seed derivation, Fisher-Yates shuffle
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - `cattleHeads()` fixture test passes (test/fixtures/cattle-heads.test.ts)
  - PRNG is deterministic: same seed → same output sequence
  - Deck generation: `createFullDeck()` returns shuffled 104 cards, all unique

### T2B — Row Module
- **Agent type:** `general-purpose`
- **Depends on:** T2A
- **Inputs:** `spec/engine.md` §1.2
- **Creates:**
  - `src/engine/row.ts` — `tail()`, `penalty()`, `rowLength()`, `appendCard()`, `isOverflowing()`
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - Unit tests for all row operations

### T2C — Board Module (Placement Logic)
- **Agent type:** `general-purpose`
- **Depends on:** T2B
- **Inputs:** `spec/engine.md` §1.3, §3.3
- **Creates:**
  - `src/engine/board.ts` — `determinePlacement()`, `placeCard()`, `collectRow()`
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - Placement fixture tests pass (test/fixtures/placement-scenarios)
  - Overflow fixture tests pass (test/fixtures/overflow-scenarios)
  - Must-pick-row fixture tests pass (test/fixtures/must-pick-row-scenarios)

### T2D — Game Lifecycle
- **Agent type:** `general-purpose`
- **Depends on:** T2C
- **Inputs:** `spec/engine.md` §2.1, §3.2, §3.4
- **Creates:**
  - `src/engine/game.ts` — `createGame()`, `dealRound()`, `resolveTurn()`, `applyRowPick()`, `scoreRound()`, `isGameOver()`
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - Round-scoring fixture tests pass
  - Full game trace fixture tests pass (the critical test — replays entire games)
  - All phase transition preconditions validated (throws on wrong phase)

### T2E — Visible State Projection + Barrel Export
- **Agent type:** `general-purpose`
- **Depends on:** T2D
- **Inputs:** `spec/engine.md` §1.6, §3.1
- **Creates:**
  - `src/engine/visible-state.ts` — `toCardChoiceState()`, `toRowChoiceState()`
  - `src/engine/index.ts` — barrel export of all public API
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - Visible state projections contain only public information (no hands of other players, no deck)
  - `toRowChoiceState()` includes `triggeringCard`, `revealedThisTurn`, `resolutionIndex`

### T2-GATE — Engine Verification Gate
- **Agent type:** `task`
- **Depends on:** T2E
- **Actions:**
  1. `npx vitest run test/fixtures/` — all fixture tests pass
  2. Create and run `test/invariant/invariants.test.ts` — run 100 random games, check all invariants after every state transition (total cards = 104, unique cards, row lengths 1–5, strictly increasing row values, etc.)
  3. Create and run `test/invariant/metamorphic.test.ts` — player rename, input order independence, seed determinism, serialisation round-trip
  4. Create and run `test/invariant/differential.test.ts` — generate 1000 random game states, run both reference model and engine, assert identical outputs
  5. `npx eslint src/engine/` — anti-cheat lint passes
- **Acceptance:** All tests pass. Zero fixture failures. Zero invariant violations. Zero differential mismatches.

### T2-REVIEW — Adversarial Engine Review
- **Agent type:** `code-review` (followed by `rubber-duck`)
- **Depends on:** T2-GATE
- **Actions:**
  1. Code review agent reads spec + implementation (not tests), produces concrete failing test cases for any discrepancy
  2. Rubber-duck agent reviews the test cases for correctness
  3. Any valid failing tests → implementation must be fixed before proceeding
- **Acceptance:** All adversarial test cases either pass or are proven incorrect.

---

## Phase 3: Strategy Layer

### T3A — Strategy Interface + Random Baseline + Registry
- **Agent type:** `general-purpose`
- **Depends on:** T2-REVIEW (engine must be verified first)
- **Inputs:** `spec/strategies.md`
- **Creates:**
  - `src/engine/strategy.ts` — `Strategy` interface, `TurnResolution` type (if not already in types.ts)
  - `src/engine/strategies/random.ts` — `RandomStrategy` class implementing `Strategy`
  - `src/engine/strategies/index.ts` — strategy registry map
- **Requirements:**
  - `RandomStrategy.chooseCard()` uses seeded `rng` from `onGameStart()`, not `Math.random()`
  - `RandomStrategy.chooseRow()` picks row with fewest cattle heads (deterministic tiebreak: lowest row index)
  - Registry is a `ReadonlyMap<string, () => Strategy>` for factory pattern
  - Illegal strategy output handling per spec: forfeit to lowest card / fewest-heads row
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - Random strategy produces valid moves for any legal game state (fuzz with 1000 random states)
  - Same seed → same strategy decisions

### T3-TEST — Strategy Validation
- **Agent type:** `task`
- **Depends on:** T3A
- **Actions:**
  1. Create `test/unit/strategies/random.test.ts`
  2. Test: chooseCard always returns a card from hand
  3. Test: chooseRow always returns 0–3
  4. Test: deterministic with same seed
  5. Test: illegal output handling (mock strategy that returns invalid cards)
  6. Run: `npx vitest run test/unit/strategies/`
- **Acceptance:** All tests pass.

---

## Phase 4: Simulator

### T4A — GameRunner
- **Agent type:** `general-purpose`
- **Depends on:** T3-TEST
- **Inputs:** `spec/simulator.md` §4
- **Creates:**
  - `src/sim/types.ts` — `SimConfig`, `GameResult`, `PlayerResult`, `BatchResult`, `StrategyStats`
  - `src/sim/runner.ts` — `GameRunner.runGame(config: SimConfig): GameResult`
- **Requirements:**
  - Follows the loop in simulator spec §4 exactly
  - Calls strategy lifecycle hooks (`onGameStart`, `onTurnResolved`, `onRoundEnd`) at correct times
  - Handles strategy errors gracefully (forfeit, not crash)
  - Returns complete `GameResult` with seed, rounds count, player results with rankings
- **Acceptance:**
  - A seeded game produces identical `GameResult` on repeated runs
  - Game terminates (no infinite loops)
  - Rankings are correct (lowest score = rank 1)

### T4B — BatchRunner + Statistics
- **Agent type:** `general-purpose`
- **Depends on:** T4A
- **Inputs:** `spec/simulator.md` §5–7
- **Creates:**
  - `src/sim/batch.ts` — `BatchRunner.runBatch(config: SimConfig, games: number, seed: string): BatchResult`
  - `src/sim/stats.ts` — aggregation functions (win rate, avg/median/min/max/stddev)
  - `src/sim/index.ts` — barrel export
- **Requirements:**
  - Per-game seed derivation: `hash(batchSeed + gameIndex)`
  - Results pooled per strategy name (not per seat)
  - Win rate = wins / (gamesPlayed × playersWithThisStrategy)
  - Shared wins (tie at lowest score) count for all tied players
- **Acceptance:**
  - Batch of 100 games completes without error
  - Same batch seed → identical `BatchResult`
  - Statistics are mathematically correct (spot-check a few games manually)

### T4-TEST — Simulator Integration + Statistical Smoke Tests
- **Agent type:** `task`
- **Depends on:** T4B
- **Actions:**
  1. Create `test/unit/sim/runner.test.ts` — seeded replay test, lifecycle hook invocation order
  2. Create `test/unit/sim/batch.test.ts` — batch determinism, aggregation correctness
  3. Create `test/smoke/statistical.test.ts` — 10,000 games with 5 random players:
     - All games terminate
     - Average game length 1–10 rounds
     - No negative scores
     - Winner exists in every game
     - Win rate per seat roughly equal (χ² test, p > 0.01)
  4. Run: `npx vitest run test/unit/sim/ test/smoke/`
- **Acceptance:** All tests pass. Statistical smoke tests within bounds.

---

## Phase 5: CLI

### T5A — CLI Scaffold + Argument Parsing
- **Agent type:** `general-purpose`
- **Depends on:** T4-TEST
- **Inputs:** `spec/cli.md` §1–4
- **Creates:**
  - `src/cli/index.ts` — entry point with `commander` setup, command registration
  - Shebang line for `npx 6nimmt` execution
- **Requirements:**
  - Three subcommands: `simulate`, `strategies`, `play`
  - Global `--format` option (table/json/csv, default: table)
  - Exit codes per spec: 0 success, 1 invalid args, 2 runtime error
  - Structured JSON errors when `--format json`
- **Acceptance:**
  - `npx 6nimmt --help` shows all commands
  - `npx 6nimmt simulate --help` shows all options
  - Invalid arguments produce correct exit code and error message

### T5B — Output Formatters
- **Agent type:** `general-purpose`
- **Depends on:** T5A (can run parallel with T5C if interfaces are stable)
- **Inputs:** `spec/cli.md` §3
- **Creates:**
  - `src/cli/formatters/json.ts` — JSON output with meta envelope
  - `src/cli/formatters/table.ts` — human-readable table output
  - `src/cli/formatters/csv.ts` — CSV output
- **Acceptance:**
  - JSON output matches spec schema exactly (including `meta` envelope)
  - Table output is readable
  - CSV output is importable into spreadsheets

### T5C — Commands (simulate, strategies, play)
- **Agent type:** `general-purpose`
- **Depends on:** T5A, T5B
- **Inputs:** `spec/cli.md` §2
- **Creates:**
  - `src/cli/commands/simulate.ts` — `--strategies`, `--games`, `--seed`, `--format`, `--verbose`, `--dry-run`
  - `src/cli/commands/strategies.ts` — list registered strategies
  - `src/cli/commands/play.ts` — single game with turn-by-turn output
- **Requirements:**
  - `--strategies` accepts both comma-separated and JSON array format
  - `--dry-run` validates args and outputs resolved config without running
  - Strategy name validation with "did you mean?" suggestions
  - Player count validation (2–10)
  - `play` command outputs complete game log per spec JSON schema
- **Acceptance:**
  - `npx 6nimmt simulate --strategies random,random,random,random --games 10 --seed test --format json` produces valid output
  - `npx 6nimmt strategies --format json` lists all strategies
  - `npx 6nimmt play --strategies random,random --seed test --format json` outputs full game trace
  - `npx 6nimmt simulate --strategies nonexistent` produces `INVALID_STRATEGY` error with suggestions

### T5-TEST — CLI Tests
- **Agent type:** `task`
- **Depends on:** T5C
- **Actions:**
  1. Create `test/unit/cli/simulate.test.ts` — argument parsing, dry-run, output format
  2. Create `test/unit/cli/strategies.test.ts` — list output
  3. Create `test/unit/cli/play.test.ts` — full game output schema validation
  4. Create `test/unit/cli/errors.test.ts` — error codes, structured errors, "did you mean?"
  5. Snapshot tests for table/json/csv output formats
  6. Run: `npx vitest run test/unit/cli/`
- **Acceptance:** All tests pass. Output schemas match spec.

---

## Phase 6: Integration & Final Verification

### T6-E2E — End-to-End Integration Test
- **Agent type:** `general-purpose`
- **Depends on:** T5-TEST
- **Creates:**
  - `test/e2e/cli-e2e.test.ts` — run actual CLI commands as subprocesses, validate output
- **Tests:**
  - Full simulate pipeline: CLI → BatchRunner → GameRunner → Engine → output
  - Seeded replay: run same command twice, assert identical output
  - All format variations (json, table, csv)
  - Error scenarios (invalid strategies, bad player count)
  - Performance: 1000 games completes within 30 seconds
- **Acceptance:** All E2E tests pass.

### T6-CI — CI Pipeline
- **Agent type:** `general-purpose`
- **Depends on:** T6-E2E
- **Creates:**
  - `.github/workflows/ci.yml` — GitHub Actions workflow
- **CI steps (in order):**
  1. Install dependencies
  2. TypeScript compilation (`npx tsc --noEmit`)
  3. ESLint (including anti-cheat rules)
  4. Golden fixture tests (`npx vitest run test/fixtures/`)
  5. Unit tests (`npx vitest run test/unit/`)
  6. Invariant + metamorphic tests (`npx vitest run test/invariant/`)
  7. Generate hidden holdout fixtures (reference model + random seeds)
  8. Run holdout fixture tests
  9. Statistical smoke tests (`npx vitest run test/smoke/`)
  10. E2E tests (`npx vitest run test/e2e/`)
- **Acceptance:** CI runs green on current branch.

### T6-REVIEW — Final Adversarial Review
- **Agent type:** `code-review`
- **Depends on:** T6-CI
- **Actions:**
  1. Full code review of `src/` against `spec/`
  2. Produce concrete failing test cases for any discrepancy
  3. Run the new test cases
  4. Fix any failures found
- **Acceptance:** All adversarial test cases pass. CI remains green.

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 25 |
| Fleet dispatches | 10 |
| Max parallelism (Fleet 2) | 8 agents |
| Verification gates | 4 (T1-VERIFY, T2-GATE, T4-TEST, T6-CI) |
| Review checkpoints | 2 (T2-REVIEW, T6-REVIEW) |

### Milestone Definition: ✅ Engine + Simulation CLI E2E

The milestone is achieved when:
- `npx 6nimmt simulate --strategies random,random,random,random,random --games 1000 --seed benchmark --format json` produces correct, deterministic output
- `npx 6nimmt play --strategies random,random --seed demo --format json` outputs a complete, rule-correct game trace
- `npx 6nimmt strategies` lists available strategies
- All 7 verification layers pass in CI
- No human has written or reviewed any code
