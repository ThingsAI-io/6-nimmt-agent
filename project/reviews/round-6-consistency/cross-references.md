# Round 6 Consistency Review — Cross-Reference Report

**Scope:** All spec files in `spec/`  
**Date:** 2025-07-27  
**Focus:** Cross-reference consistency between spec documents

---

## Findings

### 1. `TurnResolution` misattributed to engine — mcp.md §3.7

**Files:** mcp.md (line 228), strategies.md (line 46)  
**Severity:** IMPORTANT

mcp.md §3.7 (`turn_resolved`) states:

> "The shape aligns with `TurnResolution` from the engine (see [Engine §3](engine.md))."

`TurnResolution` is defined in **strategies.md §1** (line 46), not in engine.md. Engine §3 is "Engine API" and does not define `TurnResolution`. Furthermore, the `turn_resolved` parameters actually align more closely with `TurnHistoryEntry` from engine.md §1.5 (which has `resolutions` and `rowPicks` fields), not with `TurnResolution` (which has `rowPickups` and no `resolutions` field).

**Fix:** Change to:
> "The shape aligns with `TurnHistoryEntry` from the engine (see [Engine §1.5](engine.md#15-game-state-full--simulator-internal)) and `TurnResolution` from [Strategies §1](strategies.md#1-interface)."

---

### 2. `rowPickups` vs `rowPicks` — field name inconsistency

**Files:** strategies.md (line 49), engine.md (line 128), mcp.md (lines 240, 406)  
**Severity:** IMPORTANT

Three different spec files use two different names for the same concept:

| Location | Field Name | Context |
|----------|-----------|---------|
| strategies.md `TurnResolution` | `rowPickups` | Strategy lifecycle hook input |
| engine.md `TurnHistoryEntry` | `rowPicks` | Game state history |
| mcp.md `turn_resolved` params | `rowPicks` | MCP tool parameter |
| mcp.md `resync_session` turnHistory | `rowPicks` | MCP tool parameter |

strategies.md §7.1 (line 133) says "each entry directly maps to a `TurnResolution`", but the field names differ (`rowPicks` → `rowPickups`), so the mapping is not direct — it requires a rename.

**Fix:** Either:
- (a) Rename `TurnResolution.rowPickups` to `rowPicks` for consistency with engine.md and mcp.md, or
- (b) Document the field-name mapping explicitly in strategies.md §7.1

Option (a) is preferred — it eliminates the inconsistency.

---

### 3. `TurnResolution.boardAfter` type mismatch with `TurnHistoryEntry.boardAfter`

**Files:** strategies.md (line 55), engine.md (line 129)  
**Severity:** IMPORTANT

| Location | Type |
|----------|------|
| strategies.md `TurnResolution.boardAfter` | `Board` (object with `rows` property) |
| engine.md `TurnHistoryEntry.boardAfter` | `readonly CardNumber[][]` (bare array) |

Since `Board` is an internal TypeScript type with a `rows` property (engine.md §1.3), while `TurnHistoryEntry` uses `CardNumber[][]` (the JSON serialization format), these are structurally different. This contradicts the "directly maps" claim in strategies.md §7.1.

**Fix:** Change `TurnResolution.boardAfter` to `readonly CardNumber[][]` (or `number[][]`) to match `TurnHistoryEntry.boardAfter` and the JSON serialization convention established in engine.md §1.3. Alternatively, document the `Board` ↔ `number[][]` conversion in the mapping.

---

### 4. `round_ended` missing from `in-round` allowed tools table

**Files:** mcp.md (line 582)  
**Severity:** IMPORTANT

The "Allowed tools per phase" table (mcp.md §5.1) does not list `round_ended` as either allowed or rejected for the `in-round` phase:

> `in-round` allowed: `session_recommend(decision:"card")`, `turn_resolved`, `session_recommend(decision:"row")`, `session_status`, `resync_session`, `end_session`  
> `in-round` rejected: `round_started`

After the 10th turn's `turn_resolved`, the agent must call `round_ended`, which requires `round_ended` to be allowed in the `in-round` phase. Its absence from both columns creates ambiguity.

