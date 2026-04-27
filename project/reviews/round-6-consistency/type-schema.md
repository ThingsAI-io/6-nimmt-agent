# Round 6 Consistency Review — Type/Schema Consistency in mcp.md

**Reviewer:** Copilot CLI  
**Date:** 2025-07-27  
**File:** `spec/mcp.md`

---

## 1. Parameter Tables vs Examples

### Issue 1 — `start_session` flow example missing `playerId` (§9, ~line 712)

**Severity:** Medium  
**Location:** §9 flow diagram, `start_session` call  
**Quote:** `├── start_session ──────────────────────►│  strategy:"bayesian", playerCount:5`  
**Problem:** The parameter table (§3.5) lists `playerId` as **required**, but the §9 flow diagram annotation only shows `strategy` and `playerCount`. The `playerId` parameter is missing from the flow annotation.  
**Expected:** `strategy:"bayesian", playerCount:5, playerId:"copilot-ai"`

### Issue 2 — `round_ended` flow example missing `expectedVersion` commentary consistency (~line 733)

**Severity:** Low (informational)  
**Location:** §9 main flow, `round_ended` call  
**Quote:** `├── round_ended ─────────────────────────►│  scores, round:1, expectedVersion:11`  
**Problem:** The version `11` assumes 1 `round_started` + 10 `turn_resolved` = 11 increments from version 0, giving version 11. `round_ended` would then carry `expectedVersion:11` and produce `version:12`. This is internally consistent. No issue here — verified correct.

### Issue 3 — `session_recommend` response in flow omits `sessionVersion` (~line 721)

**Severity:** Low  
**Location:** §9 main flow  
**Quote:** `│◄── {card:42, confidence:0.85} ─────────┤`  
**Problem:** The full response schema (§3.9, ~line 340) includes `sessionVersion`, `decision`, `strategy`, `timedOut`, `stateConsistent`, `stateWarnings` — but the flow diagram shows an abbreviated form. This is acceptable for readability, but the abbreviation omits `sessionVersion`. Acceptable as a flow diagram simplification, not a true inconsistency.

---

## 2. Response Schemas

### Issue 4 — `end_session` response missing `sessionVersion` (~line 479)

**Severity:** Medium  
**Location:** §3.12 `end_session` result  
**Quote:**
```json
{
  "sessionId": "s-a1b2c3d4",
  "ended": true,
  "totalRounds": 3,
  "finalPhase": "ended"
}
```
**Problem:** §5.2 states: "Read-only tools (`session_recommend`, `end_session`) do not require `expectedVersion`." This implies `end_session` is read-only, yet it clearly mutates state (transitions to `ended` phase). The response does not include `sessionVersion`. If `end_session` is considered non-mutating for version purposes, this is fine but should be explicit. The current classification of `end_session` as "read-only" is questionable — it terminates the session and invalidates the session ID.

### Issue 5 — `session_recommend` response includes `sessionId` but event tools don't (~line 340 vs ~line 244)

**Severity:** Low  
**Location:** §3.9 vs §3.6–§3.8 response schemas  
**Problem:** The `session_recommend` response includes `"sessionId": "s-a1b2c3d4"` but the `round_started`, `turn_resolved`, and `round_ended` responses do not include `sessionId`. This is not necessarily wrong (the caller knows which session they called) but is inconsistent across tool responses. Minor style inconsistency.

### Issue 6 — `resync_session` response missing `accepted` field (~line 409)

**Severity:** Low  
**Location:** §3.10 result  
**Problem:** The event tools (`round_started`, `turn_resolved`, `round_ended`) all include `"accepted": true` in their responses. `resync_session` uses `"resynced": true` instead. This is semantically clear but inconsistent in pattern. Not a bug, just a style deviation.

---

## 3. Error Codes Table

### Issue 7 — `SESSION_EXPIRED` never referenced by any individual tool's Errors list

**Severity:** Medium  
**Location:** §4.2, ~line 534  
**Quote:** `SESSION_EXPIRED | yes | start_fresh | Session expired due to inactivity.`  
**Problem:** `SESSION_EXPIRED` is defined in the §4.2 error table but is never listed in any individual tool's "Errors:" section (§3.5–§3.12). It is mentioned in §5.6 prose but no tool explicitly documents returning it. It would logically be returned by any session-bearing tool, but this is not documented per-tool.

### Issue 8 — `MAX_SESSIONS_REACHED` only implicitly from `start_session`

