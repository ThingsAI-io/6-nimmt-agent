# Contributing

## Setup

```bash
git clone https://github.com/ThingsAI-io/6-nimmt-agent
cd 6-nimmt-agent
npm install
```

## Build, Test, Lint

```bash
npm test          # Vitest — runs all tests
npm run lint      # ESLint
npm run build     # TypeScript compilation
```

All three must pass before submitting a PR.

## Project Structure

```
src/
├── engine/          Pure game engine — rules, state, strategies
│   ├── strategies/  All strategy implementations
│   ├── game.ts      Game lifecycle (deal, play, resolve)
│   ├── card.ts      Card utilities (cattleHeads, placement)
│   └── types.ts     Core types (CardNumber, Board, GameState)
├── cli/             CLI commands (simulate, strategies, play)
├── sim/             Batch simulation runner
├── player/          Headless BGA player (Playwright)
└── mcp/             MCP server for AI agent integration

spec/                Technical specifications (normative — describes current behavior)
docs/                User-facing documentation (how-to guides)
test/                Vitest test suites
project/results/     Benchmark results and provenance data
scripts/             Utility scripts (prior table generation)
```

## Adding a Strategy

1. Create `src/engine/strategies/my-strategy.ts`
2. Implement the `Strategy` interface (see `src/engine/strategies/types.ts`)
3. Register it in `src/engine/strategies/index.ts`
4. Add a spec at `spec/strategies/my-strategy.md`
5. Add tests at `test/strategies/my-strategy.test.ts`
6. Document it in `docs/strategies.md`

The strategy interface:

```typescript
interface Strategy {
  readonly name: string;
  chooseCard(state: CardChoiceState): CardNumber;
  chooseRow(state: RowChoiceState): 0 | 1 | 2 | 3;

  // Optional lifecycle hooks
  onRoundStart?(info: { round: number; hand: CardNumber[]; board: Board }): void;
  onTurnResolved?(resolution: TurnResolution): void;
  onRoundEnd?(scores: { id: string; score: number }[]): void;
  getOptions?(): Record<string, unknown>;
}
```

Strategy factories accept an options object for tunable parameters:

```typescript
export function createMyStrategy(opts?: Record<string, unknown>): Strategy { ... }
```

## How Docs and Specs Stay in Sync

- **`spec/`** describes _what exists now_ (normative). Update specs when behavior changes.
- **`docs/`** explains _how to use it_ (practical guides). Update docs when user-facing behavior changes.
- Strategy names in docs must match the registry keys in `src/engine/strategies/index.ts`.
- CLI examples in docs must be runnable. Test them after changing.

## Strategy Options Syntax

Strategies support `key=val` options passed via CLI:

```bash
npx tsx src/cli/index.ts simulate --strategies mcs-prior:mcPerCard=200,timingWeight=0.5
```

Options are parsed by `parseStrategySpec()` in `src/engine/strategies/index.ts`.

## Code Style

- TypeScript strict mode
- ESLint enforced (run `npm run lint`)
- Prefer pure functions where possible
- Document non-obvious algorithms with inline comments
- Module-level docstrings for every strategy file

## Prior Table

The `mcs-prior` strategy uses a baked-in lookup table. To regenerate from training data:

```bash
npx tsx scripts/build-prior-table.ts
```

This reads game data from `project/data/` and writes `src/engine/strategies/prior-table.ts`.
