# 6 Nimmt! — CLI Specification

> Part of the [Technical Specification](spec.md). See also: [Engine](engine.md) · [Strategies](strategies.md) · [Simulator](simulator.md)

---

## 1. Design Goals

- **Explicit long names.** Every option has a long `--kebab-case` name. No ambiguity.
- **Short aliases for humans.** Common options also have single-letter aliases.
- **Structured output.** `--output-format json` for machine consumption, `table` (default) for humans.
- **Composable.** Each subcommand does one thing.
- **AI-friendly.** Argument names are self-documenting — an AI agent can construct correct invocations without documentation lookup.

---

## 2. Commands

### `simulate` — Run a batch of games

```
6nimmt simulate \
  --players "bayesian,random,random,random,random" \
  --games 1000 \
  --seed "reproducible-seed-42" \
  --output-format json
```

| Argument            | Alias | Type    | Default   | Description                                           |
|---------------------|-------|---------|-----------|-------------------------------------------------------|
| `--players`         | `-p`  | string  | (required)| Comma-separated strategy names, one per player seat   |
| `--games`           | `-n`  | number  | `100`     | Number of games to simulate                           |
| `--seed`            | `-s`  | string  | (auto)    | Base seed for reproducibility                         |
| `--output-format`   | `-f`  | string  | `table`   | Output format: `table`, `json`, `csv`                 |
| `--verbose`         | `-v`  | boolean | `false`   | Log each game result individually                     |

### `strategies` — List available strategies

```
6nimmt strategies --output-format json
```

Outputs all registered [strategy](strategies.md) names with descriptions.

### `play` — Run and display a single game turn-by-turn

```
6nimmt play \
  --players "bayesian,random,random,random" \
  --seed "debug-seed" \
  --output-format json
```

Outputs full game log: every turn, every placement, every pickup. Useful for debugging strategies.

---

## 3. JSON Output Schema (simulate)

```json
{
  "gamesPlayed": 1000,
  "players": ["bayesian", "random", "random", "random", "random"],
  "seed": "reproducible-seed-42",
  "results": {
    "bayesian": {
      "wins": 620,
      "winRate": 0.62,
      "avgScore": 18.4,
      "medianScore": 15,
      "minScore": 2,
      "maxScore": 71,
      "scoreStdDev": 12.3
    },
    "random": {
      "wins": 380,
      "winRate": 0.095,
      "avgScore": 34.7,
      "medianScore": 32,
      "minScore": 5,
      "maxScore": 89,
      "scoreStdDev": 18.1
    }
  }
}
```

---

## 4. Module Structure

```
src/cli/
  index.ts           — Entry point, command registration
  commands/
    simulate.ts      — simulate command handler
    strategies.ts    — strategies command handler
    play.ts          — play command handler
  formatters/
    table.ts         — Human-readable table output
    json.ts          — Structured JSON output
    csv.ts           — CSV output for spreadsheet import
```

The CLI is a thin presentation layer. All game logic lives in the [engine](engine.md); all orchestration lives in the [simulator](simulator.md).
