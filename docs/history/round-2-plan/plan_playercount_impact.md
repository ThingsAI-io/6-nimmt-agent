# Plan Impact: Player-Count Spec Changes
> Spec version: commit f2fb510

## Impacted Tasks

### T1B — Golden Fixture: `placement-scenarios.json`
- **Affected:** yes
- **Current state:** Task only defines single-card placement scenarios (`board` + `card`).
- **What needs to change:** Update the fixture/task schema and acceptance criteria so placement fixtures also cover **turn-resolution scenarios with 2, 5, and 10 simultaneous plays**, not just isolated placement decisions. Acceptance should explicitly require those player-count cases.
- **Severity:** **wrong** — the current task shape cannot represent the newly required simultaneous-play cases.

### T1C — Golden Fixture: `overflow-scenarios.json`
- **Affected:** yes
- **Current state:** Requires multi-overflow and post-row-pick overflow scenarios, but not a specific high-player-count case.
- **What needs to change:** Add an explicit requirement and acceptance check for a **10-player turn with cascading overflows**.
- **Severity:** **incomplete**

### T1F — Golden Fixture: `full-game-traces.json`
- **Affected:** yes
- **Current state:** Requires a 2-player trace and a 4–5-player trace.
- **What needs to change:** Replace the 4–5-player trace requirement with a **10-player full trace** (or add one explicitly). The current plan misses the max-player extreme now called out by the specs.
- **Severity:** **wrong**

### T1G — Reference Model
- **Affected:** yes
- **Current state:** Reference model is required to play a full game, but acceptance does not force coverage at representative player counts.
- **What needs to change:** Add acceptance that the reference model is verified at minimum for **2, 5, and 10 players**, especially `dealRound()` deck remainder behavior and high-density turn resolution.
- **Severity:** **incomplete**

### T1-VERIFY — Harness Verification Gate
- **Affected:** yes
- **Current state:** Verifies fixtures against the reference model, but does not check required player-count coverage.
- **What needs to change:** Add explicit coverage assertions that:
  - placement fixtures include **2/5/10 simultaneous-play** cases,
  - overflow fixtures include a **10-player cascading-overflow** case,
  - harness/player-count requirements are enforced rather than assumed.
- **Severity:** **incomplete**

### T2C — Board Module (Placement Logic)
- **Affected:** yes
- **Current state:** Acceptance says placement/overflow/must-pick fixtures pass at the board-module stage.
- **What needs to change:** Re-scope acceptance so **single-card board logic** stays in T2C, while **simultaneous-play/player-count placement behavior** is validated in T2D/T2-GATE via turn-resolution tests. Otherwise the task boundary no longer matches the fixture requirements.
- **Severity:** **wrong**

### T2D — Game Lifecycle
- **Affected:** yes
- **Current state:** Acceptance covers scoring, traces, and phase validation, but not explicit player-count extremes.
- **What needs to change:** Add acceptance for:
  - `dealRound()` deck sizes at **2, 5, 10** players,
  - `resolveTurn()` handling of **2/5/10 simultaneous plays**,
  - **10-player cascade/overflow-heavy** turns.
- **Severity:** **incomplete**

### T2-GATE — Engine Verification Gate
- **Affected:** yes
- **Current state:** Invariant tests run "100 random games," but player-count parameterization is not specified.
- **What needs to change:** Update actions/acceptance so:
  - invariant tests are parameterized for at least **2, 3, 5, 7, 10** players,
  - engine verification explicitly covers **2, 5, 10** for deck-size and turn-density behavior,
  - smoke/differential checks do not silently stay 5-player-only.
- **Severity:** **wrong**

### T4A — GameRunner
- **Affected:** yes
- **Current state:** Acceptance is generic (determinism, termination, rankings).
- **What needs to change:** Add explicit acceptance that `GameRunner` is validated at **2, 5, and 10 players**, including:
  - 2-player reasonable termination,
  - 10-player zero-deck-remainder round starts.
- **Severity:** **incomplete**

### T4B — BatchRunner + Statistics
- **Affected:** yes
- **Current state:** Acceptance only checks a 100-game batch generically.
- **What needs to change:** Add a note/acceptance that batch execution and aggregation are spot-checked across **2, 5, and 10 player** configs so nothing assumes a fixed player count or fixed seat count.
- **Severity:** **note**

### T4-TEST — Simulator Integration + Statistical Smoke Tests
- **Affected:** yes
- **Current state:** Smoke test is only **10,000 games with 5 random players**.
- **What needs to change:** Replace with smoke/integration coverage at minimum:
  - **2 players**
  - **5 players**
  - **10 players**
  
  Also add player-count-specific checks:
  - deal remainder = **80** for 2 players,
  - deal remainder = **0** for 10 players,
  - general formula `100 - 10 × playerCount`,
  - bounds that are evaluated **per configuration**, not one shared 5-player expectation.
- **Severity:** **wrong**

### T6-E2E — End-to-End Integration Test
- **Affected:** yes
- **Current state:** E2E tests are generic.
- **What needs to change:** Add explicit end-to-end runs for **2, 5, and 10 players** so the CLI→simulator→engine pipeline is exercised at the required player-count extremes and midpoint.
- **Severity:** **incomplete**

### T6-CI — CI Pipeline
- **Affected:** yes
- **Current state:** CI runs invariant and smoke suites, but the task does not say those suites must run the new player-count matrix.
- **What needs to change:** Add a note that CI must execute the updated parameterized suites so Layer 4 and Layer 5 actually run the required **2/3/5/7/10** and **2/5/10** configurations.
- **Severity:** **note**

## Unimpacted Tasks

- **T0**
- **T1A**
- **T1D**
- **T1E**
- **T1H**
- **T2A**
- **T2B**
- **T2E**
- **T2-REVIEW**
- **T3A**
- **T3-TEST**
- **T5A**
- **T5B**
- **T5C**
- **T6-REVIEW**

## Summary

- **Impacted tasks:** 13
- **Blocking / task-text currently wrong:** 5  
  - T1B, T1F, T2C, T2-GATE, T4-TEST
- **Non-blocking / incomplete or note:** 8  
  - T1C, T1G, T1-VERIFY, T2D, T4A, T4B, T6-E2E, T6-CI

Primary risk: the current plan still concentrates player-count coverage in too few places and leaves some task boundaries/specs anchored to older **single-card** or **5-player-only** assumptions.
