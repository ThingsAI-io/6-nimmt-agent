# Consolidated Plan Fixes
> Sources: 4 round-2 reviews + player-count spec changes (f2fb510)  
> Plan version: commit ee1a61c

## Blocking Fixes (must be applied before execution)

### T0 — Project Scaffold
- Change the `bin` requirement from `src/cli/index.ts` to the built executable artifact (for example `dist/cli/index.js`), and add acceptance that the published/packaged CLI entrypoint is executable via the built output, not raw TypeScript.

### T1A — Cattle Heads Fixture
- No changes needed.

### T1B — Placement Fixture
- Expand the task from single-card placement cases to also require turn-resolution scenarios with **2, 5, and 10 simultaneous plays**. Add schema/acceptance text requiring `plays`, ordered expected placements, and `boardAfter` for those multiplayer cases.

### T1C — Overflow Fixture
- Add an explicit **10-player overflow cascade** scenario where multiple overflows happen in one turn and later placements depend on earlier overflows.

### T1D — Must-Pick-Row Fixture
- No changes needed.

### T1E — Round Scoring Fixture
- Fix the sample "exact-66" example so the arithmetic is correct. Either:
  - change `playersBefore[0].score` from `60` to `59` and `scoresAfter[0].score` to `66`, or
  - keep `60 → 67` and rename the scenario so it is not labeled "exact-66".
- Add acceptance text: "Every sample scenario must include hand-checked cattle-head arithmetic; score examples may not rely on card-number sums."

### T1F — Full Game Traces Fixture
- Change **Game 2** from "4–5 players" to **10 players** to match the harness minimum.
- Replace the sample trace with a rule-valid one. In the current example, card `12` cannot be placed after row tail `17`; either lower the initial tail or change the played card.
- Add acceptance text that both sample traces themselves must replay cleanly against the reference model.

### T1G — Reference Model
- Add canonical PRNG oracle coverage to this task: require self-tests or locked vectors for:
  - SHA-256 seed derivation,
  - xoshiro256** output sequence,
  - Fisher–Yates shuffled deck order for named seeds.
  Determinism alone is insufficient.

### T1H — Anti-Cheat ESLint Rules
- Broaden the static ban from a short module list to **any I/O, networking, subprocess, or environment-probing access** inside `src/engine/**`, including `node:` imports and direct `process.env` usage, not just the currently listed modules.

### T1-VERIFY — Harness Verification Gate
- Add a freeze rule: after T1-VERIFY, later implementation tasks may not modify `spec/fixtures/**`, `test/reference/**`, or anti-cheat config except via an explicit harness-plan amendment.
- Add runtime-sandbox verification: fixture/trace tests must run with **filesystem and network access blocked**, matching harness Layer 6.

### T2A — Types, Card Module, PRNG
- Rename `createFullDeck()` to **`createDeck(seed)`** everywhere in task text, file list, acceptance, and public API.
- Strengthen acceptance so `createDeck(seed)` / `prng.ts` must pass the canonical SHA-256, xoshiro256**, and Fisher–Yates known-answer vectors created in T1G.

### T2B — Row Module
- No changes needed.

### T2C — Board Module
- No changes needed.

### T2D — Game Lifecycle
- Add explicit acceptance for the exact `createGame()` initial contract: `round=1`, `turn=0`, `phase="round-over"`, full 104-card deck, empty board, empty hands, empty collected piles, and all scores `0`.
- Expand precondition coverage to explicitly test:
  - `createGame()` rejects player counts outside 2–10,
  - duplicate player IDs,
  - empty seed,
  - `resolveTurn()` requires exactly one card per player,
  - each played card must be in that player's hand,
  - `scoreRound()` throws unless `turn === 10`,
  - wrong-phase calls for `dealRound()`, `resolveTurn()`, `applyRowPick()`, and `scoreRound()`.
