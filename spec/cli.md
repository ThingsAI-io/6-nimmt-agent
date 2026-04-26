# 6 Nimmt! — CLI Specification

> Part of the [Technical Specification](spec.md). See also: [Engine](engine.md) · [Strategies](strategies.md) · [Simulator](simulator.md)

---

## 1. Design Goals

- **Explicit long names.** Every option has a long `--kebab-case` name. No ambiguity.
- **Short aliases for humans.** Common options also have single-letter aliases.
- **Structured output.** `--format json` for machine consumption, `table` (default) for humans.
- **Composable.** Each subcommand does one thing.
- **AI-friendly.** Argument names are self-documenting — an AI agent can construct correct invocations without documentation lookup.

---

## 2. Commands

### `simulate` — Run a batch of games

```
6nimmt simulate \
  --strategies "bayesian,random,random,random,random" \
  --games 1000 \
  --seed "reproducible-seed-42" \
  --format json
```

| Argument            | Alias | Type    | Default   | Description                                           |
|---------------------|-------|---------|-----------|-------------------------------------------------------|
| `--strategies`      | `-s`  | string  | (required)| Comma-separated strategy names (spaces around commas are trimmed). Also accepts JSON array format: `'["bayesian","random"]'` (auto-detected if value starts with `[`). |
| `--games`           | `-n`  | number  | `100`     | Number of games to simulate                           |
| `--seed`            | `-S`  | string  | (auto)    | Base seed for reproducibility                         |
| `--format`          | `-f`  | string  | `table`   | Output format: `table`, `json`, `csv`                 |
| `--verbose`         | `-v`  | boolean | `false`   | Log each game result individually                     |
| `--dry-run`         |       | boolean | `false`   | Validate arguments and output resolved config without running |

### `strategies` — List available strategies

```
6nimmt strategies --format json
```

Output:

```json
{
  "meta": { "command": "strategies", "version": "1.0.0", "timestamp": "...", "durationMs": 5 },
  "strategies": [
    {
      "name": "random",
      "description": "Picks a card uniformly at random. Baseline strategy."
    },
    {
      "name": "bayesian",
      "description": "Maintains probability distributions over opponent hands."
    }
  ],
  "usage": {
    "simulateExample": "6nimmt simulate --strategies random,random,random,random --games 100",
    "playerCountRange": { "min": 2, "max": 10 },
    "strategyNamesCaseSensitive": true
  }
}
```

### `play` — Run and display a single game turn-by-turn

```
6nimmt play \
  --strategies "bayesian,random,random,random" \
  --seed "debug-seed" \
  --format json
```

Outputs full game log: every turn, every placement, every pickup. Useful for debugging strategies.

```json
{
  "meta": { "command": "play", "version": "1.0.0", "timestamp": "...", "durationMs": 42 },
  "seed": "debug-seed",
  "strategies": ["bayesian", "random", "random", "random"],
  "rounds": [
    {
      "round": 1,
      "initialBoard": [[3], [17], [42], [88]],
      "turns": [
        {
          "turn": 1,
          "plays": [
            { "seatIndex": 0, "strategy": "bayesian", "card": 55 },
            { "seatIndex": 1, "strategy": "random", "card": 12 }
          ],
          "placements": [
            { "card": 12, "rowIndex": 0, "overflow": false },
            { "card": 55, "rowIndex": 3, "overflow": true, "collectedCards": [88, 91, 95, 99, 100] }
          ],
          "rowPicks": []
        }
      ],
      "scores": [
        { "seatIndex": 0, "strategy": "bayesian", "roundPenalty": 24, "totalScore": 24 },
        { "seatIndex": 1, "strategy": "random", "roundPenalty": 5, "totalScore": 5 }
      ]
    }
  ],
  "finalResults": [
    { "seatIndex": 0, "strategy": "bayesian", "finalScore": 24, "rank": 2 },
    { "seatIndex": 1, "strategy": "random", "finalScore": 5, "rank": 1 }
  ]
}
```

---

## 3. JSON Output Schema (simulate)

```json
{
  "meta": {
    "command": "simulate",
    "version": "1.0.0",
    "timestamp": "2025-01-15T10:30:00Z",
    "durationMs": 1234
  },
  "gamesPlayed": 1000,
  "strategies": ["bayesian", "random", "random", "random", "random"],
  "seed": "reproducible-seed-42",
  "results": [
    {
      "strategy": "bayesian",
      "seatIndices": [0],
      "playerCount": 1,
      "wins": 620,
      "winRate": 0.62,
      "avgScore": 18.4,
      "medianScore": 15,
      "minScore": 2,
      "maxScore": 71,
      "scoreStdDev": 12.3
    },
    {
      "strategy": "random",
      "seatIndices": [1, 2, 3, 4],
      "playerCount": 4,
      "wins": 380,
      "winRate": 0.095,
      "avgScore": 34.7,
      "medianScore": 32,
      "minScore": 5,
      "maxScore": 89,
      "scoreStdDev": 18.1
    }
  ]
}
```

> `winRate` is per-player: `wins / (gamesPlayed × playerCount)`. When multiple seats share a strategy, all per-player results are pooled. See [Simulator aggregation semantics](simulator.md#7-aggregation-semantics).

---

## 4. Error Handling

### Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | Success |
| `1`  | Invalid arguments (bad strategy name, wrong player count, malformed input) |
| `2`  | Runtime error (engine failure, unexpected exception) |

### Structured Errors

When `--format json` is set, errors are output as JSON on stdout (not stderr):

```json
{
  "error": true,
  "code": "INVALID_STRATEGY",
  "message": "Unknown strategy 'bayesain'. Did you mean 'bayesian'?",
  "validValues": ["random", "bayesian"]
}
```

Error codes:
- `INVALID_STRATEGY` — strategy name not found in registry
- `INVALID_PLAYER_COUNT` — fewer than 2 or more than 10 strategies provided
- `INVALID_SEED` — seed format invalid
- `INVALID_FORMAT` — unknown output format requested
- `ENGINE_ERROR` — unexpected engine failure (includes stack trace in message)

**Design principle:** Errors include enough context for an AI agent to self-correct without a second round-trip. Include `validValues` where applicable.

---

## 5. Module Structure

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
