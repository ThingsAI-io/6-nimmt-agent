# Data Capture Specification

## Purpose

Capture full game logs from live multiplayer sessions (e.g., BGA) to build a dataset for:

1. **Replay** — re-run games offline with different strategies to measure what-if performance
2. **Modelling** — train opponent models from observed human play patterns
3. **Benchmarking** — compare strategy versions against the same real-game scenarios
4. **Debugging** — inspect decision quality after the fact

---

## What to Capture

### Per-Game Metadata

| Field | Type | Description |
|-------|------|-------------|
| `gameId` | string | Unique identifier (BGA game ID or UUID) |
| `source` | string | Platform (e.g., `"bga"`, `"local"`) |
| `timestamp` | ISO 8601 | When the game started |
| `playerCount` | number | 2–10 |
| `players` | Player[] | Player info (id, name, isUs, strategy used) |
| `finalScores` | Record<id, number> | End-of-game scores |
| `winner` | string | Player ID of winner |
| `totalRounds` | number | Rounds played |

### Per-Round Data

| Field | Type | Description |
|-------|------|-------------|
| `round` | number | Round number (1-based) |
| `initialBoard` | number[][] | The 4 starter cards |
| `dealtHand` | number[] | Our hand for this round |
| `turns` | Turn[] | All 10 turns |
| `roundScores` | Record<id, number> | Points collected this round per player |

### Per-Turn Data

| Field | Type | Description |
|-------|------|-------------|
| `turn` | number | Turn number (1–10) |
| `ourCard` | number | The card we played |
| `ourRecommendation` | number \| null | What the strategy recommended (null if no strategy active) |
| `plays` | { playerId, card }[] | All revealed cards |
| `resolutions` | Resolution[] | Placement results (row, overflow, collected) |
| `rowPicks` | RowPick[] | Any forced row picks |
| `boardBefore` | number[][] | Board state before resolution |
| `boardAfter` | number[][] | Board state after resolution |

### Per-Decision Context (optional, for model training)

| Field | Type | Description |
|-------|------|-------------|
| `hand` | number[] | Hand at decision time |
| `board` | number[][] | Board at decision time |
| `strategyUsed` | string | Strategy that made the recommendation |
| `confidence` | number \| null | Strategy's confidence in the pick |
| `alternatives` | { card, score }[] | Other options the strategy considered |
| `timeToDecide` | number | Milliseconds taken |

---

## Storage Format

### File-based (primary)

One JSON file per game, stored in a local `data/games/` directory:

```
data/
  games/
    2026-04-28_bga_12345678.json
    2026-04-28_bga_12345679.json
    ...
  index.json   # lightweight manifest
```

Each file is a self-contained `GameLog` object:

```typescript
interface GameLog {
  version: 1;
  metadata: GameMetadata;
  rounds: RoundLog[];
}
```

### Index File

Quick lookup without parsing every game file:

```typescript
interface GameIndex {
  games: {
    file: string;
    gameId: string;
    source: string;
    timestamp: string;
    playerCount: number;
    winner: string;
    ourStrategy: string | null;
    ourFinalScore: number;
    ourRank: number;
  }[];
}
```

---

## Capture Points

### During Live Play (via MCP agent)

The agent already calls `turn_resolved` and `round_ended` — we can hook into the session lifecycle:

1. **`round_started`** → log `initialBoard` + `dealtHand`
2. **`session_recommend`** → log decision context (hand, board, recommendation, alternatives)
3. **`turn_resolved`** → log full turn data (plays, resolutions, boardAfter)
4. **`round_ended`** → log round scores
5. **`end_session`** → finalize and write game file

### Post-Hoc (manual data entry)

For games played without the agent, allow importing from BGA replay URLs or manual JSON entry.

---

## Replay Engine

Given a `GameLog`, we can re-run the game with a different strategy:

```bash
npx tsx src/cli/index.ts replay --game data/games/2026-04-28_bga_12345678.json --strategy bayesian-simple
```

The replay engine:
1. Loads the game log
2. Replays each round with the real board and real opponent plays
3. Substitutes **our** card choice with the specified strategy's recommendation
4. Tracks what _would have happened_ (note: changing our play changes resolution order, which changes everything downstream)

### Counterfactual vs Fixed-Opponent Replay

| Mode | Description | Use Case |
|------|-------------|----------|
| **Fixed-opponent** | Opponents play exactly as logged; only our play changes | Fast, good for "what if I had played X instead" |
| **Counterfactual** | Re-simulate full resolution with our changed play | More accurate but requires full placement engine |

**Recommendation:** Start with fixed-opponent replay. It's simpler and the most common use case ("would bayesian have done better here?").

---

## Dataset Operations

### Filter & Query

```bash
# List all games where we lost
npx tsx src/cli/index.ts data list --filter "ourRank > 1"

# Show stats across all captured games
npx tsx src/cli/index.ts data stats

# Export turns where strategy disagreed with our play
npx tsx src/cli/index.ts data export-disagreements --strategy bayesian-simple
```

### Bulk Replay

```bash
# Replay all games with a strategy, output comparative stats
npx tsx src/cli/index.ts data bulk-replay --strategy bayesian-simple --format table
```

---

## Privacy & Data Handling

- **No storage of other players' real names** — use anonymized IDs (e.g., `opponent-1`, `opponent-2`)
- **Local storage only** — game data stays in `data/` directory, not committed to git
- **`.gitignore`** — `data/games/` is git-ignored; only `data/.gitkeep` is tracked
- **Optional anonymization** — strip BGA-specific IDs before sharing datasets

---

## Implementation Phases

### Phase 1: Capture Infrastructure
- Define `GameLog` TypeScript types
- Add capture hooks to MCP session lifecycle
- Write game files on `end_session`
- Basic `data list` CLI command

### Phase 2: Replay
- Fixed-opponent replay engine
- `replay` CLI command
- Comparative stats output (original vs strategy)

### Phase 3: Analysis
- Bulk replay across dataset
- Disagreement extraction (where strategy would have played differently)
- Per-player opponent modelling from observed plays

---

## Open Questions

1. **Capture granularity:** Should we log _every_ intermediate state, or just turn boundaries? Turn boundaries are sufficient for replay but intermediate states help debug strategy internals.

2. **BGA data extraction:** Can we reliably extract opponent plays from BGA's DOM/API, or do we need to infer from board state diffs? This depends on the Playwright integration.

3. **Dataset size requirements:** How many games do we need before opponent modelling becomes meaningful? Likely 50-100+ games against the same player pool.

4. **Versioning:** If we change the game engine (e.g., variant rules), old logs may become incompatible. The `version: 1` field handles this, but migration tooling may be needed.
