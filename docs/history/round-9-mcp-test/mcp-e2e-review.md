# Round 9 — MCP Server E2E Test Review

**Date:** 2026-04-27  
**Server:** 6nimmt v1.0.0  
**Strategy tested:** `random`  
**Test method:** Live MCP tool invocations simulating a real game agent workflow

---

## Executive Summary

The **stateless tools** (`server_info`, `list_strategies`, `validate_state`, `recommend_once`) are solid and production-ready. The **session lifecycle tools** are blocked by a critical schema bug that makes it impossible to advance past `start_session`. A secondary issue is an inconsistent board representation between stateless and session tools. Error handling is generally excellent, with one crash bug in `resync_session`.

### Verdict: **Session workflow is non-functional. Stateless workflow works well.**

---

## Tool-by-Tool Results

### Stateless Tools

| Tool | Status | Notes |
|------|--------|-------|
| `server_info` | **PASS** | Returns correct metadata, 12 tools listed, `maxConcurrentSessions: 4` |
| `list_strategies` | **PASS** | Returns `random` strategy, player range 2–10 |
| `validate_state` | **PASS** | Correctly validates/rejects states; auto-detects card vs row decision; catches missing fields, out-of-range cards, wrong row count |
| `recommend_once` | **PASS** | Returns card and row recommendations; rejects invalid strategies; respects `timeout` param; works with 2-player and 4-player states |

#### `validate_state` — detailed test matrix

| Input | Expected | Actual | Result |
|-------|----------|--------|--------|
| Valid 4-player card decision state | `valid: true, decision: "card"` | Match | **PASS** |
| Valid row decision state with `triggeringCard`, `revealedThisTurn`, `resolutionIndex` | `valid: true, decision: "row"` | Match | **PASS** |
| Empty object `{}` | Errors listing all missing fields | 8 missing fields reported | **PASS** |
| Card value `0` (out of range 1–104) | Error | `"card 0 outside valid range 1–104"` | **PASS** |
| Only 3 rows instead of 4 | Error | `"Board must have exactly 4 rows, got 3"` | **PASS** |
| Row decision missing `triggeringCard` et al. | Error | `"Missing required fields: triggeringCard, revealedThisTurn, resolutionIndex"` | **PASS** |
| Board with `{"0":...}` key format (session format) | Error | `"Board must have a \"rows\" array."` | **PASS** (but see inconsistency below) |

#### `recommend_once` — detailed test matrix

| Scenario | Result | Output |
|----------|--------|--------|
| 10-card hand, 4 rows, `random` strategy | **PASS** | `{ card: 17 }` |
| 1-card hand, all rows at 5 cards (overflow scenario) | **PASS** | `{ card: 44 }` (only option) |
| Row pick decision with `triggeringCard: 3` | **PASS** | `{ rowIndex: 2 }` |
| Invalid strategy `"nonexistent"` | **PASS** | `INVALID_STRATEGY` error with valid list |
| Empty state `{}` | **PASS** | `INVALID_STATE` with detailed field list |
| With `timeout: 100` | **PASS** | Returns normally |

---

### Session Tools

| Tool | Status | Notes |
|------|--------|-------|
| `start_session` | **PASS** | Returns `sessionId`, `seed`, `sessionVersion: 0`, `phase: "awaiting-round"` |
| `round_started` | **FAIL — BLOCKER** | Board parameter schema bug (see BUG-1) |
| `session_recommend` | **BLOCKED** | Cannot reach `in-round` phase without `round_started` |
| `turn_resolved` | **BLOCKED** | Cannot reach `in-round` phase |
| `round_ended` | **BLOCKED** | Cannot reach `in-round` phase |
| `resync_session` | **FAIL — CRASH** | `board.map is not a function` (see BUG-2) |
| `session_status` | **PASS** | Returns correct metadata; proper error for unknown sessions |
| `end_session` | **PASS** | Cleans up session; double-end returns `UNKNOWN_SESSION` |

#### Session error handling test matrix

| Scenario | Expected | Actual | Result |
|----------|----------|--------|--------|
| `start_session` with `playerCount: 1` | Reject | `INVALID_PLAYER_COUNT` with details | **PASS** |
| `start_session` with invalid strategy | Reject | `INVALID_STRATEGY` with valid list | **PASS** |
| 5th concurrent session (max is 4) | Reject | `MAX_SESSIONS_REACHED` | **PASS** |
| `round_started` with wrong `expectedVersion` | Reject | `VERSION_MISMATCH` with current version | **PASS** |
| `round_ended` before round starts | Reject | `INVALID_PHASE` with `suggestedAction: "resync_session"` | **PASS** |
| `turn_resolved` before round starts | Reject | `INVALID_PHASE` | **PASS** |
| `session_recommend` before round starts | Reject | `INVALID_PHASE` | **PASS** |
| `session_status` for unknown session | Reject | `UNKNOWN_SESSION` | **PASS** |
| `end_session` for unknown session | Reject | `UNKNOWN_SESSION` | **PASS** |
| `end_session` then `session_status` | Both reject | Both return `UNKNOWN_SESSION` | **PASS** |