**Severity:** Low  
**Location:** §4.2, ~line 535  
**Quote:** `MAX_SESSIONS_REACHED | no | none | All session slots are in use.`  
**Problem:** `MAX_SESSIONS_REACHED` is defined in the error table but not listed in `start_session`'s "Errors:" section. It's logically only relevant to `start_session` but isn't documented there.

### Issue 9 — `INVALID_STRATEGY` and `INVALID_PLAYER_COUNT` not in `start_session` Errors list

**Severity:** Medium  
**Location:** §3.5 `start_session` (no Errors section listed)  
**Problem:** `start_session` has no "Errors:" section at all. The error codes `INVALID_STRATEGY`, `INVALID_PLAYER_COUNT`, and `MAX_SESSIONS_REACHED` from §4.2 are clearly relevant to `start_session` but are not documented there. Other session tools (§3.6–§3.8) have explicit error lists.

### Issue 10 — `STATE_MISMATCH` not in `session_recommend` Errors list

**Severity:** Low  
**Location:** §3.9 `session_recommend`  
**Problem:** The prose in §3.9 describes "Major drift → returns `STATE_MISMATCH` error" (~line 388), but there is no formal "Errors:" section for `session_recommend`. The error is described in prose but not in the structured format used by other tools.

---

## 4. Tool Count

### Verification: 12 tool headings — ✅ PASS

Tools found:
1. `server_info` (§3.1)
2. `list_strategies` (§3.2)
3. `validate_state` (§3.3)
4. `recommend_once` (§3.4)
5. `start_session` (§3.5)
6. `round_started` (§3.6)
7. `turn_resolved` (§3.7)
8. `round_ended` (§3.8)
9. `session_recommend` (§3.9)
10. `resync_session` (§3.10)
11. `session_status` (§3.11)
12. `end_session` (§3.12)

### Verification: `server_info` tools array matches — ✅ PASS

**Quote (~line 49):**
```json
"tools": ["server_info", "list_strategies", "validate_state", "recommend_once",
          "start_session", "round_started", "turn_resolved", "round_ended",
          "session_recommend", "resync_session", "session_status", "end_session"]
```
All 12 names match the headings.

### Verification: §6 module structure accounts for all 12 — ✅ PASS

- `stateless.ts` → `list_strategies`, `validate_state`, `recommend_once` (3)
- `session-mgmt.ts` → `start_session`, `end_session`, `resync_session`, `session_status` (4)
- `events.ts` → `round_started`, `turn_resolved`, `round_ended` (3)
- `recommend.ts` → `session_recommend` (1)
- `server.ts` → `server_info` (1, implied by server setup)

Total: 12. ✅

---

## 5. Session State Machine

### Issue 11 — `round_ended` transition arrow placement in ASCII diagram (~line 557–558)

**Severity:** Low  
**Location:** §5.1 state machine diagram  
**Problem:** In the ASCII diagram, `round_ended` appears at line 558 on the right side as a label, but the visual flow shows it in a confusing position relative to the `in-round` → `awaiting-round` loop. The prose (§3.8) is clear, but the diagram's layout could mislead a reader into thinking `round_ended` is a separate branch rather than the `in-round` → `awaiting-round` return path. This is a readability issue, not a logical inconsistency.

### Verification: Phase names match between state machine and responses — ✅ PASS

Phases used: `awaiting-round`, `in-round`, `awaiting-row-pick`, `game-over`, `ended`. These appear consistently in the state machine diagram (§5.1), the phase-tools matrix (§5.1 table), and the response examples.

### Verification: Phase-tools matrix covers all phases and tools — ✅ PASS

The matrix at ~line 579 covers all 5 phases (`awaiting-round`, `in-round`, `awaiting-row-pick`, `game-over`) and lists allowed/rejected tools for each. The `ended` phase is implicit (no tools accepted). Non-session tools (`server_info`, `list_strategies`, `validate_state`, `recommend_once`) are not phase-dependent and are correctly omitted from the matrix.

---

## 6. Version Increment Rules

### Issue 12 — `end_session` classified as "read-only" despite being mutating (~line 597)