**Fix:** Add `round_ended` to the `in-round` allowed tools column.

---

### 5. Typo in engine.md §1.6 RowChoiceState

**Files:** engine.md (line 193)  
**Severity:** MINOR

```
/** The card this player playedthat triggered the forced row pick. */
```

Missing space: "playedthat" should be "played that".

**Fix:** `/** The card this player played that triggered the forced row pick. */`

---

### 6. `resync_session` not listed as requiring `expectedVersion` but is a mutating tool

**Files:** mcp.md (lines 590, 601)  
**Severity:** MINOR (documented but inconsistent placement)

mcp.md §5.2 (line 590) says:

> "Every session has a monotonically increasing `sessionVersion` ... It increments on every mutating tool call (`round_started`, `turn_resolved`, `round_ended`, `resync_session`)."

Then line 597:

> "Read-only tools (`session_recommend`, `end_session`) do not require `expectedVersion`."

The exemption for `resync_session` (line 601) is documented in a separate implementation note but is easy to miss. The `resync_session` parameter table (lines 398-406) confirms it does NOT have an `expectedVersion` parameter.

**Fix:** No code change needed, but consider adding `resync_session` to the line 597 sentence:
> "Read-only tools (`session_recommend`, `end_session`) and `resync_session` (exempt for recovery — see note below) do not require `expectedVersion`."

---

### 7. mcp.md §3.3 anchor link to Engine §4 could be more specific

**Files:** mcp.md (line 109)  
**Severity:** MINOR

```
(see [Engine §4](engine.md))
```

The link points to `engine.md` without an anchor. Should use `engine.md#4-state-validation` for direct navigation.

**Fix:** Change to `(see [Engine §4](engine.md#4-state-validation))`.

---

### 8. `session_status` `board` field uses card 101 (out of range)

**Files:** mcp.md (line 452)  
**Severity:** MINOR

The `session_status` example result includes card 101:

```json
"board": [[5, 22, 44], [10, 33], [67], [99, 101]]
```

Valid card numbers are 1–104, so 101 is technically in range. No issue.

**(Verified — no finding.)**

---

## Verified Items (No Issues Found)

| Check | Status |
|-------|--------|
| `resolvedCardsThisRound` removed | ✅ Not found anywhere |
| `{ rows: number[][] }` in parameter tables | ✅ Not found (board uses bare `number[][]` in MCP/CLI) |
| Tool count = 12 | ✅ Matches: server_info, list_strategies, validate_state, recommend_once, start_session, round_started, turn_resolved, round_ended, session_recommend, resync_session, session_status, end_session |
| CLI commands = 5 | ✅ simulate, strategies, recommend, play, serve |
| `serve` references mcp.md | ✅ cli.md line 147 |
| Player count 2–10 everywhere | ✅ Consistent across engine.md, mcp.md, simulator.md, harness.md, rules |
| Architecture diagram in intent.md | ✅ Matches: Agent → MCP Server → Engine → Simulator |
| Design principles in spec.md | ✅ All still hold after changes |
| Simulator §6 reference to Engine §2.2 | ✅ Correct |
| Strategies §1 reference to Engine §1.6 | ✅ Correct |
| mcp.md §3.4 reference to Strategies §7 | ✅ Correct |
| `turnHistory` field structure in resync_session | ✅ Matches `TurnHistoryEntry` from engine.md |
| end_session is §3.12 | ✅ Correct numbering |
| session_status is §3.11 | ✅ Correct numbering |

---

## Summary

| Severity | Count |
|----------|-------|
| BLOCKING | 0 |
| IMPORTANT | 4 |
| MINOR | 3 |

Key theme: The `TurnResolution` (strategies.md) and `TurnHistoryEntry` (engine.md) types have drifted — different field names (`rowPickups` vs `rowPicks`) and different `boardAfter` types (`Board` vs `CardNumber[][]`). The cross-references between mcp.md and these types contain an incorrect attribution. The `round_ended` tool is missing from the phase table for `in-round`.
