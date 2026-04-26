# 6 Nimmt! — Agent-Driven Development & Testing Harness

> Part of the [Technical Specification](spec.md). This document defines how code is written, verified, and trusted in a fully agent-driven development process — no human writes or reviews code.

---

## 1. The Trust Problem

When AI agents write both code and tests, there is a systemic risk: the agent can hold the same misconception in both places. A test asserting `cattleHeads(55) === 5` and an implementation returning `5` would both be wrong (should be `7`), but they'd pass together.

This document specifies a multi-layered verification harness designed to make it **structurally difficult** for agent-written code to be plausible-but-wrong.

### Core Principle

> No single verification layer is sufficient. Correctness confidence comes from **independent, diverse checks that are hard to simultaneously satisfy with incorrect code.**

---

## 2. Verification Layers

### Layer 1: Golden Test Fixtures (Locked, Spec-Derived)

**What:** Pre-computed test scenarios in `spec/fixtures/`, derived directly from the game rules during the spec phase — *before any implementation exists*. These are the ground truth.

**Files:**

| Fixture | Content |
|---------|---------|
| `cattle-heads.json` | All 104 cards with their correct cattle head values |
| `placement-scenarios.json` | ~20 board states + card → expected placement result. Must include: closest-tail selection, all 4 rows eligible, only 1 row eligible. Must cover turn resolutions with **2, 5, and 10 simultaneous card plays** to exercise different interaction densities. |
| `overflow-scenarios.json` | Scenarios where the 6th card triggers row collection. Must include: multiple overflows in one turn, overflow after a rule-4 row pick in same turn. Must include a **10-player turn** where many overflows cascade. |
| `must-pick-row-scenarios.json` | Scenarios where a card is lower than all row tails. Must include: choosing 1-card row, choosing 5-card row, board state changes affecting later placements in same turn. |
| `round-scoring-scenarios.json` | End-of-round scoring, game-over threshold (exact 66, all players ≥66, ties) |
| `full-game-traces.json` | 2–3 complete games played out move-by-move with every intermediate state |

**Rules:**
- Fixtures are **immutable** once committed. Implementation agents cannot modify them.
- Fixture tests are a separate test suite that imports the engine and runs it against fixture data.
- Implementation must pass **all** fixture tests. No exceptions, no skips.

**Why it works:** The agent implementing the engine did not write the fixtures. Even if the same agent class produced both, they are written at different times with different prompts and frozen before implementation begins.

### Layer 2: Hidden Holdout Fixtures

**What:** A second set of fixtures that are **not checked into the repository**. They are generated or injected at CI time and never visible to the implementing agent.

**Mechanism:**
- A CI step generates additional test scenarios (random board states, random cards) using the reference model (Layer 3).
- These are written to a temp directory and the fixture test runner loads them alongside the committed fixtures.
- The implementing agent never sees these inputs/outputs and cannot optimise for them.

**Why it works:** Even if an agent reverse-engineers the committed fixtures, it cannot anticipate hidden ones. This is the primary defence against open-book gaming.

### Layer 3: Reference Model (Trusted Oracle)

**What:** A small, intentionally simple, obviously-correct implementation of the core game rules — used **only in tests**, never in production.

**Scope:** The reference model covers:
- `cattleHeads()` — a lookup table (not computed, just a hardcoded map of all 104 values)
- `determinePlacement()` — a brute-force implementation that iterates all rows
- `resolveOverflow()` — trivial 5-card collection (rule 3)
- Full turn resolution (sort cards, place one-by-one, handle overflows and row picks)
- `scoreRound()` — sum collected cattle heads into cumulative scores
- `isGameOver()` — check if any player has score ≥ 66
- Winner determination — player(s) with lowest total score (handles ties and all-players-≥66)

**Properties:**
- Written in a deliberately naive style — no optimisation, no abstraction, just flat imperative logic.
- Small enough (~200 lines) to be auditable by an agent or human in one pass.
- Lives in `test/reference/` and is flagged as a test-only dependency.

