# Round 4 Review — Internal Consistency

> Reviewer focus: Cross-document consistency after MCP server spec addition

## 🔴 BLOCKING

### 1. `Board` JSON shape contradicts across engine vs CLI/MCP

- **engine.md §1.3:** Serialized Board is `{ "rows": [[...], ...] }` — stated as "the only valid representation"
- **mcp.md §3.6/3.7/3.9/3.10:** All use `number[][]` (bare arrays, no `rows` wrapper)
- **cli.md §6:** stdin example also uses `"board":[[5],[10],[20],[30]]`

**Fix:** Standardize on one representation across all external APIs.

### 2. MCP `turn_resolved` does not match `TurnResolution`

- **strategies.md §1:** `TurnResolution = { turn, plays, rowPickups, boardAfter: Board }`
- **mcp.md §3.7:** `turn_resolved` uses `{ plays, placements, boardAfter: number[][] }`

`placements` ≠ `rowPickups`. Server cannot pass MCP payload directly to `onTurnResolved()`.

**Fix:** Align `turn_resolved` with `TurnResolution` shape, or define an explicit translation layer.

### 3. `resolvedCardsThisRound` is too weak for reconstruction

- **engine.md §1.5/1.6:** Only stores `{ playerId, card, turn }[]`
- **strategies.md §7.1:** Claims this enables synthetic `onTurnResolved()` replay
- **mcp.md §3.10:** `resync_session` uses same reconstruction

But `TurnResolution` needs `rowPickups` and `boardAfter` — not derivable from card-only history.

**Fix:** Expand history to include per-turn board state and row-pick data, or weaken reconstruction guarantee.

## 🟡 IMPORTANT

### 4. CLI/MCP error semantics not aligned for `recommend`

- **cli.md §4:** TIMEOUT is a normal response with `timedOut: true`
- **mcp.md §4.2:** `TIMEOUT` is a domain error (`ok: false`)

Agent needs different recovery logic for the "same" operation.

**Fix:** Define shared recommend error contract or explicit translation table.

### 5. `intent.md` describes wrong live-play boundary

- **intent.md:** Says BGA skill maps DOM → `GameState`, engine exposes `recommend(state, hand, strategy): Move`
- **engine.md §1.5:** Full `GameState` is simulator-only; live play uses `CardChoiceState`/`RowChoiceState`

**Fix:** Update intent.md to reference visible-state snapshots + CLI/MCP recommendation.

### 6. `intent.md` uses stale CLI flag `--players`

- **intent.md §4:** `--players bayesian,random,...`
- **cli.md §2:** `--strategies`

**Fix:** Replace `--players` with `--strategies`.

### 7. MCP `start_session` omits seed/RNG contract

- **strategies.md §1/§6:** `onGameStart({ playerId, playerCount, rng })` requires RNG
- **mcp.md §3.5:** No seed parameter defined

Session-mode behavior for stochastic strategies is underspecified.

**Fix:** Add optional `seed` parameter or specify deterministic derivation rule.

## 🟢 MINOR

### 8. `spec.md` MVP scope doesn't mention `serve` command

- **spec.md:** Lists `simulate`, `strategies`, `play`, `recommend`
- **cli.md/mcp.md:** Include `serve`

**Fix:** Add `serve` to MVP CLI bullet.