**Severity:** Medium  
**Location:** §5.2  
**Quote:** `Read-only tools (session_recommend, end_session) do not require expectedVersion.`  
**Problem:** `end_session` is grouped with `session_recommend` as "read-only," but it clearly mutates the session (transitions phase to `ended`, invalidates sessionId). §5.2 also states version increments on `round_started`, `turn_resolved`, `round_ended`, `resync_session` — `end_session` is NOT listed. This means `end_session` doesn't increment the version, which is acceptable since the session is destroyed. However, calling it "read-only" is misleading. It should be described as "does not require `expectedVersion` and does not increment `sessionVersion`" without the "read-only" label.

### Verification: `session_status` does NOT increment — ✅ PASS

§3.11 (~line 464): "This tool is read-only — it does not require `expectedVersion` and does not increment `sessionVersion`."

### Verification: `session_recommend` does NOT increment — ✅ PASS

§3.9 (~line 383): "`session_recommend` does not increment `sessionVersion`."

### Verification: `resync_session` increments and is exempt from version check — ✅ PASS

§5.2 lists it as a mutating tool. §5.2 note (~line 601): "`resync_session` is exempt from version checking despite being a mutating tool."

---

## 7. DomainError Interface

### Verification: Interface fields — ✅ PASS

**Quote (~line 508):**
```typescript
interface DomainError {
  ok: false;
  code: string;
  recoverable: boolean;
  suggestedAction: "retry_with_version" | "resync_session" | "start_fresh" | "none";
  message: string;
  details?: Record<string, unknown>;
}
```

All required fields present: `ok`, `code`, `recoverable`, `suggestedAction`, `message`, `details`.

### Issue 13 — Recovery flow example uses `ok:false` but no other DomainError fields (~line 778)

**Severity:** Low  
**Location:** §9 Recovery Flow  
**Quote:** `│◄── {ok:false, code:"STATE_MISMATCH"} ──┤`  
**Problem:** The flow diagram shows an abbreviated error response with only `ok` and `code`. The full DomainError interface requires `recoverable`, `suggestedAction`, and `message` as well. This is acceptable as a flow diagram abbreviation but doesn't demonstrate the full error shape.

### Verification: `suggestedAction` values in error table match enum — ✅ PASS

All values in the §4.2 table are from `{"retry_with_version", "resync_session", "start_fresh", "none"}`.

---

## 8. Board Format

### Verification: All board parameters use `number[][]` — ✅ PASS

- `round_started` board: `number[][]` (~line 204) ✅
- `turn_resolved` boardAfter: `number[][]` (~line 241) ✅
- `session_recommend` board: `number[][]` (~line 329) ✅
- `resync_session` board: `number[][]` (~line 403) ✅
- `session_status` board example: `[[5, 22, 44], [10, 33], [67], [99, 101]]` (~line 451) ✅

No `{ rows: [...] }` format found anywhere. ✅

### Verification: `boardAfter` in `turn_resolved` is optional — ✅ PASS

**Quote (~line 241):** `| boardAfter | number[][] | no | Board state after all resolutions...`

---

## 9. turnHistory Schema

### Verification: turnHistory matches engine.md TurnHistoryEntry — ✅ PASS

**mcp.md turnHistory type (~line 406):**
```
{ turn: number, plays: { playerId: string, card: number }[],
  resolutions: { playerId: string, card: number, rowIndex: number,
    causedOverflow: boolean, collectedCards?: number[] }[],
  rowPicks: { playerId: string, rowIndex: number, collectedCards: number[] }[],
  boardAfter: number[][] }[]
```

**engine.md TurnHistoryEntry (~line 117–130):**
```typescript
interface TurnHistoryEntry {
  turn: number;
  plays: { playerId: string; card: CardNumber }[];
  resolutions: { playerId: string; card: CardNumber; rowIndex: number;
    causedOverflow: boolean; collectedCards?: CardNumber[] }[];
  rowPicks: { playerId: string; rowIndex: number; collectedCards: CardNumber[] }[];
  boardAfter: CardNumber[][];
}
```

Fields match: `turn`, `plays`, `resolutions` (with `playerId`, `card`, `rowIndex`, `causedOverflow`, `collectedCards?`), `rowPicks`, `boardAfter`. ✅

---

## 10. Naming Consistency

### Verification: Tool names all lowercase with underscores — ✅ PASS

All 12 tool names use `snake_case`: `server_info`, `list_strategies`, `validate_state`, `recommend_once`, `start_session`, `round_started`, `turn_resolved`, `round_ended`, `session_recommend`, `resync_session`, `session_status`, `end_session`.

### Verification: Phase names all lowercase with hyphens — ✅ PASS