**Usage:**
- **Differential testing:** Generate thousands of random game states, run both the reference model and the real engine, assert identical outputs.
- **Hidden fixture generation:** The reference model produces the holdout fixtures for Layer 2.

**Why it works:** The reference model is trivially correct because it's trivially simple. The real engine must agree with it on every input. This is the strongest single verification technique for game logic.

### Layer 4: Invariant & Metamorphic Property Tests

**What:** Tests that verify structural properties and behavioural symmetries, not specific outputs.

**Invariant tests** (must hold after every engine operation, tested at **all valid player counts 2–10**):
- Total cards across all locations (board + hands + collected + deck) = 104
- All card numbers are unique across all locations (no duplicates)
- Board has **exactly 4 rows**
- Each row has 1–5 cards, with **strictly increasing card values** within each row
- Player count is 2–10
- Hand size = 10 − (turn − 1) at each turn start
- At round start (after deal), deck size = 100 − 10 × playerCount
- Scores are non-negative and monotonically increasing across rounds
- Sum of cattleHeads for all 104 cards = 171
- A seeded game produces byte-identical results on replay
- Rule 4 (must-pick-row) triggers at most **once per turn**, and only for the lowest card

Invariant tests must be parameterized and run for at minimum: **2, 3, 5, 7, 10** players.

**Metamorphic tests** (relational properties):
- **Player rename:** Renaming all player IDs should produce structurally identical game traces (only IDs change).
- **Input order independence:** Reordering the `playedCards` array passed to `resolveTurn()` must not change the result (the engine sorts by card value internally).
- **Seed determinism:** Same seed → same game. Different seed → (almost certainly) different game.
- **State serialisation round-trip:** `JSON.parse(JSON.stringify(state))` fed back to the engine must behave identically.

**Why it works:** These constrain the *shape* of correct behaviour. An engine that gets placement wrong but preserves card counts would fail differential testing (Layer 3). An engine that preserves card counts and gets placement right but introduces non-determinism would fail metamorphic tests.

### Layer 5: Statistical Smoke Tests

**What:** Run large batches of games and verify aggregate properties.

**Checks (10,000 games per configuration, various seeds):**

Player-count configurations to test (minimum):
- **2 players** — minimum, 80-card deck remainder, fewest interactions per turn
- **5 players** — mid-range, 50-card deck remainder
- **10 players** — maximum, deck fully exhausted (0 remainder), maximum interactions per turn

All checks must pass for **every** player-count configuration:
- All games terminate (no infinite loops; hard timeout at 1000 rounds)
- Average game length is within reasonable bounds per player count (more players → shorter games due to more penalties per round)
- No player finishes with a negative score
- Every game has exactly one or more winners (the player(s) with the lowest total score). Note: it is valid for ALL players to have ≥66; the winner is still the one with the fewest cattle heads.
- Win rate per seat index is roughly equal (χ² test, p > 0.01 — no seat bias with random strategy)
- Mean score per round per player falls within reasonable bounds (no games with zero penalties or extreme outliers)

**Player-count-specific checks:**
- 10 players: deck has exactly 0 cards after deal (10×10 + 4 = 104)
- 2 players: deck has exactly 80 cards after deal (2×10 + 4 = 24)
- All player counts: deck size after deal = 100 − 10 × playerCount

**Why it works:** These catch crashes, infinite loops, and gross logical errors. They are **not** evidence of rule correctness — treat them as robustness checks only.

### Layer 6: Anti-Cheating Constraints

**What:** Static and runtime checks that prevent the implementing agent from gaming the test suite.

**Static analysis (enforced in CI):**
- Engine source files (`src/engine/**`) must **not** import `fs`, `path`, `process.env`, or any I/O module.
- Engine source must **not** contain string literals matching fixture file names or test identifiers.
- Engine source must **not** reference `describe`, `it`, `test`, `expect`, `jest`, `vitest`, or any test framework API.
- No conditional logic based on `NODE_ENV`, `process.env.TEST`, or similar.

**Runtime checks:**
- Fixture tests run the engine in a sandboxed context (no filesystem access, no network).
- Reference model differential tests generate inputs at runtime — not from files the agent could have read.

