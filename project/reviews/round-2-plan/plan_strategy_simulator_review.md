# Plan Review: Strategy & Simulator Specification Alignment
> Reviewed against: spec/strategies.md, spec/simulator.md
> Plan version: commit ee1a61c

## Coverage Matrix

| Spec element | Plan task(s) | Coverage | Notes |
|---|---|---:|---|
| `Strategy.chooseCard` | T3A, T4A, T3-TEST | Covered | Interface + runner loop + tests exist. |
| `Strategy.chooseRow` | T3A, T4A, T3-TEST | Covered | Interface + row-pick loop + tests exist. |
| `Strategy.onGameStart` | T4A, T4-TEST | Partial | Hook usage planned, but T3A does not explicitly require the hook signature. |
| `Strategy.onTurnResolved` | T4A, T4-TEST | Partial | Hook call timing planned, but interface shape not pinned in T3A. |
| `Strategy.onRoundEnd` | T4A, T4-TEST | Partial | Same issue as above. |
| `TurnResolution` type | T3A | Partial | Type named, but required fields (`turn`, `plays`, `rowPickups`, `boardAfter`) not listed. |
| Information-hiding invariant | T2E, T4A | Partial | Implied by visible-state and loop, but no explicit test for this invariant. |
| Illegal card → forfeit lowest card | T3A, T3-TEST | Covered | Explicitly called out. |
| Illegal row index → fewest-heads row | T3A | Partial | Mentioned in requirements, but no dedicated test. |
| Strategy throws → caught, logged, forfeit | T4A | Partial | "Forfeit, not crash" covered; logging not specified/tested. |
| Random uses seeded `rng` from `onGameStart` | T3A, T3-TEST | Covered | Explicitly stated. |
| Random must not use `Math.random` | T3A | Covered | Explicitly stated. |
| Random `chooseRow` = fewest cattle heads, lowest index tiebreak | T3A | Covered | Explicitly stated. |
| Strategy registry `ReadonlyMap<string, () => Strategy>` | T3A | Covered | Explicitly stated. |
| Per-player independent PRNG stream from `gameSeed + playerId` | — | **Missing** | No task requires per-player stream derivation. |
| Strategies without `onGameStart` must be deterministic | — | **Missing** | No task or test covers this rule. |
| `SimConfig.players[].params` | T4A | **Partial** | Types planned, but no task threads params into strategy construction. |
| `GameResult` fields | T4A | Covered | seed, rounds, playerResults required. |
| `PlayerResult` fields | T4A | Covered | id, strategy, finalScore, rank. |
| `BatchResult` / `StrategyStats` | T4B | Partial | Exists, but field-level acceptance not explicit. |
| Exact `GameRunner` loop | T4A, T4-TEST | Partial | "Follow spec exactly" good, but edge conditions not individually asserted. |
| Lifecycle hook call order | T4-TEST | Covered | Explicit runner test planned. |
| `onGameStart` first round only | T4A, T4-TEST | Partial | Likely intended, but not called out as acceptance criterion. |
| Batch runner: N games, same config | T4B | Covered | Explicitly planned. |
| Per-game seed derivation | T4B | Covered | Explicitly planned. |
| Results pooled per strategy name | T4B | Covered | Explicitly planned. |
| Wins count ties | T4B | Covered | Explicitly planned. |
| `winRate` formula | T4B | Covered | Explicitly planned. |

## Gaps Found

1. **[Blocking] Per-player PRNG stream requirement is missing.**
   Strategy randomness will not match spec §6 if all players share one stream or if the stream is not derived from `gameSeed + playerId`. Breaks reproducibility and invalidates strategy comparisons.

2. **[Blocking] `SimConfig.params` is not wired through the plan.**
   spec/simulator.md §3 says params are passed to the factory, but the plan only specifies `ReadonlyMap<string, () => Strategy>`. Parameterized strategies cannot be instantiated.

3. **[Non-Blocking] Illegal-output handling is under-tested.**
   Plan tests invalid card output, but not invalid row index or thrown exceptions in both decision points.

4. **[Non-Blocking] Logging requirement for strategy failures is not planned.**
   Spec requires thrown errors to be caught **and logged**. Plan only guarantees "forfeit, not crash."

5. **[Non-Blocking] Full `Strategy` and `TurnResolution` shapes not pinned in acceptance.**
   T3A names the interface but doesn't enumerate all required hook methods or `TurnResolution` fields.

6. **[Non-Blocking] Information-hiding invariant is only implicit.**
   No test that `chooseCard()` runs before reveal and never sees same-turn opponent choices.

7. **[Suggestion] `onGameStart` "first round only" should be explicit.**
   Dedicated assertion that `onGameStart` fires exactly once per game, not once per round.

8. **[Suggestion] Type-level simulator deliverables need tighter acceptance.**
   `SimConfig`, `BatchResult`, `StrategyStats` need field-level enforcement, not just "types planned."

## Recommendations

- Add explicit **PRNG derivation** subtask: per-player RNG derived from `gameSeed + playerId`, with reproducibility and independence tests.
- Add explicit **strategy construction** subtask: reconcile `SimConfig.params` with registry factory signature.
- Strengthen **T3A acceptance**: enumerate all interface members and `TurnResolution` fields.
- Strengthen **T3-TEST / T4-TEST**: invalid row fallback, thrown chooseCard/chooseRow, logging, onGameStart once-per-game, choose-before-reveal.
- Make **CLI integration** explicit: simulate/play must resolve strategies through the same registry.