- Add round-boundary tests requiring `dealRound()` to first reclaim **board + hands + collected** to a full 104-card deck before shuffle/deal.
- Add explicit deck-size assertions after deal for **2 players = 80**, **10 players = 0**, and the general formula `100 - 10 × playerCount`.
- Add explicit assertions that `dealRound()` resets all `collected` piles, sets `turn=1`, and sets `phase="awaiting-cards"`.
- Add explicit assertions that after turn 10 resolution the phase becomes `"round-over"`.
- Add explicit assertions that `scoreRound()` **does not clear `collected`**, `isGameOver()` is checked **only after scoring**, and `applyRowPick()` always returns `{ kind: "completed" }`.

### T2E — Visible State Projection + Barrel Export
- Add explicit negative tests that `toCardChoiceState()` throws when `playerId` does not exist, and `toRowChoiceState()` throws unless phase is `"awaiting-row-pick"` and `playerId` matches the pending row-pick player.

### T2-GATE — Engine Verification Gate
- Replace "etc." with a verbatim invariant checklist. Enumerate and test all required items explicitly:
  - total cards = 104,
  - all cards unique,
  - exactly 4 rows,
  - each row length 1–5,
  - rows strictly increasing,
  - player count 2–10,
  - hand-size formula,
  - deck-size formula,
  - non-negative/monotonic scores,
  - unique player IDs,
  - rule-4 triggers at most once per turn and only for the lowest card,
  - same-seed replay is byte-identical.
- Parameterize invariant runs at minimum **2, 3, 5, 7, and 10** players.
- Add metamorphic coverage for **different seed ⇒ different game**.
- Add immutability checks that engine operations return new state without mutating inputs.

### T2-REVIEW — Adversarial Engine Review
- Rework this task so it is **not** the formal harness adversarial review before simulator/CLI work. Either remove it as a phase gate or downgrade it to an optional checkpoint; the authoritative adversarial review must happen only after CI and must only emit failing tests.

### T3A — Strategy Interface + Random Baseline + Registry
- Change the registry/factory signature from `ReadonlyMap<string, () => Strategy>` to one that accepts params (for example `ReadonlyMap<string, (params?: Record<string, unknown>) => Strategy>`), and explicitly require that `SimConfig.players[].params` be passed through unchanged.
- Add a requirement that each strategy instance receives an **independent PRNG stream derived from `gameSeed + playerId`** via `onGameStart()`.

### T3-TEST — Strategy Validation
- No blocking changes needed.

### T4A — GameRunner
- Add explicit task text that GameRunner must instantiate strategies through the parameterized registry, pass each player's `params` into the factory, and call `onGameStart()` with `{ playerId, playerCount, rng }` using the per-player derived RNG.

### T4B — BatchRunner + Statistics
- No blocking changes needed.

### T4-TEST — Simulator Integration + Statistical Smoke Tests
- Replace the single "10,000 games with 5 random players" smoke test with parameterized runs at minimum **2, 5, and 10** players.
- Add player-count-specific assertions from updated specs:
  - 2-player games: large deck remainder and reasonable termination behavior,
  - 10-player games: zero deck remainder after deal and heavy interaction/overflow behavior,
  - all configs: deck remainder matches `100 - 10 × playerCount`.
- Add the missing statistical check for **mean score per round per player** with outlier detection/bounds.

### T5A — CLI Scaffold + Argument Parsing
- Add the required short aliases: `-s`, `-n`, `-S`, `-f`, `-v`, and require that they appear in help output.
- Replace the vague "structured JSON errors" requirement with an explicit structured-error contract covering `INVALID_STRATEGY`, `INVALID_PLAYER_COUNT`, `INVALID_SEED`, `INVALID_FORMAT`, and `ENGINE_ERROR`.

### T5B — Output Formatters
- No changes needed.

### T5C — Commands (simulate, strategies, play)
- State explicitly that `simulate --games` defaults to **100** when omitted.
- Expand `strategies --format json` acceptance to require the exact `usage` block:
  - `simulateExample`,
  - `playerCountRange: { min: 2, max: 10 }`,
  - `strategyNamesCaseSensitive: true`.
