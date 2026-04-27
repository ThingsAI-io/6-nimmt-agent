# Implementation Plan — 6 Nimmt! Engine, Simulation CLI & MCP Server

> **Milestone:** Engine, simulation CLI, and MCP server working end-to-end  
> **Approach:** Fully agent-driven — no human writes or reviews code  
> **Execution:** Tasks dispatched via `/fleet` to parallel agent groups  
> **Spec commit:** `ed5af02` (branch: `draft`)  
> **Total tasks:** 33

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
│                                          T1-CI (early CI skeleton + harness freeze)
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
│                              ┌─────────────────────┘
│                              │
│                              │   T2-REVIEW (adversarial review, non-blocking)
│                              │
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
│              T5C (simulate + strategies + play + recommend commands)
│                    │
│              T5-TEST (CLI tests)
│                    │
│              ┌─────┴─────────────────┐
│              ▼                       ▼
│         T5D (MCP server core)   T5E (MCP session + events)
│              │                       │
│              ├───────────────────────┘
│              ▼
│         T5F-TEST (MCP tests)
│              │
│         T6-E2E (integration)
│              │
│         T6-CI (CI pipeline)
│              │
│         T6-REVIEW (final adversarial review)
│              │
│            ✅ MILESTONE
```

---

## Fleet Dispatch Plan

| Fleet # | Tasks | Parallelism | Gate |
|---------|-------|-------------|------|
| **Fleet 1** | T0 | 1 agent | Must pass `npm install && npx tsc --noEmit` |
| **Fleet 2a** | T1A, T1B, T1C, T1D, T1E, T1G, T1H | 7 parallel | — |
| **Fleet 2b** | T1F | 1 agent (after T1G) | T1F uses reference model from T1G |
| **Fleet 3** | T1-VERIFY → T1-CI | 2 sequential | All fixtures pass reference model; lint rules pass; CI skeleton green |
| **Fleet 4** | T2A, T2B, T2C | 3 sequential* | `npx tsc --noEmit` after each |
| **Fleet 5** | T2D, T2E | 2 sequential* | `npx tsc --noEmit` after each |
| **Fleet 6** | T2-GATE | 1 agent | All fixture tests pass |
| **Fleet 6bg** | T2-REVIEW | 1 agent (background) | Non-blocking; findings filed as issues |
| **Fleet 7** | T3A, T3-TEST | 2 sequential | Strategy tests pass + baseline regression (`test/fixtures/ + test/invariant/`) |
| **Fleet 8** | T4A, T4B, T4-TEST | 3 sequential | Sim tests + parameterized smoke (2/5/10 players) + baseline regression |
| **Fleet 9** | T5A, T5B, T5C, T5-TEST | 4 sequential | CLI tests pass + baseline regression |
| **Fleet 10** | T5D, T5E, T5F-TEST | 3 sequential | MCP tools tested, session lifecycle verified + baseline regression |
| **Fleet 11** | T6-E2E, T6-CI, T6-REVIEW | 3 sequential | Full CI green; E2E runs at 2/5/10 players; adversarial review produces 0 regressions |

*Sequential within the fleet because of type dependencies, but dispatched as one fleet.

---

## Single-Session Execution Rules

> These rules ensure the entire implementation can be completed correctly in one large AI session.

### Checkpoint & Rollback

After each verification gate passes, the current state is a **green checkpoint**:
- **CP-1:** After T1-VERIFY (harness frozen)
- **CP-2:** After T2-GATE (engine verified)
- **CP-3:** After T4-TEST (simulator verified)
- **CP-4:** After T5F-TEST (MCP verified)
- **CP-5:** After T6-CI (full CI green)

**Recovery rule:** If any gate fails, revert to the last green checkpoint, then dispatch a scoped fix task targeting only the failing module. Do not proceed past a failed gate.

### Intermediate Regression

From Phase 3 onward, every fleet gate MUST rerun the following baseline tests before proceeding:
```
npx vitest run test/fixtures/ test/invariant/
```
This catches regressions introduced by later phases touching shared engine code. Full regression is deferred to T6-CI, but this baseline catches critical breakage early.

### Phase 1 Trust Boundary

To prevent a "shared misunderstanding" where both fixtures and reference model encode the same wrong interpretation:

1. **T1G (Reference Model) must be dispatched and verified BEFORE T1F (full-game-traces).** T1F traces are generated by running the reference model with known seeds, not hand-authored from scratch.
2. **T1A–T1E** (smaller fixtures) are hand-derived and independently verifiable — these remain parallel.
3. **T1-VERIFY** acts as the cross-verification gate: fixtures (T1A–T1E) are checked against the reference model (T1G). If they disagree, the fixture is wrong (model is the oracle for resolution ordering and board state; rules text is the oracle for cattle-heads scoring).

### Full-Game Trace Generation (T1F)

Full-game traces are NOT hand-authored from scratch. Instead:
1. The agent picks seed values and player counts
2. The agent uses the reference model (T1G) to compute the trace step-by-step
3. The agent verifies each step against the rules (spot-check, not full manual derivation)
4. T1-VERIFY replays the trace against the reference model for bit-exact verification

This eliminates the risk of hand-authoring errors in complex 10-player multi-round traces.

### CLI/MCP Boundary

- Phase 5 (CLI) implements `serve` as a **thin bootstrap** only — it wires up stdio transport and delegates to `src/mcp/server.ts`. The `serve` test in T5-TEST only verifies the process starts and responds to a health-check ping.
- Phase 5b (MCP) implements all tool logic. T5D/T5E build the actual MCP tools.
- No circular dependency: CLI `serve` is just a wrapper; its test doesn't require MCP tools to exist.

### Hidden Holdout Secrecy

Hidden holdout fixtures (T6-CI steps 7–8) must be **genuinely hidden** from implementing agents:
- Seeds are derived from `SHA256(CI_RUN_ID + '/holdout/' + index)` — using the CI run's unique ID as entropy
- Generated fixture content is never uploaded as artifacts and never printed to CI logs
- Only pass/fail status of holdout tests appears in CI output
- Holdout generation + test execution happens in a single CI step that discards intermediate files

### Contract Freezing for Parallel Work

Before dispatching parallel agents within a fleet:
- **Fleet 2 (T1A–T1H):** The fixture JSON schemas are defined in the plan (above) — agents MUST use these exact schemas.
- **Fleet 4/5 (T2A–T2E):** Types from T2A are the frozen contract. T2B/T2C/T2D/T2E import from T2A but cannot redefine types.
- **Fleet 9 (T5A–T5C):** T5A defines the CLI scaffold and argument interfaces. T5B/T5C import from T5A.
- **Fleet 10 (T5D–T5E):** T5D defines `src/mcp/server.ts` and `src/mcp/errors.ts` — these are the frozen contracts for T5E.

### CLI/MCP Consistency Check

T6-E2E MUST include a test that runs the same recommendation scenario through:
1. CLI `recommend` command
2. MCP `recommend_once` tool

And asserts identical domain output (same `card`, `confidence`, `alternatives`). This catches divergence between the two interfaces sharing the same engine.

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
  - Directory structure: `src/engine/`, `src/engine/strategies/`, `src/sim/`, `src/cli/`, `src/mcp/`, `src/mcp/tools/`, `test/unit/`, `test/fixtures/`, `test/reference/`, `test/smoke/`, `test/invariant/`
  - Stub `src/engine/index.ts` (empty barrel) so TypeScript compiles
  - Stub `src/cli/index.ts` with shebang (`#!/usr/bin/env node`) so CLI entrypoint exists
