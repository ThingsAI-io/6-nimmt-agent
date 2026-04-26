# 6 Nimmt! — Technical Specification

> See [intent.md](intent.md) for overall project vision and [rules/6-nimmt.md](rules/6-nimmt.md) for game rules.

## Specification Documents

| Document | Scope |
|----------|-------|
| [Engine](engine.md) | Data model, game lifecycle, invariants, core API |
| [Strategies](strategies.md) | Strategy interface, random baseline, registration |
| [Simulator](simulator.md) | GameRunner, BatchRunner, statistics |
| [CLI](cli.md) | Commands, arguments, output formats |
| [Harness](harness.md) | Agent-driven dev process, verification layers, trust architecture |

---

## Design Principles

- **SOLID throughout.** Single responsibility per module, open for extension (new strategies) without modifying core engine, depend on abstractions (Strategy interface) not implementations.
- **Separation of concerns.** The engine knows nothing about the CLI, the simulator, or the agent. The simulator knows nothing about the CLI's presentation. Each layer has a clear boundary.
- **Pure functions where possible.** Card penalty calculation, placement resolution, and row overflow are all pure and stateless — easy to test, easy to reason about.
- **Immutable game state.** Every engine operation returns a new state; no mutations. This makes replay, logging, and debugging trivial.
- **Deterministic reproducibility.** The engine and simulator accept an optional random seed so that any game can be replayed exactly.
- **AI-friendly CLI.** Argument names are explicit, unambiguous, and self-documenting. Output formats include both human-readable and structured JSON.

---

## Project Structure

```
src/
  engine/
    card.ts
    row.ts
    board.ts
    game.ts
    visible-state.ts
    strategy.ts
    types.ts
    index.ts
  engine/strategies/
    random.ts
    index.ts
  sim/
    runner.ts
    batch.ts
    stats.ts
    types.ts
    index.ts
  cli/
    index.ts
    commands/
      simulate.ts
      strategies.ts
      play.ts
    formatters/
      table.ts
      json.ts
      csv.ts
```

---

## Testing Strategy

- **Engine unit tests:** Every pure function tested exhaustively — card penalties, placement logic, overflow, row picks. Property-based tests for invariants (e.g. "total cattle heads in deck always equals 104-card sum").
- **Strategy tests:** Random strategy produces valid moves for any legal game state.
- **Simulator integration tests:** A seeded game produces identical results across runs.
- **CLI tests:** Snapshot tests for output formats.

---

## MVP Scope (First Deliverable)

1. ✅ Game rules spec (`spec/rules/6-nimmt.md`)
2. Engine data model and core placement/scoring logic → [engine.md](engine.md)
3. Random strategy → [strategies.md](strategies.md)
4. Simulator (single game + batch) → [simulator.md](simulator.md)
5. CLI with `simulate`, `strategies`, and `play` commands → [cli.md](cli.md)
6. Unit and integration tests

Out of scope for MVP: Bayesian strategy, neural net, BGA agent, browser extension.