**Why it works:** These block the most common cheat vectors: reading fixture files, detecting test environments, and hardcoding known answers.

### Layer 7: Adversarial Review Agent

**What:** After implementation passes all automated checks, a separate review agent (different prompt, ideally different model) performs an adversarial code review.

**The review agent's mandate:**
- Read the spec and the implementation, but **not** the tests.
- Produce **concrete failing test cases** (not prose observations) for any discrepancy found.
- Specifically look for: hardcoded values, skipped edge cases, dead code paths, logic that doesn't match the rules, subtle off-by-one errors in row indexing.
- Output is a set of new test cases. If any fail, implementation is rejected.

**Why it works:** A second agent with a different prompt and task framing is unlikely to share the same blind spots. By requiring concrete test cases (not just opinions), the review is falsifiable.

---

## 3. Development Workflow

```
┌─────────────────────────────────────────────────┐
│  Phase 1: Spec & Fixtures (DONE BEFORE CODE)    │
│  • Game rules ✅                                 │
│  • Engine/strategy/simulator/CLI specs ✅         │
│  • Golden fixtures (spec/fixtures/)              │
│  • Reference model (test/reference/)             │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 2: Implementation                         │
│  • Agent writes engine code                      │
│  • Agent writes unit tests (additive to          │
│    fixtures, not replacing them)                  │
│  • Agent writes sim/CLI code                     │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 3: Automated Verification (CI)            │
│  1. Golden fixture tests (Layer 1)               │
│  2. Hidden holdout fixture tests (Layer 2)       │
│  3. Reference model differential tests (Layer 3) │
│  4. Invariant & metamorphic tests (Layer 4)      │
│  5. Statistical smoke tests (Layer 5)            │
│  6. Anti-cheating static analysis (Layer 6)      │
│  7. Mutation testing (Stryker, target >85%)      │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 4: Adversarial Review (Layer 7)           │
│  • Different agent reviews code vs spec          │
│  • Produces new test cases                       │
│  • Implementation must pass new tests            │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 5: Merge                                  │
│  • All layers green → auto-merge                 │
│  • Any layer red → reject, agent iterates        │
└─────────────────────────────────────────────────┘
```

---

## 4. What Gets Built When

| Phase | Deliverable | Who | Modifiable by impl agent? |
|-------|-------------|-----|---------------------------|
| Spec | `spec/fixtures/*.json` | Spec agent | ❌ No |
| Spec | `test/reference/` | Spec agent | ❌ No |
| Spec | Anti-cheat lint rules | Spec agent | ❌ No |
| Impl | `src/engine/**` | Impl agent | ✅ Yes |
| Impl | `test/unit/**` | Impl agent | ✅ Yes |
| CI | Hidden holdout generation | CI pipeline | ❌ No (generated at runtime) |
| CI | All test suites | CI pipeline | ❌ No (runs automatically) |
| Review | New test cases | Review agent | N/A (additive) |

---

## 5. Minimum Viable Harness (Phase 1 Deliverables)

Before any implementation work begins, the following must exist:

1. **`spec/fixtures/cattle-heads.json`** — all 104 card → cattle head mappings (with sentinel checks for 55, 50, 100, 5, 11)
2. **`spec/fixtures/placement-scenarios.json`** — ≥20 placement test cases
3. **`spec/fixtures/overflow-scenarios.json`** — ≥5 overflow test cases (including multi-overflow turns)
4. **`spec/fixtures/must-pick-row-scenarios.json`** — ≥5 forced row-pick cases (including 1-card and 5-card row picks)
5. **`spec/fixtures/round-scoring-scenarios.json`** — ≥5 scoring/game-over boundary cases (exact 66, all ≥66, ties)
6. **`spec/fixtures/full-game-traces.json`** — ≥2 complete game traces (2-player and 10-player)
7. **`test/reference/`** — reference model implementation (~200 lines)
8. **Anti-cheat ESLint rules** — no I/O imports in engine, no test framework references
9. **CI pipeline** — runs all verification layers

This is the "test harness before code" principle. The harness is the product's first deliverable, not the engine.