---

## Bugs

### BUG-1 (Critical): Board schema type mismatch blocks all session tools

**Severity:** Blocker — prevents any session from progressing past `awaiting-round`  
**Affected tools:** `round_started`, `turn_resolved`, `session_recommend`, `resync_session`  

**Root cause:** The tool input schemas declare `board` as `type: "object"`:
```json
{ "board": { "type": "object" } }
```
But the session handler (`session.ts` line ~165) validates with:
```typescript
if (!Array.isArray(board) || board.length !== 4)
```

Since JSON Schema distinguishes `"object"` from `"array"`, the MCP framework will never deliver a JavaScript `Array` for a property declared as `"object"`. Any object passed by the client fails `Array.isArray()`.

**Formats tested (all fail):**
- `{"0": [23], "1": [45], "2": [67], "3": [89]}` → `rowCount: 0`
- `{"rows": [[23], [45], [67], [89]]}` → `rowCount: 0`
- `[[23], [45], [67], [89]]` → Rejected by framework: `"must be object"`
- `{"0": [23], "1": [45], "2": [67], "3": [89], "length": 4}` → `rowCount: 0`

**Fix:** Either:
1. Change the schema to `type: "array", items: { type: "array", items: { type: "number" } }` — matches the handler expectation.
2. Or add a coercion layer in the server handler that converts `{"0":..., "1":..., "2":..., "3":...}` → `number[][]` before passing to `roundStarted()`.

### BUG-2 (High): `resync_session` crashes with unhandled error

**Severity:** High — server returns raw error instead of domain error  
**Affected tools:** `resync_session`

When called with an object-format board, the handler crashes:
```
MPC -32603: board.map is not a function
```
This indicates `resync_session` calls `board.map()` without first validating board format, unlike `round_started` which at least returns a structured `INVALID_BOARD` error.

**Fix:** Add the same `Array.isArray(board)` guard used in `roundStarted()` before calling `.map()`.

### BUG-3 (Medium): Inconsistent board representations between stateless and session tools

**Severity:** Medium — confusing for client implementers  

| Context | Expected Board Format |
|---------|----------------------|
| `validate_state` / `recommend_once` (stateless) | `{ "rows": [[23], [45], [67], [89]] }` (nested in `state.board`) |
| Session tools (documented in SKILL.md) | `{ "0": [23], "1": [45], "2": [67], "3": [89] }` |
| Session handler (actual code) | `[[23], [45], [67], [89]]` (plain `number[][]`) |

Three different representations for the same data structure. A client that learns the format from `validate_state` cannot use the same format with session tools.

**Fix:** Unify on a single board representation across all tools.

### BUG-4 (Low): `totalRounds` counter may be inaccurate

**Severity:** Low  
When ending session `s-16a3b2e4` (which never had a successful `round_started`), `end_session` returned `totalRounds: 1`. The session never actually entered a round, so this should be `0`.

---

## SKILL.md Documentation Issues

1. **Board format documentation is wrong.** The SKILL.md documents:
   ```json
   { "0": [23], "1": [45], "2": [67], "3": [89] }
   ```
   This format does not work with either the session handler (needs `number[][]`) or the stateless tools (need `{ "rows": [...] }`).

2. **No mention of `initialBoardCards`** as a required field for `validate_state` / `recommend_once` state objects. Clients would hit validation errors without this.

3. **No mention of `resolutionIndex` format.** The SKILL.md mentions `revealedThisTurn` and `triggeringCard` for row decisions but doesn't specify the expected shape of `revealedThisTurn` items.

---

## What Works Well

- **Error response quality is excellent.** Every error includes `code`, `message`, `recoverable`, `suggestedAction`, and `details`. This is well above average for MCP servers.
- **Optimistic concurrency** via `expectedVersion` is a solid design choice for multi-turn state management.
- **Session limits** are properly enforced with clear error messages.
- **Stateless tools** provide a complete working path for one-shot recommendations — useful even if sessions are broken.
- **Auto-detection of card vs row decisions** in `validate_state` and `recommend_once` reduces client complexity.

---

## Recommendations

1. **P0:** Fix BUG-1 — change `board` schema from `type: "object"` to `type: "array"` in `round_started`, `turn_resolved`, `session_recommend`, `resync_session`, and `boardAfter` in `turn_resolved`.
2. **P0:** Fix BUG-2 — add board validation guard in `resync_session` before calling `.map()`.
3. **P1:** Unify board representation across stateless and session tools (BUG-3).
4. **P2:** Update SKILL.md to document the correct board format after fixing.
5. **P2:** Add `initialBoardCards` and row-decision field docs to SKILL.md.
6. **P3:** Investigate `totalRounds` counter logic (BUG-4).
7. **P3:** Consider adding a `ping` or `health` tool for connectivity checks without needing to parse `server_info`.
