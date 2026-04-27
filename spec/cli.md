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

### `recommend` — Get a strategy recommendation for a game state

```
6nimmt recommend \
  --state '<CardChoiceState or RowChoiceState JSON>' \
  --strategy bayesian \
  --decision card \
  --format json
```

| Argument        | Alias | Type   | Default    | Description                                                                                                                              |
|-----------------|-------|--------|------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `--state`       |       | string | (required) | JSON string of CardChoiceState or RowChoiceState. Mutually exclusive with `--state-file`.                                                |
| `--state-file`  |       | string |            | Path to JSON file containing state. Use `-` for stdin. Mutually exclusive with `--state`.                                                |
| `--strategy`    | `-s`  | string | (required) | Strategy to use for recommendation                                                                                                       |
| `--decision`    | `-d`  | string | (auto)     | Decision type: `card` or `row`. Auto-detected from state shape if omitted (presence of `triggeringCard` field → row).                    |
| `--timeout`     | `-t`  | number | `10000`    | Max computation time in milliseconds. Returns best-so-far if exceeded.                                                                   |
| `--format`      | `-f`  | string | `json`     | Output format (default `json` for machine consumption)                                                                                   |

Output for card decision:

```json
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 42, "timedOut": false },
  "decision": "card",
  "strategy": "bayesian",
  "recommendation": {
    "card": 42,
    "confidence": 0.85,
    "alternatives": [
      { "card": 38, "confidence": 0.10 },
      { "card": 91, "confidence": 0.05 }
    ]
  },
  "stateValid": true,
  "stateWarnings": []
}
```

Output for row decision:

```json
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 12, "timedOut": false },
  "decision": "row",
  "strategy": "bayesian",
  "recommendation": {
    "rowIndex": 2,
    "confidence": 0.92,
    "alternatives": [
      { "rowIndex": 0, "confidence": 0.05 },
      { "rowIndex": 1, "confidence": 0.02 },
      { "rowIndex": 3, "confidence": 0.01 }
    ]
  },
  "stateValid": true,
  "stateWarnings": []
}
```

> **State validation:** `stateValid` and `stateWarnings` allow the recommend command to report issues with the input state without hard-failing. For example, a warning might note that a card in the hand also appears on the board.

> **Confidence & alternatives:** These fields are strategy-dependent. The `random` strategy returns `confidence: null` and no alternatives. More sophisticated strategies populate these to aid debugging and transparency.

> **Timeout behaviour:** When `timedOut: true` appears in the response, the strategy hit the `--timeout` limit and returned its best recommendation so far. The result may be suboptimal compared to a fully-computed recommendation.

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
            { "seatIndex": 0, "playerId": "player-0", "strategy": "bayesian", "card": 55 },
            { "seatIndex": 1, "playerId": "player-1", "strategy": "random", "card": 12 }
          ],
          "placements": [
            { "card": 12, "rowIndex": 0, "overflow": false },
            { "card": 55, "rowIndex": 3, "overflow": true, "collectedCards": [88, 91, 95, 99, 100] }
          ],
          "rowPicks": []
        }
      ],
      "scores": [
        { "seatIndex": 0, "playerId": "player-0", "strategy": "bayesian", "roundPenalty": 24, "totalScore": 24 },
        { "seatIndex": 1, "playerId": "player-1", "strategy": "random", "roundPenalty": 5, "totalScore": 5 }
      ]
    }
  ],
  "finalResults": [
    { "seatIndex": 0, "playerId": "player-0", "strategy": "bayesian", "finalScore": 24, "rank": 2 },
    { "seatIndex": 1, "playerId": "player-1", "strategy": "random", "finalScore": 5, "rank": 1 }
  ]
}
```

> **`seatIndex` vs `playerId`:** `seatIndex` is the 0-based table position (stable across rounds). `playerId` is a string identifier (e.g., `"player-0"`) useful for external integrations that track players by ID rather than position. Both always appear together in play output.

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
      "playerIds": ["player-0"],
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
      "playerIds": ["player-1", "player-2", "player-3", "player-4"],
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
- `INVALID_STATE` — state JSON fails validation (missing required fields, inconsistent data, card numbers out of range)
- `STALE_STATE` — state appears internally inconsistent (e.g., hand size doesn't match expected for turn number, cards in hand also on board)
- `INCOMPATIBLE_DECISION` — `--decision row` used with a CardChoiceState (no `triggeringCard`), or vice versa

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
    recommend.ts     — recommend command handler
  formatters/
    table.ts         — Human-readable table output
    json.ts          — Structured JSON output
    csv.ts           — CSV output for spreadsheet import
```

The CLI is a thin presentation layer. All game logic lives in the [engine](engine.md); all orchestration lives in the [simulator](simulator.md).

---

## 6. State Input

The `recommend` command accepts game state via two mutually exclusive mechanisms:

- **`--state '<JSON>'`** — Inline JSON string. Convenient for small states and scripted invocations. Subject to shell argument length limits.
- **`--state-file path/to/state.json`** — Read state from a file. Avoids shell argument length limits for large states.
- **`--state-file -`** — Read state from stdin. Enables piping, e.g.:

  ```bash
  echo '{"hand":[3,17,42],"board":[[5],[10],[20],[30]]}' | 6nimmt recommend --state-file - --strategy random
  ```

**Constraints:**
- Exactly one of `--state` or `--state-file` must be provided. Supplying both (or neither) is an error.
- When using `--state-file -`, the CLI reads stdin until EOF before processing.