- **Acceptance:**
  - `npm install` succeeds
  - `npx tsc --noEmit` succeeds
  - `npm run build` succeeds and produces `dist/cli/index.js`
  - `node dist/cli/index.js --help` runs without error (CLI entrypoint is executable via built output)
  - `npx vitest run` succeeds (0 tests, 0 failures)
  - `npx eslint .` succeeds
- **Notes:**
  - Use `vitest` (not jest) — faster, native ESM, TypeScript-first
  - Use `commander` for CLI argument parsing
  - Use `@modelcontextprotocol/sdk` for MCP server implementation
  - Pin dependency versions in package.json
  - Add `bin` field pointing to `dist/cli/index.js` (the built artifact, not raw TypeScript)

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
- **Requirements (≥25 scenarios):**
  - **Single-card placement (rule 1+2):** Card goes to row with closest lower tail
    - All 4 rows eligible — card goes to closest tail
    - Only 1 row eligible — card goes there
    - 2 rows eligible with different gaps
    - Card = tail + 1 (minimum gap)
    - Card much larger than all tails
  - **Single-card overflow (rule 3):** Row already has 5 cards
    - Single overflow in a turn
  - **Single-card must-pick-row (rule 4):** Card lower than all tails
    - Card lower than all 4 tails
  - **Multi-play turn resolution (2 simultaneous plays):**
    - Two cards placed, no interaction between them
    - Two cards targeting the same row, lower card placed first
    - One card overflows, second card's target row changes as a result
  - **Multi-play turn resolution (5 simultaneous plays):**
    - Five cards with mixed rule triggers (placement, overflow, must-pick-row)
    - Five cards all targeting the same row (cascading overflows)
  - **Multi-play turn resolution (10 simultaneous plays):**
    - Full 10-player turn with complex interactions
    - 10 cards where early placements affect later placement targets
    - 10 cards including at least one overflow and one must-pick-row
  - **Edge cases:**
    - Board with rows of varying lengths (1, 2, 3, 4, 5 cards)
    - Card 1 (always triggers rule 4 unless it's a tail)
    - Card 104 (always has an eligible row)
- **Schema — single-card variant:**
  ```json
  {
    "id": "placement-basic-closest-tail",
    "description": "Card 33 placed on row with tail 30, not 29",
    "board": [[25, 29], [10, 17, 30], [40], [80, 90]],
    "card": 33,
    "expected": { "kind": "place", "rowIndex": 1, "causedOverflow": false }
  }
  ```
- **Schema — multi-play variant:**
  ```json
  {
    "id": "turn-resolution-2-players-no-interaction",
    "description": "Two cards placed on different rows, no interaction",
    "board": [[10], [20], [30], [40]],
    "plays": [
      { "playerId": "p0", "card": 15 },
      { "playerId": "p1", "card": 35 }
    ],
    "expected": {
      "resolutions": [
        { "playerId": "p0", "card": 15, "rowIndex": 0, "causedOverflow": false },
        { "playerId": "p1", "card": 35, "rowIndex": 2, "causedOverflow": false }
      ],
      "collected": {},
      "boardAfter": [[10, 15], [20], [30, 35], [40]]
    }
  }
  ```
- **Acceptance:**
  - Each scenario hand-verified against rules
  - Include at least 3 single-card scenarios from each placement category
  - Include at least 2 multi-play scenarios for each of the 2-, 5-, and 10-player counts
  - Multi-play scenarios include `plays` array (sorted ascending by card for resolution), expected `resolutions` with per-card placements, `rowPicks`, and `boardAfter`

### T1C — Golden Fixture: `overflow-scenarios.json`
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md` (rule 3), `spec/engine.md` §3.3
- **Creates:** `spec/fixtures/overflow-scenarios.json`
- **Requirements (≥7 scenarios):**
  - Row with exactly 5 cards, 6th card triggers collection
  - Multiple overflows in one turn
  - Overflow after a rule-4 row pick in same turn
  - Overflow that changes which row a subsequent card goes to
  - Verify collected cards = the 5 existing cards (not the triggering card)
  - **10-player overflow cascade:** A turn with 10 simultaneous plays where multiple overflows occur in sequence, and later placements depend on board state modified by earlier overflows (e.g., overflow clears row A, a subsequent card that would have gone to row B now goes to row A instead)
- **Schema per scenario:**
  ```json
  {
    "id": "overflow-basic",
    "description": "6th card on row 0 triggers collection of 5 cards",
    "board": [[3, 12, 24, 55, 78], [40], [60], [90]],
    "plays": [{ "playerId": "p0", "card": 80 }],
    "expected": {
      "collected": { "p0": [3, 12, 24, 55, 78] },
      "boardAfter": [[80], [40], [60], [90]]
    }
  }
  ```
- **Acceptance:**
  - Each scenario's expected output is hand-derived from rules
  - The 10-player cascade scenario must show at least 2 overflows where the second overflow's target row was changed by the first overflow

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
    "board": [[10, 20], [30, 40, 50], [60], [70, 80, 90, 95]],
    "plays": [{ "playerId": "p0", "card": 2 }],
    "rowChoice": { "playerId": "p0", "rowIndex": 2 },
    "expected": {
      "collected": { "p0": [60] },
      "boardAfter": [[10, 20], [30, 40, 50], [2], [70, 80, 90, 95]]
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
      "scoresAfter": [{ "id": "p0", "score": 66 }, { "id": "p1", "score": 22 }],
      "gameOver": true,
      "winners": ["p1"]
    }
  }
  ```
  > **Arithmetic check:** cattleHeads(5)=2, cattleHeads(10)=3, cattleHeads(15)=1 → penalty=6 → 60+6=**66** (exact threshold).
- **Acceptance:**
  - All cattle-heads sums manually verified. Game-over logic matches rules.
  - Every sample scenario must include hand-checked cattle-head arithmetic; score examples may not rely on card-number sums.

### T1F — Golden Fixture: `full-game-traces.json`
- **Agent type:** `general-purpose`
- **Depends on:** T1G (reference model must exist to generate traces)
- **Inputs:** All spec files, `spec/rules/6-nimmt.md`, `test/reference/reference-model.ts`
- **Creates:** `spec/fixtures/full-game-traces.json`
- **Requirements (≥2 complete games):**
  - **Game 1:** 2 players, short game (few rounds) — minimum complexity, full trace
  - **Game 2:** **10 players**, multi-round game — exercises maximum player-count interactions, cascading overflows, and simultaneous must-pick-row events
  - **Generation method:** The agent picks seeds and player counts, then uses the reference model to compute each game step-by-step. The agent spot-checks key steps against the rules text for correctness but does NOT hand-author all intermediate states.
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
            "resolutions": [
              { "playerId": "p0", "card": 12, "rowIndex": 0, "causedOverflow": false },
              { "playerId": "p1", "card": 55, "rowIndex": 2, "causedOverflow": false }
            ],
            "rowPicks": [],
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
- **Critical constraints:**
  - The agent must play out each game step-by-step following the rules exactly. Every intermediate board state must be consistent with the previous state + the card placed. The trace must be a valid game under the rules — no shortcuts.
  - **No rule violations in sample traces.** Every card placement must be legal: a placed card's value must be strictly greater than the tail of the row it targets (rule 1). E.g., card 12 cannot be placed after row tail 17 — that violates rule 1 (12 < 17). Sample schemas are illustrative; agents must produce correct values.
- **Acceptance:**
  - A separate verification pass (in T1-VERIFY) replays the trace against the reference model.
  - Both sample traces must replay cleanly against the reference model — every intermediate state matches.

### T1G — Reference Model
- **Agent type:** `general-purpose`
- **Inputs:** `spec/rules/6-nimmt.md`, `spec/engine.md`, `spec/harness.md` §Layer 3
- **Creates:**
  - `test/reference/reference-model.ts` — ~200 lines, deliberately naive implementation
  - `test/reference/index.ts` — barrel export
  - `test/reference/prng-vectors.test.ts` — canonical PRNG known-answer tests
- **Requirements:**
  - Hardcoded lookup table for `cattleHeads()` — all 104 values, no computation
  - `determinePlacement()` — iterate all 4 rows, find eligible ones (tail < card), pick closest
  - `resolveOverflow()` — if row has 5 cards, collect them, start new row
  - `resolveTurn()` — sort plays ascending, resolve one-by-one, handle overflows and row picks
  - `scoreRound()` — sum cattleHeads of collected cards for each player
  - `isGameOver()` — any player score ≥ 66
  - `getWinners()` — player(s) with lowest total score
  - `dealRound()` — recollect all cards, shuffle with seed, deal 10/player + 4 to board
- **Canonical PRNG known-answer test vectors:**
  - **SHA-256 seed derivation:** For named seeds (e.g., `"test-seed-001"`, `"trace-seed-001"`), lock the derived 256-bit state bytes as hex literals
  - **xoshiro256\*\* output sequence:** For each locked seed state, lock the first 20 output values as decimal literals
  - **Fisher–Yates shuffled deck:** For each named seed, lock the full 104-card shuffled deck order
  - These vectors are committed as assertions in `test/reference/prng-vectors.test.ts` — any PRNG implementation must reproduce them exactly
- **Player-count verification:**
  - Reference model must be verified at **2, 5, and 10 players**
  - `dealRound()` verified: correct hand sizes (10 cards each), correct board (4 cards), correct deck remainder (104 − 10×N − 4 cards)
  - `resolveTurn()` verified: correct simultaneous resolution for 2, 5, and 10 plays
- **Style constraints:**
  - Flat imperative code, no abstractions, no classes
  - No imports from `src/` (completely independent)
  - Each function ≤30 lines
  - Inline comments referencing rule numbers from `spec/rules/6-nimmt.md`
  - Must use the same PRNG algorithm (xoshiro256**) and seed derivation (SHA-256) as specified in `spec/engine.md` §2.2 — otherwise differential testing won't work
- **Acceptance:**
  - Compiles with `npx tsc --noEmit`
  - Self-test: reference model can play a complete game to termination
  - PRNG known-answer test vectors pass (determinism is insufficient — must match locked oracle values)
  - Player-count tests pass for 2, 5, and 10 players

### T1H — Anti-Cheat ESLint Rules
- **Agent type:** `general-purpose`
- **Inputs:** `spec/harness.md` §Layer 6
- **Creates:**
  - `.eslintrc.cjs` update (or `eslint.config.js` if using flat config)
  - Custom ESLint rule or config restricting `src/engine/**`:
    - **Comprehensive I/O ban:** No imports of `fs`, `path`, `child_process`, `http`, `https`, `net`, `dgram`, `dns`, `tls`, `cluster`, `worker_threads`, `os`, or any other I/O, networking, subprocess, or environment-probing module
    - **`node:` prefix coverage:** Ban both bare (`fs`) and prefixed (`node:fs`) import forms for all banned modules
    - **`process.env` ban:** No direct `process.env` access (including `process.env.NODE_ENV`, `process.env.TEST`, etc.)
    - No string literals matching fixture file names (`cattle-heads`, `placement-scenarios`, etc.)
    - No references to test framework APIs (`describe`, `it`, `test`, `expect`, `jest`, `vitest`)
  - **Dependency-boundary rules** (non-blocking improvement):
    - `src/engine/**` cannot import from `src/sim/**` or `src/cli/**`
    - Enforced via `no-restricted-imports` or equivalent pattern-based rule
- **Acceptance:**
  - `npx eslint src/engine/` passes on clean engine stubs
  - Creating a test file in `src/engine/` that imports `fs` fails lint
  - Creating a file that imports `node:fs` in `src/engine/` fails lint
  - Creating a file referencing `describe` in `src/engine/` fails lint
  - Creating a file with `process.env.FOO` in `src/engine/` fails lint
  - Creating a file in `src/engine/` that imports from `src/sim/` or `src/cli/` fails lint

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
- **Player-count coverage assertions:**
  - Placement fixtures include 2-, 5-, and 10-simultaneous-play scenarios
  - Overflow fixtures include a 10-player cascading-overflow scenario
  - Full game traces include a 2-player game and a 10-player game
- **Runtime-sandbox verification:**
  - Fixture and trace tests must run with filesystem and network access blocked (Layer 6 sandbox)
  - Verify that test execution cannot read arbitrary files or make network requests
- **Acceptance:**
  - All fixture tests pass against the reference model
  - Full game traces replay correctly (every intermediate state matches)
  - Lint passes
  - No circular dependencies between test/ and src/
  - Player-count coverage: all required scenario counts verified present
  - Runtime sandbox: fixture tests confirmed isolated from filesystem and network
- **Freeze rule:** After T1-VERIFY passes, later tasks may **NOT** modify `spec/fixtures/**`, `test/reference/**`, or anti-cheat ESLint config except via an explicit harness-plan amendment. This protects the trust boundary established by this gate.
- **This is the critical trust gate.** If fixtures and reference model disagree, the harness is broken. Fix before proceeding.

### T1-CI — Early CI Skeleton + Harness Freeze
- **Agent type:** `general-purpose`
- **Depends on:** T1-VERIFY
- **Creates:** `.github/workflows/ci.yml` (skeleton CI pipeline)
- **Requirements:**
  - Initial CI pipeline stages: `npm ci` → `npx tsc --noEmit` → `npx eslint .` → `npx vitest run test/fixtures/` → `npx vitest run test/reference/`
  - **Path protection:** CI fails if `spec/fixtures/**`, `test/reference/**`, or `.eslintrc*` / `eslint.config.*` are modified by non-harness tasks. Implemented via a CI step that checks changed files against a protected-paths list and fails the job if protected files are touched without an explicit `harness-amendment` label or commit trailer.
  - **Runtime sandbox:** Fixture tests run with filesystem and network access blocked (e.g., `--no-file-system-access` flag, Node.js policy file, or equivalent isolation mechanism)
  - Pipeline runs on push to `main` and on all pull requests
- **Acceptance:**
  - CI runs green on current branch
  - Modifying a fixture file in a PR triggers CI failure (path protection works)
  - Fixture tests cannot access filesystem or network (sandbox enforced)

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
  - `src/engine/card.ts` — `cattleHeads()`, `createDeck(seed)`, `isValidCardNumber()`
  - `src/engine/prng.ts` — xoshiro256** implementation, SHA-256 seed derivation, Fisher-Yates shuffle
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - `cattleHeads()` fixture test passes (test/fixtures/cattle-heads.test.ts)
  - PRNG is deterministic: same seed → same output sequence
  - Deck generation: `createDeck(seed)` returns shuffled 104 cards, all unique
  - `createDeck(seed)` and `prng.ts` pass the canonical SHA-256, xoshiro256**, and Fisher–Yates known-answer vectors from T1G

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
  - Single-card placement fixture tests pass (test/fixtures/placement-scenarios)
  - Overflow fixture tests pass (test/fixtures/overflow-scenarios)
  - Must-pick-row fixture tests pass (test/fixtures/must-pick-row-scenarios)
  - Scope limited to single-card board logic only; simultaneous-play / player-count placement behavior is validated in T2D and T2-GATE

### T2D — Game Lifecycle
- **Agent type:** `general-purpose`
- **Depends on:** T2C
- **Inputs:** `spec/engine.md` §2.1, §3.2, §3.4
- **Creates:**
  - `src/engine/game.ts` — `createGame()`, `dealRound()`, `resolveTurn()`, `applyRowPick()`, `scoreRound()`, `isGameOver()`
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - **Initial contract:** `createGame()` returns `round=1`, `turn=0`, `phase="round-over"`, full 104-card deck, empty board, empty hands, empty collected piles, all scores 0
  - **Precondition tests:**
    - `createGame()` rejects player counts outside 2–10
    - `createGame()` rejects duplicate player IDs
    - `createGame()` rejects empty seed
    - `resolveTurn()` requires exactly one card per player
    - Each played card must be in that player's hand
    - `scoreRound()` throws unless `turn === 10`
    - Wrong-phase calls throw for `dealRound()`, `resolveTurn()`, `applyRowPick()`, `scoreRound()`
  - **Round-boundary tests:** `dealRound()` reclaims board + hands + collected → full 104-card deck before shuffle/deal
  - **Player-count deck-size assertions:** 2 players = 80 remaining, 10 players = 0 remaining, formula `100 - 10 × playerCount`
  - **`dealRound()` post-conditions:** resets collected, sets `turn=1`, phase → `"awaiting-cards"`
  - **Turn-10 post-condition:** after turn 10 resolution, phase → `"round-over"`
  - **`scoreRound()` semantics:** does NOT clear `collected`; `isGameOver()` checked only after scoring; `applyRowPick()` always returns `{ kind: "completed" }`
  - **Simultaneous-play resolution:** acceptance tests for 2, 5, and 10 simultaneous plays in `resolveTurn()`
  - **Stress scenario:** 10-player cascade/overflow-heavy turn acceptance
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
  - **Negative tests:** `toCardChoiceState()` throws for non-existent `playerId`; `toRowChoiceState()` throws unless phase is `"awaiting-row-pick"` AND `playerId` matches pending row-pick player
  - *(Non-blocking)* Assert every required `CardChoiceState` and `RowChoiceState` field explicitly
  - *(Non-blocking)* Resolve barrel/export sequencing — either move `strategy.ts` into Phase 2 or defer barrel update to Phase 3

### T2-GATE — Engine Verification Gate
- **Agent type:** `task`
- **Depends on:** T2E
- **Actions:**
  1. `npx vitest run test/fixtures/` — all fixture tests pass
  2. Create and run `test/invariant/invariants.test.ts` — run 100 random games at **2, 3, 5, 7, and 10** players, check the following invariants after every state transition:
     - total cards = 104
     - all cards unique (no duplicates across deck + board + hands + collected)
     - exactly 4 rows on the board
     - each row length 1–5
     - rows strictly increasing by tail card value
     - player count 2–10
     - hand-size formula correct (`10 - (turn - 1)` during play)
     - deck-size formula correct (`100 - 10 × playerCount` after deal, minus cards played)
     - non-negative and monotonically non-decreasing scores
     - unique player IDs
     - rule-4 (must-pick-row) triggers at most once per turn and only for the lowest card
     - same-seed replay is byte-identical
  3. Create and run `test/invariant/metamorphic.test.ts` — player rename, input order independence, seed determinism, serialisation round-trip; additionally: different seed ⇒ different game
  4. Create and run `test/invariant/immutability.test.ts` — engine operations return new state without mutating inputs
  5. Create and run `test/invariant/differential.test.ts` — generate 1000 random game states, run both reference model and engine, assert identical outputs
  6. `npx eslint src/engine/` — anti-cheat lint passes
- **Acceptance:** All tests pass. Zero fixture failures. Zero invariant violations. Zero differential mismatches.

### T2-REVIEW — Adversarial Engine Review *(optional checkpoint)*
- **Agent type:** `code-review`
- **Depends on:** T2-GATE
- **Does NOT block T3A** — T2-GATE feeds directly into T3A.
- **Actions:**
  1. Code review agent reads spec + implementation (not tests), flags potential discrepancies
  2. Any issues found are logged for later resolution; this is NOT the formal adversarial harness review
- **Note:** The authoritative adversarial review is T6-REVIEW, which runs after CI is green and must only emit failing tests. T2-REVIEW is a lightweight sanity check and may be skipped without blocking progress.

---

## Phase 3: Strategy Layer

### T3A — Strategy Interface + Random Baseline + Registry
- **Agent type:** `general-purpose`
- **Depends on:** T2-GATE (engine must pass verification gate first; T2-REVIEW is non-blocking)
- **Inputs:** `spec/strategies.md`
- **Creates:**
  - `src/engine/strategy.ts` — `Strategy` interface, `TurnResolution` type (if not already in types.ts)
  - `src/engine/strategies/random.ts` — `RandomStrategy` class implementing `Strategy`
  - `src/engine/strategies/index.ts` — strategy registry map
- **Requirements:**
  - `RandomStrategy.chooseCard()` uses seeded `rng` from `onGameStart()`, not `Math.random()`
  - `RandomStrategy.chooseRow()` picks row with fewest cattle heads (deterministic tiebreak: lowest row index)
  - Registry is a `ReadonlyMap<string, (params?: Record<string, unknown>) => Strategy>` for parameterized factory pattern; `SimConfig.players[].params` is passed through unchanged to the factory function
  - Each strategy instance receives an **independent PRNG stream** derived from `gameSeed + playerId` via `onGameStart()`
  - Illegal strategy output handling per spec: forfeit to lowest card / fewest-heads row
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - Random strategy produces valid moves for any legal game state (fuzz with 1000 random states)
  - Same seed → same strategy decisions
  - `Strategy` interface shape is exactly:
    - `onGameStart({ playerId, playerCount, rng })`
    - `onTurnResolved(resolution)`
    - `onRoundEnd(scores)`
  - `TurnResolution` shape contains at least: `turn`, `plays`, `resolutions`, `rowPicks`, `boardAfter`

### T3-TEST — Strategy Validation
- **Agent type:** `task`
- **Depends on:** T3A
- **Actions:**
  1. Create `test/unit/strategies/random.test.ts`
  2. Test: chooseCard always returns a card from hand
  3. Test: chooseRow always returns 0–3
  4. Test: deterministic with same seed
  5. Test: illegal output handling (mock strategy that returns invalid cards)
  6. Test: invalid row fallback — mock strategy returning out-of-range row index falls back to fewest-heads row
  7. Test: thrown `chooseCard()` — strategy that throws is forfeited to lowest card
  8. Test: thrown `chooseRow()` — strategy that throws is forfeited to fewest-heads row
  9. Run: `npx vitest run test/unit/strategies/`
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
  - Instantiates strategies through the **parameterized registry**: passes each player's `SimConfig.players[].params` into the factory function
  - Calls `onGameStart({ playerId, playerCount, rng })` with a **per-player derived RNG** (from `gameSeed + playerId`) once per game (not once per round)
  - Calls `onTurnResolved(resolution)` and `onRoundEnd(scores)` at correct times
  - Strategy errors (thrown or illegal output) are **logged** and result in forfeit, not crash
  - Returns complete `GameResult` with seed, rounds count, player results with rankings
- **Acceptance:**
  - A seeded game produces identical `GameResult` on repeated runs
  - Game terminates (no infinite loops)
  - Rankings are correct (lowest score = rank 1)
  - Player-count acceptance: validated at **2, 5, and 10** players
    - 2-player: game terminates within a reasonable number of rounds
    - 10-player: deck remainder = 0 cards dealt per round start (104 − 10 × 10 hand − 4 rows = 0)
  - `onGameStart()` fires exactly once per game, not once per round

### T4B — BatchRunner + Statistics
- **Agent type:** `general-purpose`
- **Depends on:** T4A
- **Inputs:** `spec/simulator.md` §5–7
- **Creates:**
  - `src/sim/batch.ts` — `BatchRunner.runBatch(config: SimConfig, games: number, seed: string): BatchResult`
  - `src/sim/stats.ts` — aggregation functions (win rate, avg/median/min/max/stddev)
  - `src/sim/index.ts` — barrel export
- **Requirements:**
  - Per-game seed derivation: `SHA256(batchSeed + '/' + gameIndex)`
  - Results pooled per strategy name (not per seat)
  - Win rate = wins / (gamesPlayed × playersWithThisStrategy)
  - Shared wins (tie at lowest score) count for all tied players
- **Acceptance:**
  - Batch of 100 games completes without error
  - Same batch seed → identical `BatchResult`
  - Statistics are mathematically correct (spot-check a few games manually)
  - Batch execution and aggregation spot-checked across **2, 5, and 10** player configs
  - `BatchResult` and `StrategyStats` fields verified field-by-field: `wins`, `losses`, `avgScore`, `medianScore`, `minScore`, `maxScore`, `stddevScore`, `winRate`

### T4-TEST — Simulator Integration + Statistical Smoke Tests
- **Agent type:** `task`
- **Depends on:** T4B
- **Actions:**
  1. Create `test/unit/sim/runner.test.ts` — seeded replay test, lifecycle hook invocation order
  2. Create `test/unit/sim/batch.test.ts` — batch determinism, aggregation correctness
  3. Create `test/smoke/statistical.test.ts` — parameterized across **2, 5, and 10** players (10,000 games each):
     - All games terminate
     - Average game length 1–10 rounds
     - No negative scores
     - Winner exists in every game
     - Win rate per seat roughly equal (χ² test, p > 0.01)
     - Deck remainder after deal = `104 − 10 × playerCount − 4` cards:
       - 2-player: remainder = 80
       - 5-player: remainder = 50
       - 10-player: remainder = 0 (heavy overflow / row-pick behavior expected)
     - Mean score per round per player within outlier bounds (e.g., between 1 and 15 cattle heads)
  4. Create `test/unit/sim/information-hiding.test.ts`:
     - `chooseCard()` runs before card reveal; strategy never sees same-turn opponent card choices
  5. Run: `npx vitest run test/unit/sim/ test/smoke/`
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
  - Plus: `recommend` (live play advisory, see [CLI](../spec/cli.md)) and `serve` (MCP server, see [MCP](../spec/mcp.md))
  - Global `--format` / `-f` option (table/json/csv, default: table)
  - Short aliases for all flags: `-s` (strategies), `-n` (games), `-S` (seed), `-f` (format), `-v` (verbose)
  - Exit codes per spec: 0 success, 1 invalid args, 2 runtime error
  - Structured-error contract when `--format json` — every CLI error is a JSON object with a `code` field. Defined error codes:
    - `INVALID_STRATEGY` — unknown strategy name (include `validValues` + "did you mean?" suggestion)
    - `INVALID_PLAYER_COUNT` — not in 2–10 range (include `validValues`)
    - `INVALID_SEED` — seed string fails validation
    - `INVALID_FORMAT` — format not in table/json/csv (include `validValues`)
    - `ENGINE_ERROR` — unexpected engine/runtime failure (include original error message)
  - Each structured error includes `validValues` where applicable and enough context for AI-assisted self-correction
  - Commander wiring must be explicit: each subcommand registered via `.command()`, help text verified in acceptance
- **Acceptance:**
  - `npx 6nimmt --help` shows all commands and short aliases
  - `npx 6nimmt simulate --help` shows all options with short aliases (`-s`, `-n`, `-S`, `-f`, `-v`)
  - Invalid arguments produce correct exit code, structured JSON error (when `--format json`), and human-readable message (otherwise)

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

### T5C — Commands (simulate, strategies, play, recommend, serve)
- **Agent type:** `general-purpose`
- **Depends on:** T5A, T5B
- **Inputs:** `spec/cli.md` §2, `spec/mcp.md` §7
- **Creates:**
  - `src/cli/commands/simulate.ts` — `--strategies` / `-s`, `--games` / `-n`, `--seed` / `-S`, `--format` / `-f`, `--verbose` / `-v`, `--dry-run`
  - `src/cli/commands/strategies.ts` — list registered strategies
  - `src/cli/commands/play.ts` — single game with turn-by-turn output
  - `src/cli/commands/recommend.ts` — stateless single-turn advisory (state via `--state`, `--state-file`, or stdin)
  - `src/cli/commands/serve.ts` — MCP server bootstrap (`--log-level`, `--max-sessions`); delegates to `src/mcp/`
- **Requirements:**
  - `--strategies` accepts both comma-separated and JSON array format
  - `simulate --games` defaults to **100** when omitted
  - `--dry-run` validates args and outputs resolved config without running
  - Strategy name validation with "did you mean?" suggestions
  - Player count validation (2–10)
  - `play` command outputs complete game log per spec JSON schema
  - `recommend` command: accepts `--state` or `--state-file` (mutually exclusive), `--strategy`, `--decision` (auto-detect), `--timeout`; outputs recommendation JSON with confidence and alternatives; returns structured errors `INVALID_STATE`, `STALE_STATE`, `INCOMPATIBLE_DECISION`
  - `serve` command: bootstraps MCP server on stdio, passes `--log-level` and `--max-sessions` to `src/mcp/server.ts`; logs to stderr, protocol on stdout
  - All eight structured error codes (`INVALID_STRATEGY`, `INVALID_PLAYER_COUNT`, `INVALID_SEED`, `INVALID_FORMAT`, `ENGINE_ERROR`, `INVALID_STATE`, `STALE_STATE`, `INCOMPATIBLE_DECISION`) are validated and serialized through the formatter pipeline
  - Each error includes `validValues` where applicable and AI-self-correction context
- **Acceptance:**
  - `npx 6nimmt simulate --strategies random,random,random,random --games 10 --seed test --format json` produces valid output
  - `npx 6nimmt strategies --format json` lists all strategies with a `usage` block containing:
    - `simulateExample` — a runnable command string
    - `playerCountRange: { min: 2, max: 10 }`
    - `strategyNamesCaseSensitive: true`
  - `npx 6nimmt play --strategies random,random --seed test --format json` outputs full game trace
  - `npx 6nimmt simulate --strategies nonexistent` produces `INVALID_STRATEGY` error with suggestions and `validValues`
  - `npx 6nimmt recommend --state '{"hand":[3,17],"board":[[5],[10],[20],[30]],"playerScores":[],"playerCount":2,"round":1,"turn":1,"turnHistory":[],"initialBoardCards":[5,10,20,30]}' --strategy random --format json` produces valid recommendation
  - `npx 6nimmt serve` starts MCP server on stdio (process stays alive, accepts MCP protocol messages)

### T5-TEST — CLI Tests
- **Agent type:** `task`
- **Depends on:** T5C
- **Actions:**
  1. Create `test/unit/cli/simulate.test.ts` — argument parsing, dry-run, output format
  2. Create `test/unit/cli/strategies.test.ts` — list output, full JSON schema including `usage.*`
  3. Create `test/unit/cli/play.test.ts` — full game output schema validation
  4. Create `test/unit/cli/errors.test.ts` — all eight structured error codes (`INVALID_STRATEGY`, `INVALID_PLAYER_COUNT`, `INVALID_SEED`, `INVALID_FORMAT`, `ENGINE_ERROR`, `INVALID_STATE`, `STALE_STATE`, `INCOMPATIBLE_DECISION`), "did you mean?" suggestions, `validValues` presence
  5. Create `test/unit/cli/aliases.test.ts` — short aliases (`-s`, `-n`, `-S`, `-f`, `-v`, `-d`, `-t`, `-l`) produce identical results to long flags
  6. Create `test/unit/cli/defaults.test.ts` — omitted `--games` defaults to 100
  7. Create `test/unit/cli/output-routing.test.ts` — JSON errors route to stdout when `--format json`, human-readable errors route to stderr otherwise
  8. Snapshot tests for table/json/csv output formats
  9. Create `test/unit/cli/recommend.test.ts` — state input (inline, file, stdin), decision auto-detect, timeout, state validation errors
  10. Run: `npx vitest run test/unit/cli/`
- **Acceptance:** All tests pass. Output schemas match spec. All eight error codes covered. Short aliases verified.

---

## Phase 5b: MCP Server

> Depends on T5-TEST (CLI must be working first — MCP shares the same engine and strategy registry).  
> MCP tasks can be parallelized within the phase.

### T5D — MCP Server Core + Stateless Tools
- **Agent type:** `general-purpose`
- **Depends on:** T5-TEST
- **Inputs:** `spec/mcp.md` §1–4, §6–7
- **Creates:**
  - `src/mcp/server.ts` — MCP server setup, stdio transport, tool registration
  - `src/mcp/tools/stateless.ts` — `list_strategies`, `validate_state`, `recommend_once` tools
  - `src/mcp/errors.ts` — domain error constructors (`DomainError` interface with `suggestedAction` field, all error codes from spec §4.2 including `MAX_SESSIONS_REACHED`)
  - `src/mcp/index.ts` — barrel export
- **Requirements:**
  - Uses MCP SDK for Node.js (`@modelcontextprotocol/sdk` or equivalent)
  - All tools use the same engine functions and strategy registry as CLI commands
  - `recommend_once` tool follows the same reconstruction contract as CLI `recommend`
  - `validate_state` uses the same `validateCardChoiceState()` / `validateRowChoiceState()` from engine
  - Domain errors returned as structured tool results (not MCP protocol errors) per spec §4; every `DomainError` includes `suggestedAction` field per spec §4.2
  - MCP protocol errors (InvalidParams, MethodNotFound) use MCP's built-in error mechanism
  - Logs to stderr; stdout reserved for MCP protocol
  - `server_info` response includes 12 tools in the `tools` array
- **Acceptance:**
  - `npx tsc --noEmit` passes
  - MCP server starts via `6nimmt serve` and responds to `server_info` tool call with 12 tools listed
  - `list_strategies` returns registered strategies
  - `validate_state` correctly validates/rejects game state JSON
  - `recommend_once` produces valid recommendations matching CLI `recommend` output; includes `strategyFallback: boolean` in response
  - Invalid tool parameters return MCP InvalidParams error
  - Unknown strategy in `recommend_once` returns structured `INVALID_STRATEGY` domain error with `suggestedAction: "none"`

### T5E — MCP Session Management + Event Tools
- **Agent type:** `general-purpose`
- **Depends on:** T5D
- **Inputs:** `spec/mcp.md` §3.5–3.11, §5
- **Creates:**
  - `src/mcp/session.ts` — session state machine, versioning, lifecycle (awaiting-round → in-round → awaiting-round → ended)
  - `src/mcp/tools/session-mgmt.ts` — `start_session`, `end_session`, `resync_session`, `session_status` tools
  - `src/mcp/tools/events.ts` — `round_started`, `turn_resolved`, `round_ended` tools
  - `src/mcp/tools/recommend.ts` — `session_recommend` tool
  - `src/mcp/drift.ts` — state comparison / drift detection between agent snapshot and shadow board; implements three-tier drift classification: consistent (exact match), minor (≤2 card differences → warning), major (hand size differs by >1 or >2 board cards differ → `STATE_MISMATCH`)
- **Requirements:**
  - Session state machine enforces phase transitions per spec §5.1 phase-tools matrix (all 4 phases × allowed/rejected tools)
  - Every mutating tool requires `expectedVersion` — rejects `VERSION_MISMATCH` if stale
  - Non-versioned tools (`session_recommend`, `session_status`, `end_session`) do not require `expectedVersion` and do not increment version
  - `session_status` returns current session phase, version, strategy, round/turn, and is read-only (no state mutation)
  - Duplicate events detected and returned as `DUPLICATE_EVENT` (idempotency)
  - `round_started` calls `onGameStart()` on first round; validates board and hand
  - `turn_resolved` calls `strategy.onTurnResolved()` with the provided resolution data; server maintains shadow board by applying resolutions
  - `round_ended` calls `strategy.onRoundEnd()` with cumulative scores (not per-round deltas)
  - `session_recommend` accepts `hand` and `board` from agent for drift detection; compares against shadow board; returns `stateConsistent` flag and `strategyFallback: boolean`
  - Major drift → `STATE_MISMATCH` error with `suggestedAction: "resync_session"`
  - `resync_session` resets strategy state, replays `turnHistory` as synthetic `onTurnResolved()` calls; increments version by exactly 1 regardless of turnHistory length
  - Maximum concurrent sessions enforced (`maxConcurrentSessions`, default 4); excess returns `MAX_SESSIONS_REACHED`
  - Sessions are ephemeral (in-memory only, lost on process restart)
  - Session expiry: 30 min inactivity timer; any valid tool call resets timer; expired sessions return `SESSION_EXPIRED`
  - Session cannot be reused after game-over — calling `round_started` after `game-over` returns `INVALID_PHASE`
- **Acceptance:**
  - Full session lifecycle: `start_session` → `round_started` → `session_recommend` → `turn_resolved` × 10 → `round_ended` → `end_session` completes without error
  - `session_status` returns current phase/version at every point in lifecycle without mutating state
  - Version mismatch detected and rejected
  - `resync_session` increments version by exactly 1 (not by turnHistory length)
  - Duplicate `turn_resolved` for same round/turn returns `DUPLICATE_EVENT`
  - Wrong-phase calls return `INVALID_PHASE` (e.g., `turn_resolved` before `round_started`, `round_started` after `game-over`)
  - Phase-tools matrix fully enforced: `round_ended` allowed in `in-round`, `session_recommend(decision:"card")` rejected in `awaiting-row-pick`
  - Drift detection: mismatched board in `session_recommend` triggers warning (minor) or `STATE_MISMATCH` (major) based on drift thresholds
  - `session_recommend` response includes `strategyFallback: boolean`
  - `resync_session` rebuilds strategy state (shadow board + strategy hooks) and subsequent `session_recommend` works
  - `end_session` invalidates session; further calls return `UNKNOWN_SESSION`
  - Session expiry: inactive session returns `SESSION_EXPIRED` after timeout
  - `MAX_SESSIONS_REACHED` returned when concurrent session limit exceeded

### T5F-TEST — MCP Server Tests
- **Agent type:** `task`
- **Depends on:** T5E
- **Actions:**
  1. Create `test/unit/mcp/stateless.test.ts` — `server_info` (12 tools listed), `list_strategies`, `validate_state`, `recommend_once` (including `strategyFallback` field) tool tests
  2. Create `test/unit/mcp/session.test.ts` — session state machine, phase transitions (full phase-tools matrix), version enforcement, session expiry
  3. Create `test/unit/mcp/events.test.ts` — `round_started`, `turn_resolved`, `round_ended` lifecycle hook invocation; shadow board computation
  4. Create `test/unit/mcp/session-recommend.test.ts` — drift detection (consistent/minor/major thresholds), `stateConsistent` flag, `strategyFallback` flag, `STATE_MISMATCH` error with `suggestedAction`
  5. Create `test/unit/mcp/resync.test.ts` — `resync_session` state rebuild, synthetic `onTurnResolved()` replay, version increments by exactly 1
  6. Create `test/unit/mcp/session-status.test.ts` — `session_status` returns correct phase/version/strategy, read-only (no version increment), works in all phases, `UNKNOWN_SESSION` for invalid ID
  7. Create `test/unit/mcp/errors.test.ts` — all domain error codes with `suggestedAction` field, `VERSION_MISMATCH`, `DUPLICATE_EVENT`, `INVALID_PHASE`, `UNKNOWN_SESSION`, `SESSION_EXPIRED`, `MAX_SESSIONS_REACHED`
  8. Create `test/unit/mcp/concurrent.test.ts` — multiple concurrent sessions, `maxConcurrentSessions` enforcement, `MAX_SESSIONS_REACHED` error code
  9. Run: `npx vitest run test/unit/mcp/`
- **Acceptance:** All tests pass. Session lifecycle fully exercised. Drift detection verified (three-tier thresholds). Error model complete (all codes + `suggestedAction`). All 12 tools tested.

---

## Phase 6: Integration & Final Verification

### T6-E2E — End-to-End Integration Test
- **Agent type:** `general-purpose`
- **Depends on:** T5F-TEST
- **Creates:**
  - `test/e2e/cli-e2e.test.ts` — run actual CLI commands against the **built executable artifact** (`dist/cli/index.js` or `npx 6nimmt`), not `src/cli/index.ts`
- **Tests:**
  - Full simulate pipeline: CLI → BatchRunner → GameRunner → Engine → output
  - Seeded replay: run same command twice, assert identical output
  - All format variations (json, table, csv)
  - Error scenarios (invalid strategies, bad player count)
  - Explicit player-count variations: **2 players**, **5 players**, and **10 players**
  - Performance: 1000 games completes within 30 seconds
  - `recommend` command: inline state, file state, stdin pipe — all produce valid recommendations
  - MCP server E2E: spawn `6nimmt serve`, send MCP tool calls via stdio, verify all 12 tools are registered and callable, verify full session lifecycle (start → rounds → recommend → end) including `session_status` and `recommend_once`
  - MCP drift recovery: trigger `STATE_MISMATCH`, call `resync_session`, verify subsequent `session_recommend` works
  - **CLI/MCP consistency:** Same game state passed to CLI `recommend` and MCP `recommend_once` produces identical recommendation output (same card, confidence, alternatives)
- **Acceptance:** All E2E tests pass against the built artifact.

### T6-CI — CI Expansion
- **Agent type:** `general-purpose`
- **Depends on:** T6-E2E
- **Note:** This task **extends** the CI skeleton created by T1-CI in Phase 1 — it does not create `.github/workflows/ci.yml` from scratch.
- **Modifies:**
  - `.github/workflows/ci.yml` — expand existing workflow with full pipeline steps
- **CI steps (in order, additive to T1-CI skeleton):**
  1. Install dependencies
  2. TypeScript compilation (`npx tsc --noEmit`)
  3. ESLint (including anti-cheat rules)
  4. Golden fixture tests (`npx vitest run test/fixtures/`)
  5. Unit tests (`npx vitest run test/unit/`)
  6. Invariant + metamorphic tests (`npx vitest run test/invariant/`)
  7. Generate hidden holdout fixtures (reference model + CI-secret seeds: `SHA256(CI_RUN_ID + '/holdout/' + index)`)
  8. Run holdout fixture tests (pass/fail only — no fixture content in logs or artifacts)
  9. Statistical smoke tests (`npx vitest run test/smoke/`)
  10. E2E tests (`npx vitest run test/e2e/`)
- **CI enforcement:**
  - Fixture and holdout tests run in a **runtime sandbox** (no filesystem or network access beyond test inputs)
  - Frozen harness artifacts — `spec/fixtures/**`, `test/reference/**`, `.eslintrc*` are treated as immutable; CI fails if these are modified after Phase 1
  - Parameterized suites execute at **2/3/5/7/10** player counts (unit/invariant) and **2/5/10** player counts (E2E)
- **Acceptance:** CI runs green on current branch. Sandbox enforcement verified. Player-count matrix passes.

### T6-REVIEW — Final Adversarial Review
- **Agent type:** `code-review`
- **Depends on:** T6-CI
- **Constraints (harness-compliant review):**
  - Review agent uses a **different prompt/model** than the implementation agents
  - Review agent reads **spec + implementation** but **NOT existing tests**
  - Review agent **cannot modify existing code** — it may only emit **new test files**
  - Review agent does **NOT fix code** — it only produces concrete failing test cases
- **Actions:**
  1. Read `spec/` and `src/` (excluding `test/`)
  2. Produce new test files exposing any spec-vs-implementation discrepancies
  3. Run the new test files against the unchanged implementation
  4. Report pass/fail results — failures indicate implementation bugs to be fixed in a separate task
- **Acceptance:** All emitted adversarial test cases are valid (they compile and run). Any failures are logged as issues for follow-up, not fixed in-place. CI remains green on existing tests.

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 33 |
| Fleet dispatches | 12 (Fleet 2 split into 2a + 2b) |
| Max parallelism (Fleet 2a) | 7 agents |
| Verification gates | 5 (T1-VERIFY, T2-GATE, T4-TEST, T5F-TEST, T6-CI) |
| Green checkpoints | 5 (CP-1 through CP-5) |
| Review checkpoints | 2 (T2-REVIEW, T6-REVIEW) |
| Intermediate regression | From Phase 3+: `test/fixtures/ + test/invariant/` at every gate |

### Milestone Definition: ✅ Engine + Simulation CLI + MCP Server E2E

The milestone is achieved when:
- `npx 6nimmt simulate --strategies random,random --games 100 --seed bench2 --format json` produces correct, deterministic output (2 players)
- `npx 6nimmt simulate --strategies random,random,random,random,random --games 1000 --seed benchmark --format json` produces correct, deterministic output (5 players)
- `npx 6nimmt simulate --strategies random,random,random,random,random,random,random,random,random,random --games 100 --seed bench10 --format json` produces correct, deterministic output (10 players)
- `npx 6nimmt play --strategies random,random --seed demo --format json` outputs a complete, rule-correct game trace
- `npx 6nimmt strategies` lists available strategies
- `npx 6nimmt recommend --state '<JSON>' --strategy random --format json` produces valid recommendation
- `6nimmt serve` starts MCP server; full session lifecycle (start → round_started → session_recommend → turn_resolved × 10 → round_ended → end_session) completes successfully via MCP protocol; `session_status` and `recommend_once` tools respond correctly
- MCP drift detection works: mismatched state triggers `STATE_MISMATCH` with `suggestedAction: "resync_session"`, `resync_session` recovers
- All 7 verification layers pass in CI
- No human has written or reviewed any code
