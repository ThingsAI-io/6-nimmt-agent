# Round 4 Review — Agentic Usability of MCP Tools

> Reviewer focus: AI agent experience when invoking MCP tools during live BGA play

## 🔴 BLOCKING

### 1. Row-pick flow underspecified — missing required state

- **mcp.md §3.9:** `session_recommend(decision:"row")` only accepts `hand`, `board`, `triggeringCard`
- **engine.md §1.6:** `RowChoiceState` also requires `revealedThisTurn`, `resolutionIndex`

Agent cannot request row recommendation mid-turn because server lacks partial-resolution context.

**Recommendation:** Add `revealedThisTurn` and `resolutionIndex` to `session_recommend(row)` parameters, or add dedicated mid-turn tool. Expose `awaiting-row-pick` as a session phase.

### 2. `turn_resolved` cannot represent row-pick attribution

- **mcp.md §3.7:** `placements: [{ card, rowIndex, overflow, collectedCards? }]` — no `playerId`
- **strategies.md §1:** `TurnResolution.rowPickups: [{ playerId, rowIndex, collectedCards }]`

Agent cannot encode "another player picked row X" or attribute collected cards to the correct player. Multiple row picks in one turn are ambiguous.

**Recommendation:** Align with `TurnResolution`: each entry should have `{ playerId, card, rowIndex, overflow, collectedCards, resolutionIndex }` ordered by resolution order.

### 3. `resync_session` is mutating but has no `expectedVersion`

- **mcp.md §5.2:** "Every mutating tool requires `expectedVersion`"
- **mcp.md §3.10:** `resync_session` parameters omit it

Recovery itself is race-prone.

**Recommendation:** Add `expectedVersion` or define explicit force-overwrite semantics.

## 🟡 IMPORTANT

### 4. Session responses lack phase/round/turn for loop control

- **mcp.md §3.9:** `session_recommend` returns `sessionVersion` but not `phase`, `round`, or `turn`

Agent must maintain its own loop state, increasing drift risk.

**Recommendation:** Include `phase`, `round`, `turn` in every session-scoped response.

### 5. Game start/end behavior ambiguous

- `start_session` returns `awaiting-round` but never says "call `round_started` for round 1"
- `round_ended` always returns `awaiting-round` — no game-over signal

Agent doesn't know when game is finished without external DOM heuristics.

**Recommendation:** Explicitly state round 1 flow. Add `gameOver`/`finalScores` to `round_ended` response when game ends.

### 6. Recovery ladder not defined for `resync_session` failure

- `STATE_MISMATCH` → `resync_session` is defined
- What if `resync_session` fails?

Agent can get stuck.

**Recommendation:** Define recovery ladder: `VERSION_MISMATCH` → retry with `currentVersion`; `STATE_MISMATCH` → `resync_session`; resync failure → `end_session` + `start_session` + resync; `UNKNOWN_SESSION` → full restart.

### 7. `DUPLICATE_EVENT` is not always safe to ignore

Duplicates keyed only by round/turn. Conflicting retry with different payload silently dropped.

**Recommendation:** If payload differs from recorded event, return `EVENT_CONFLICT` instead.

### 8. `STRATEGY_ERROR` / `TIMEOUT` contradicts error model

These are `ok: false` errors but also claim a recommendation is returned ("fallback used", "best-so-far returned").

**Recommendation:** Make these successful responses with warning metadata, or include `recommendation` + `playable: true/false` in error schema.

## 🟢 MINOR

### 9. `recommend` vs `session_recommend` naming

Names differ only by prefix; easy to confuse.

**Recommendation:** Rename to `recommend_once` / `recommend_session`, or use a single tool with explicit `mode`.

### 10. Parameter schemas too loose

`plays`, `placements`, `scores` typed only as "array" without nested object schemas.

**Recommendation:** Add explicit JSON Schema-like definitions for all nested types.
