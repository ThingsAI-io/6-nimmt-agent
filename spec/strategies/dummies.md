# Dummy Strategies: `dummy-min` and `dummy-max`

## Purpose

These are deterministic baseline strategies used for benchmarking. They apply the simplest possible card selection logic with no intelligence, making them useful as lower-bound references when evaluating smarter strategies.

## `dummy-min`

**Card choice:** Always plays the lowest-valued card in hand.

**Row choice:** Picks the row with the fewest total cattle heads (same heuristic as `random`).

**Rationale:** Low cards are more likely to be lower than all row tails, forcing row picks. This strategy should perform poorly and accumulate penalties quickly.

## `dummy-max`

**Card choice:** Always plays the highest-valued card in hand.

**Row choice:** Picks the row with the fewest total cattle heads (same heuristic as `random`).

**Rationale:** High cards are placed last in resolution order (ascending), meaning they see all other players' cards placed first. This can sometimes avoid triggering the 6th-card overflow, but also means they always land at the end of rows, pushing them closer to 5 cards. Performance relative to `dummy-min` is an empirical question.

## Shared Behaviour

- No state tracking (`onTurnResolved` / `onRoundEnd` are no-ops).
- No RNG dependency — fully deterministic.
- Player count range: 2–10 (same as `random`).
- Row choice heuristic: fewest cattle heads (greedy penalty avoidance).

## Expected Use

```bash
# Compare dummies against each other and random
npx tsx src/cli/main.ts simulate -s dummy-min,dummy-max,random,random -n 1000

# Use as benchmarks for smarter strategies
npx tsx src/cli/main.ts simulate -s bayesian,dummy-min,dummy-max,random -n 1000
```
