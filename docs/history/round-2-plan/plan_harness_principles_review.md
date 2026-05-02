# Plan Review: Harness & Design Principles Alignment
> Reviewed against: spec/harness.md, spec/spec.md, spec/intent.md
> Plan version: commit ee1a61c

## Harness Layer Checklist

| Layer | Plan coverage | Gaps |
|---|---|---|
| 1. Golden fixtures | T1A–T1F cover all 6 fixture families; T1-VERIFY replays against reference model. | T1F requires 2-player + 4–5 player traces, but harness §5 requires **2-player and 10-player**. T1F sample trace is rule-invalid. T1E sample scoring math is wrong. |
| 2. Hidden holdout fixtures | T6-CI steps 7–8 cover CI-time generation. | Not in early harness phase; arrives late in Phase 6 instead of Phase 1. |
| 3. Reference model | T1G includes major functions; T2-GATE adds differential testing. | Acceptance doesn't explicitly cover tie/all-players-≥66 winner handling or test-only isolation. |
| 4. Invariant & metamorphic tests | T2-GATE creates suites. | Plan lists subset with "etc." — missing explicit coverage for all 11 invariants and "different seed ⇒ different game" metamorphic test. |
| 5. Statistical smoke tests | T4-TEST covers most checks. | Missing mean-score-per-round-per-player bounds / outlier detection. |
| 6. Anti-cheating | T1H covers static lint; T2-GATE runs ESLint. | **No runtime sandboxing** for fixture tests (no fs/network access). Static ban list narrower than "any I/O module." |
| 7. Adversarial review | T2-REVIEW and T6-REVIEW. | Not aligned: review should be after automated verification. No "different prompt/model" guarantee. T6-REVIEW lets reviewer fix code (weakens independence). |

## Design Principles Checklist

| Principle | How plan enforces it | Gaps |
|---|---|---|
| SOLID | Module split is good; registry supports extension. | No guardrail preventing strategy work from leaking into core engine modules. |
| Separation of concerns | Directories match spec; engine/sim/CLI are separate tasks. | No dependency-boundary enforcement (lint/import rules for engine↛sim↛CLI). |
| Pure functions | Anti-cheat bans I/O in engine. | No explicit purity checks beyond import bans; side-effect-free not enforced. |
| **Immutable game state** | Replay tests help indirectly. | **No test that engine operations return new state without mutating input.** |
| Deterministic reproducibility | PRNG task, seeded replay, batch determinism. | Need explicit byte-identical replay check and different-seed divergence check. |
| AI-friendly CLI | T5A/T5C/T5-TEST cover args, help, errors, snapshots. | Solid. No major gap. |

## Gaps Found

1. **[Blocking] Workflow doesn't match harness §3 / §5.**
   Harness requires CI pipeline as Phase 1 deliverable. Plan delays CI to Phase 6 and hidden holdouts to Phase 6.

2. **[Blocking] Protected harness artifacts not frozen from implementation.**
   Harness §4: `spec/fixtures/**`, `test/reference/**`, anti-cheat rules not modifiable by impl agents. Plan creates them early but doesn't prohibit later editing.

3. **[Blocking] Layer 4 coverage incomplete.**
   T2-GATE uses "etc." instead of enumerating all invariants. Missing metamorphic "different seed ⇒ different game."

4. **[Blocking] Layer 5 coverage incomplete.**
   T4-TEST omits mean-score-per-round-per-player bounds / outlier detection.

5. **[Blocking] Layer 6 runtime sandboxing missing.**
   Harness requires fixture tests to run with no fs/network access. Plan only covers static lint.

6. **[Blocking] T1F trace requirements don't match harness minimum.**
   Plan asks for 4–5 player trace; harness requires **10-player** trace.

7. **[Blocking] Plan examples contradict game rules.**
   T1E scoring math wrong. T1F sample trace has impossible placements.

8. **[Blocking] Adversarial review underspecified and misplaced.**
   No different-model/prompt guarantee. T6-REVIEW lets reviewer fix code (not independent).

9. **[Blocking] Immutable game state not verified.**
   Spec requires immutable state; no test asserts inputs unchanged after engine operations.

10. **[Non-Blocking] Separation-of-concerns enforcement is structural only.**
    No module-boundary lint rules to prevent engine↔sim↔CLI coupling.

## Recommendations

1. **Move CI pipeline skeleton to Phase 1** so all 9 MVH deliverables exist before implementation.
2. **Add explicit protected-path rules** — after T1-VERIFY, impl tasks may not modify `spec/fixtures/**`, `test/reference/**`, or anti-cheat config.
3. **Expand T2-GATE** to list every invariant verbatim from harness §2 — no "etc."
4. **Expand T4-TEST** with mean-score-per-round bounds and outlier detection.
5. **Add runtime sandboxing** to fixture/holdout test execution in CI.
6. **Fix T1F** to require 2-player + 10-player traces per harness §5.
7. **Fix T1E and T1F examples** — correct scoring math and impossible trace placements.
8. **Tighten adversarial review** — different prompt/model, reads spec+impl not tests, outputs only test cases, does NOT fix code.
9. **Add immutability tests** — assert input state/board/rows unchanged after every engine operation.
10. **Add dependency-boundary lint rules** — `src/engine/**` cannot import from `src/sim/**` or `src/cli/**`.