- Add validation/serialization requirements for `INVALID_SEED`, `INVALID_FORMAT`, and structured `ENGINE_ERROR`, not just invalid strategy/player-count handling.

### T5-TEST — CLI Tests
- Add tests for:
  - short aliases,
  - omitted `--games` defaulting to 100,
  - full `strategies` JSON schema including `usage.*`,
  - all five structured CLI error codes.

### T6-E2E — End-to-End Integration Test
- Run E2E against the **built executable artifact** / packaged bin, not `src/cli/index.ts`, so the plan verifies real `npx 6nimmt` behavior.

### T6-CI — CI Pipeline
- Split or move this work so a CI skeleton exists in **Phase 1** before implementation; T6-CI should expand an existing pipeline, not create CI for the first time.
- Add CI enforcement that fixture and holdout tests run in a runtime sandbox with **no fs/network access**.
- Add CI protection that `spec/fixtures/**`, `test/reference/**`, and anti-cheat config are treated as frozen harness artifacts after T1-VERIFY.

### T6-REVIEW — Final Adversarial Review
- Replace the current review flow with a harness-compliant one: use a **different prompt/model**, read **spec + implementation but not tests**, emit **only concrete failing test cases**, run those tests, and do **not** let the review task itself fix code.

## Non-Blocking Fixes (recommended improvements)

### By task

#### T1H — Anti-Cheat ESLint Rules
- Add dependency-boundary lint rules so `src/engine/**` cannot import from `src/sim/**` or `src/cli/**`.

#### T2E — Visible State Projection + Barrel Export
- Strengthen acceptance to assert every required `CardChoiceState` and `RowChoiceState` field, not just "no hidden info" plus the three row-pick-only fields.
- Resolve the barrel/export sequencing issue: either move `strategy.ts` into Phase 2 or defer the final engine barrel update until Phase 3.

#### T3A — Strategy Interface + Random Baseline + Registry
- Pin the full `Strategy` and `TurnResolution` shapes in acceptance text:
  - `onGameStart({ playerId, playerCount, rng })`
  - `onTurnResolved(resolution)`
  - `onRoundEnd(scores)`
  - `TurnResolution.turn`, `plays`, `rowPickups`, `boardAfter`.

#### T3-TEST — Strategy Validation
- Add dedicated tests for invalid row fallback and for thrown `chooseCard()` / `chooseRow()` paths.

#### T4A — GameRunner
- Make "strategy throws / illegal output is **logged**" explicit, not just "forfeit, not crash."
- Make "`onGameStart()` fires once per game, not once per round" explicit.

#### T4B — BatchRunner + Statistics
- Tighten acceptance so `BatchResult` and `StrategyStats` fields are checked field-by-field, not just spot-checked informally.

#### T4-TEST — Simulator Integration + Statistical Smoke Tests
- Add an explicit information-hiding test that `chooseCard()` runs before reveal and never sees same-turn opponent card choices.

#### T5A — CLI Scaffold + Argument Parsing
- Make commander wiring/help-text verification explicit: aliases registered, defaults shown in help, and long names remain self-documenting.

#### T5C — Commands (simulate, strategies, play)
- Require `validValues` and other AI-self-correction context where applicable in structured errors.

#### T5-TEST — CLI Tests
- Add stdout/stderr routing tests: JSON errors go to **stdout** when `--format json`, not stderr.

## New Tasks Needed
- **New Phase-1 task: Early CI Skeleton + Harness Freeze**
  - Create the initial GitHub Actions workflow before implementation begins.
  - Enforce the "protected harness artifacts" rule after T1-VERIFY.
  - This can be added as a new Phase-1 task or by splitting T6-CI into an early skeleton task plus a later expansion task.

## Summary
- Total blocking fixes: 38
- Total non-blocking fixes: 11
- New tasks needed: 1
- Tasks with no changes: [T1A, T1D, T2B, T2C, T5B]