`awaiting-round`, `in-round`, `awaiting-row-pick`, `game-over`, `ended`.

### Verification: Error codes all UPPER_SNAKE_CASE — ✅ PASS

`UNKNOWN_SESSION`, `INVALID_PHASE`, `VERSION_MISMATCH`, `DUPLICATE_EVENT`, `INVALID_ROUND`, `INVALID_TURN`, `INVALID_BOARD`, `INVALID_HAND`, `INVALID_RESOLUTIONS`, `INVALID_STRATEGY`, `INVALID_PLAYER_COUNT`, `STATE_MISMATCH`, `EVENT_CONFLICT`, `SESSION_EXPIRED`, `MAX_SESSIONS_REACHED`.

### Verification: Field names camelCase — ✅ PASS

`sessionId`, `sessionVersion`, `expectedVersion`, `playerId`, `playerCount`, `seatIndex`, `boardAfter`, `turnHistory`, `causedOverflow`, `collectedCards`, `rowIndex`, `triggeringCard`, `revealedThisTurn`, `resolutionIndex`, `stateConsistent`, `stateWarnings`, `finalScores`, `gameOver`, `totalRounds`, `finalPhase`, `strategyFallback`, `timedOut`, `suggestedAction`, `maxConcurrentSessions`.

### Issue 14 — §9.1 Edge Case 2 uses `placements` and `overflow` instead of `resolutions` and `causedOverflow` (~line 796)

**Severity:** High  
**Location:** §9.1 Edge Case 2  
**Quote:** `This appears in turn_resolved as part of the placements array (the placement entry will have overflow: true and include collectedCards).`  
**Problem:** The `turn_resolved` parameter table (§3.7) uses `resolutions` (not `placements`) and `causedOverflow` (not `overflow`). The §9.1 prose uses outdated/incorrect field names. This is a terminology inconsistency likely left over from an earlier draft.  
**Expected:** `This appears in turn_resolved as part of the resolutions array (the resolution entry will have causedOverflow: true and include collectedCards).`

### Issue 15 — §9.1 Edge Case 3 uses `placements` instead of `resolutions` (~line 798)

**Severity:** High  
**Location:** §9.1 Edge Case 3  
**Quote:** `...the agent calls turn_resolved with the complete data (all plays, all placements including the agent's row pick).`  
**Problem:** Same as Issue 14 — uses `placements` instead of `resolutions`.  
**Expected:** `...the agent calls turn_resolved with the complete data (all plays, all resolutions including the agent's row pick).`

---

## 11. Miscellaneous

### Issue 16 — Missing space in §5.2 note (~line 601)

**Severity:** Trivial  
**Location:** §5.2  
**Quote:** `` `resync_session` is **exempt**from version checking ``  
**Problem:** Missing space between `**exempt**` and `from`.  
**Expected:** `` `resync_session` is **exempt** from version checking ``

---

## Summary

| Category | Issues Found | Severity Breakdown |
|----------|-------------|-------------------|
| Parameter Tables vs Examples | 1 | 1 Medium |
| Response Schemas | 3 | 1 Medium, 2 Low |
| Error Codes Table | 4 | 2 Medium, 2 Low |
| Tool Count | 0 | — |
| Session State Machine | 1 | 1 Low |
| Version Increment Rules | 1 | 1 Medium |
| DomainError Interface | 1 | 1 Low |
| Board Format | 0 | — |
| turnHistory Schema | 0 | — |
| Naming Consistency | 2 | 2 High |
| Miscellaneous | 1 | 1 Trivial |
| **Total** | **14** | **2 High, 4 Medium, 6 Low, 1 Trivial, 1 Info** |

### High Priority Fixes (should fix before implementation)

1. **Issue 14 & 15:** Replace `placements`/`overflow` with `resolutions`/`causedOverflow` in §9.1 edge cases.

### Medium Priority Fixes (should fix soon)

2. **Issue 1:** Add `playerId` to `start_session` flow annotation in §9.
3. **Issue 4:** Clarify `end_session` version semantics (not truly "read-only").
4. **Issue 9:** Add "Errors:" section to `start_session` listing `INVALID_STRATEGY`, `INVALID_PLAYER_COUNT`, `MAX_SESSIONS_REACHED`.
5. **Issue 7:** Document which tools return `SESSION_EXPIRED` (all session-bearing tools).
6. **Issue 12:** Reword §5.2 to not call `end_session` "read-only".
