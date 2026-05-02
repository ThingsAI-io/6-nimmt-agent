# Round 7 — Plan Gap Analysis

> Comparison of `plan/README.md` against current spec suite (post Rounds 3-6).
> Generated automatically. Each finding references plan line numbers and spec sections.

---

## 1. Stale Terminology

### GAP-ST-01 — `resolvedCardsThisRound` in CLI acceptance example
- **Category:** Stale Term
- **Location:** T5C acceptance, line 777
- **Plan text:** `"resolvedCardsThisRound":[]`
- **Should be:** `"turnHistory":[]`
- **Severity:** BREAKING — The acceptance command uses a field name that doesn't exist in the current `CardChoiceState` type (engine.md §1.6). An agent implementing this will produce a state that fails validation.

### GAP-ST-02 — `resolvedCardsThisRound` in resync description
- **Category:** Stale Term
- **Location:** T5E requirements, line 848
- **Plan text:** `resync_session` resets strategy state, replays `resolvedCardsThisRound` as synthetic `onTurnResolved()` calls
- **Should be:** replays `turnHistory` as synthetic `onTurnResolved()` calls
- **Severity:** BREAKING — Agent implementing resync will look for the wrong field name.

### GAP-ST-03 — `rowPickups` in TurnResolution shape
- **Category:** Stale Term
- **Location:** T3A acceptance, line 619
- **Plan text:** `TurnResolution` shape contains at least: `turn`, `plays`, `rowPickups`, `boardAfter`
- **Should be:** `turn`, `plays`, `resolutions`, `rowPicks`, `boardAfter`
- **Severity:** BREAKING — The field was renamed from `rowPickups` to `rowPicks` (strategies.md §1). Additionally, the `resolutions` field is missing entirely from the acceptance criteria.

### GAP-ST-04 — MCP `recommend` tool name (should be `recommend_once`)
- **Category:** Stale Term
- **Location:** T5D, lines 809, 815, 825, 827; T5F-TEST line 864
- **Plan text:** `src/mcp/tools/stateless.ts` — `server_info`, `list_strategies`, `validate_state`, `recommend` tools
- **Should be:** `recommend_once` (mcp.md §3.4). The tool is named `recommend_once` in the spec to distinguish it from CLI `recommend` and session-based `session_recommend`.
- **Severity:** BREAKING — The implementing agent will register the tool with the wrong name. MCP clients looking for `recommend_once` will get `MethodNotFound`.

### GAP-ST-05 — Board format as `{ rows: [...] }` in fixture schemas
- **Category:** Stale Term / Schema
- **Location:** T1B lines 202, 212, 223; T1C lines 249, 253; T1D lines 276, 281
- **Plan text:**
  ```json
  "board": { "rows": [[25, 29], [10, 17, 30], [40], [80, 90]] }
  "boardAfter": { "rows": [[10, 15], [20], [30, 35], [40]] }
  ```
- **Should be:** Board in JSON serialization is `number[][]`, not `{ rows: [...] }` (engine.md §1.3 Board serialization):
  ```json
  "board": [[25, 29], [10, 17, 30], [40], [80, 90]]
  "boardAfter": [[10, 15], [20], [30, 35], [40]]
  ```
- **Severity:** BREAKING — Fixture files created with `{ rows: [...] }` format will fail deserialization by the engine's `boardFromJson()` function. Affects 7 schema examples across T1B, T1C, T1D.

---

## 2. Missing Plan Tasks

### GAP-MT-01 — `session_status` tool (mcp.md §3.11) not covered
- **Category:** Missing Task
- **Location:** T5D and T5E — neither mentions `session_status`
- **Current state:** mcp.md §3.11 defines `session_status` as a new read-only tool. The spec module structure (mcp.md §6) places it in `session-mgmt.ts`.
- **Plan text (T5E line 835):** `src/mcp/tools/session-mgmt.ts` — `start_session`, `end_session`, `resync_session` tools
- **Should be:** `src/mcp/tools/session-mgmt.ts` — `start_session`, `end_session`, `resync_session`, `session_status` tools
- **Severity:** BREAKING — An entire tool will be missing from the implementation.

### GAP-MT-02 — `session_status` not in T5F-TEST test plan
- **Category:** Missing Task
- **Location:** T5F-TEST, lines 860-872
- **Current state:** No test file or test case covers `session_status`. The test plan lists `stateless.test.ts`, `session.test.ts`, `events.test.ts`, `session-recommend.test.ts`, `resync.test.ts`, `errors.test.ts`, `concurrent.test.ts` — none test `session_status`.
- **Should add:** A test case (in `session.test.ts` or a new `session-status.test.ts`) verifying: returns current state, works in all phases, returns `UNKNOWN_SESSION` for invalid ID, does not increment version.
- **Severity:** IMPORTANT — No test coverage for a spec-defined tool.

### GAP-MT-03 — Drift threshold implementation not tasked
- **Category:** Missing Task
- **Location:** T5E (drift.ts mentioned but thresholds not specified)
- **Current state:** mcp.md §3.9 defines explicit drift classification thresholds: consistent (exact match), minor drift (≤2 card differences), major drift (hand size differs by >1 or >2 board cards differ). The plan only mentions "drift detection" generically.
- **Should be:** T5E or a sub-task should specify implementing the three-tier drift classification with the exact threshold criteria from the spec.
- **Severity:** IMPORTANT — Without explicit thresholds, the agent will invent its own, which may not match spec.

### GAP-MT-04 — `suggestedAction` in DomainError not mentioned
- **Category:** Missing Task
- **Location:** T5D errors.ts (line 810)
- **Current state:** mcp.md §4.2 defines `DomainError` with a `suggestedAction` field (`"retry_with_version" | "resync_session" | "start_fresh" | "none"`). The plan mentions domain error constructors but not this field.
- **Should be:** T5D acceptance should verify that every `DomainError` includes `suggestedAction` matching the spec's error table.
- **Severity:** IMPORTANT — Missing field in error responses will confuse AI agent consumers that rely on `suggestedAction` for recovery logic.

### GAP-MT-05 — `MAX_SESSIONS_REACHED` error code not in plan
- **Category:** Missing Task
- **Location:** T5E (concurrent sessions mentioned at line 849, but error code not explicitly listed)
- **Current state:** mcp.md §3.5 lists `MAX_SESSIONS_REACHED` as an error for `start_session`. T5F-TEST line 870 mentions `maxConcurrentSessions enforcement` but doesn't reference the specific error code.
- **Should be:** T5E acceptance and T5F-TEST should explicitly verify `MAX_SESSIONS_REACHED` is returned when limit is exceeded.
- **Severity:** MINOR — The concurrent test probably covers this implicitly, but the error code should be explicit.

### GAP-MT-06 — `strategyFallback` field not in plan
- **Category:** Missing Task
- **Location:** T5D (recommend_once) and T5E (session_recommend)
- **Current state:** mcp.md §3.4 and §3.9 both include `strategyFallback` in the response. The plan never mentions this field.
- **Should be:** Both `recommend_once` and `session_recommend` responses must include `strategyFallback: boolean`. Acceptance criteria should verify it's `false` normally and `true` when strategy throws.
- **Severity:** IMPORTANT — Missing field in recommendation responses.

### GAP-MT-07 — Session expiry timer (30 min) not tasked
- **Category:** Missing Task
- **Location:** Not present anywhere in plan
- **Current state:** mcp.md §5.6 defines session expiry after 30 minutes of inactivity, `SESSION_EXPIRED` error code, and activity-reset semantics.
- **Should be:** T5E should include session expiry logic; T5F-TEST should verify expiry behavior (or at least a test with a short timeout).
- **Severity:** IMPORTANT — A spec-required feature with no implementation task.

### GAP-MT-08 — Shadow board computation not tasked
- **Category:** Missing Task
- **Location:** T5E line 838 mentions `drift.ts` but no shadow board
- **Current state:** mcp.md §3.9 specifies: "The server maintains an internal shadow board by applying each `turn_resolved` resolution to its state." This is how drift detection works — comparing agent snapshot against server-computed state, not previously agent-provided state.
- **Should be:** T5E or `drift.ts` should explicitly task the shadow board computation and its use in drift comparison.
- **Severity:** IMPORTANT — Without shadow board, drift detection compares against wrong baseline.

### GAP-MT-09 — Phase-tools matrix enforcement not tasked
- **Category:** Missing Task
- **Location:** T5E mentions phase transitions but not the full tools-per-phase matrix
- **Current state:** mcp.md §5.1 includes a detailed "Allowed tools per phase" table (4 phases × specific allowed/rejected tools). The plan only mentions generic "wrong-phase calls return `INVALID_PHASE`".
- **Should be:** T5E acceptance and T5F-TEST should verify the complete phase-tools matrix, including: `round_ended` is allowed in `in-round` phase, `session_recommend(decision:"card")` is rejected in `awaiting-row-pick`, etc.
- **Severity:** IMPORTANT — Partial phase enforcement will cause subtle bugs. Notably, `round_ended` is now allowed in `in-round` phase (post-spec-change).

### GAP-MT-10 — Circuit-breaker rule not referenced
- **Category:** Missing Task
- **Location:** Not present in plan
- **Current state:** mcp.md §5.5 defines: "If the same error recurs 3 consecutive times at one recovery level, escalate to the next level immediately."
- **Should be:** At minimum, T5F-TEST or documentation should reference the circuit-breaker rule. This may be agent-side logic (not server-enforced), but it should be documented/tested if it affects server behavior.
- **Severity:** MINOR — This is guidance for the agent, not server-side code. But should be acknowledged in documentation tasks.

### GAP-MT-11 — Session reuse after game-over explicitly forbidden
- **Category:** Missing Task
- **Location:** T5E acceptance criteria (lines 851-858)
- **Current state:** mcp.md §3.8: "A session cannot be reused for a new game. After game-over, the agent must call `end_session` and then `start_session` to begin a new game session."
- **Should be:** T5E acceptance should verify that calling `round_started` after `game-over` returns `INVALID_PHASE`, and T5F-TEST should have a specific test for session-reuse-after-game-over.
- **Severity:** MINOR — Likely covered by phase transition tests, but should be explicit.

### GAP-MT-12 — `resync_session` version semantics (increment by exactly 1)
- **Category:** Missing Task
- **Location:** T5E (lines 829-858)
- **Current state:** mcp.md §3.10 specifies: "resync_session increments sessionVersion by exactly 1, regardless of how many turnHistory entries are replayed internally."
- **Should be:** T5E acceptance should verify that after resync with N turnHistory entries, version increments by exactly 1 (not N+1).
- **Severity:** IMPORTANT — Wrong version increment will cause VERSION_MISMATCH cascades.

### GAP-MT-13 — `end_session` classified as non-versioned
- **Category:** Missing Task
- **Location:** T5E
- **Current state:** mcp.md §5.2: "Non-versioned tools (`session_recommend`, `session_status`, `end_session`) do not require `expectedVersion`." The plan doesn't specify `end_session` as non-versioned.
- **Should be:** T5E requirements and acceptance should note that `end_session` does not require `expectedVersion`.
- **Severity:** MINOR — Likely implemented correctly from spec, but plan should be explicit.

---

## 3. Inconsistent Fixture Schemas

### GAP-FS-01 — Board format in placement-scenarios fixture schema
- **Category:** Schema
- **Location:** T1B lines 199-226
- **Plan text:** `"board": { "rows": [[25, 29], ...] }`, `"boardAfter": { "rows": [...] }`
- **Should be:** `"board": [[25, 29], ...]`, `"boardAfter": [[10, 15], ...]` — bare `number[][]` per engine.md §1.3
- **Severity:** BREAKING (same as GAP-ST-05; included here for schema-specific categorization)

### GAP-FS-02 — Board format in overflow-scenarios fixture schema
- **Category:** Schema
- **Location:** T1C lines 246-255
- **Plan text:** `"board": { "rows": [[3, 12, 24, 55, 78], ...] }`
- **Should be:** `"board": [[3, 12, 24, 55, 78], ...]`
- **Severity:** BREAKING

### GAP-FS-03 — Board format in must-pick-row fixture schema
- **Category:** Schema
- **Location:** T1D lines 273-283
- **Plan text:** `"board": { "rows": [[10, 20], ...] }`
- **Should be:** `"board": [[10, 20], ...]`
- **Severity:** BREAKING

### GAP-FS-04 — TurnResolution shape in full-game-trace fixture schema
- **Category:** Schema
- **Location:** T1F lines 351-354
- **Plan text:** Resolution uses `placement: { kind: "place", rowIndex: 0, causesOverflow: false }` wrapper
- **Should be:** Per engine.md §1.5 (`TurnHistoryEntry`) and strategies.md §1 (`TurnResolution`), the `resolutions` array uses flat entries: `{ playerId, card, rowIndex, causedOverflow, collectedCards? }`. Note also the field name is `causedOverflow` (past tense), not `causesOverflow`.
- **Severity:** BREAKING — The fixture schema doesn't match the `TurnHistoryEntry` shape. Fixture tests that match the plan schema will not exercise the actual engine output type.

### GAP-FS-05 — Full-game-trace fixture uses `resolution` (singular) instead of `resolutions` (plural)
- **Category:** Schema
- **Location:** T1F line 351; T1B lines 217-221
- **Plan text:** `"resolution": [...]`
- **Should be:** `"resolutions": [...]` — matching `TurnHistoryEntry.resolutions` (engine.md §1.5)
- **Severity:** BREAKING — Field name mismatch.

### GAP-FS-06 — Full-game-trace fixture missing `rowPicks` field
- **Category:** Schema
- **Location:** T1F lines 346-356
- **Plan text:** Turn object has `plays`, `resolution`, `boardAfter` — no `rowPicks`
- **Should be:** Each turn in the trace should include `rowPicks: []` (or populated when Rule 4 triggers) per `TurnHistoryEntry`.
- **Severity:** IMPORTANT — Incomplete turn records won't round-trip through the engine.

### GAP-FS-07 — Placement fixture uses nested `placement` wrapper not matching TurnHistoryEntry
- **Category:** Schema
- **Location:** T1B multi-play schema lines 217-222
- **Plan text:**
  ```json
  { "card": 15, "playerId": "p0", "placement": { "kind": "place", "rowIndex": 0, "causesOverflow": false } }
  ```
- **Should be:** The multi-play resolution entries should match `TurnHistoryEntry.resolutions` shape:
  ```json
  { "playerId": "p0", "card": 15, "rowIndex": 0, "causedOverflow": false }
  ```
  Note: `causesOverflow` → `causedOverflow`, and no `placement` wrapper.
- **Severity:** IMPORTANT — Fixture resolution entries won't match engine output shape, causing friction during T2-GATE fixture tests.

---

## 4. Inconsistent Acceptance Criteria

### GAP-AC-01 — T5D tool count unstated (should be 12)
- **Category:** Acceptance
- **Location:** T5D, lines 803-827
- **Current state:** T5D doesn't explicitly state the total tool count. The spec's `server_info` result (mcp.md §3.1) lists 12 tools.
- **Should be:** T5D acceptance should verify `server_info.tools` array contains exactly 12 tool names.
- **Severity:** IMPORTANT — Without this check, implementing agents may miss tools.

### GAP-AC-02 — T5D tool names in stateless.ts don't match spec
- **Category:** Acceptance
- **Location:** T5D line 809
- **Plan text:** `src/mcp/tools/stateless.ts` — `server_info`, `list_strategies`, `validate_state`, `recommend` tools
- **Should be:** `src/mcp/tools/stateless.ts` — `list_strategies`, `validate_state`, `recommend_once` (per mcp.md §6; `server_info` is in `server.ts`, not `stateless.ts`). Actually the spec says `stateless.ts` contains `list_strategies, validate_state, recommend_once`.
- **Severity:** BREAKING — Wrong tool name (`recommend` vs `recommend_once`) and wrong file for `server_info`.

### GAP-AC-03 — T3A TurnResolution shape missing `resolutions` field
- **Category:** Acceptance
- **Location:** T3A line 619
- **Plan text:** `TurnResolution` shape contains at least: `turn`, `plays`, `rowPickups`, `boardAfter`
- **Should be:** `turn`, `plays`, `resolutions`, `rowPicks`, `boardAfter` (strategies.md §1)
- **Severity:** BREAKING — The `resolutions` field (per-card resolution details) is the most important addition from spec Rounds 4-6. Without it, stateful strategies cannot track per-card placement history.

### GAP-AC-04 — T5E acceptance doesn't mention `session_status` in lifecycle
- **Category:** Acceptance
- **Location:** T5E line 852
- **Plan text:** Full session lifecycle: `start_session` → `round_started` → `session_recommend` → `turn_resolved` × 10 → `round_ended` → `end_session`
- **Should be:** The lifecycle test should also exercise `session_status` at various points to verify read-only behavior.
- **Severity:** MINOR — session_status is a simple read-only tool, but should be in the lifecycle test.

### GAP-AC-05 — T6-E2E doesn't mention testing all 12 MCP tools
- **Category:** Acceptance
- **Location:** T6-E2E lines 878-893
- **Plan text:** "MCP server E2E: spawn `6nimmt serve`, send MCP tool calls via stdio, verify full session lifecycle"
- **Should be:** Should explicitly mention verifying all 12 tools are registered and callable, including `session_status` and `recommend_once` (not `recommend`).
- **Severity:** IMPORTANT — E2E test may miss the two tools that are absent from the plan.

### GAP-AC-06 — Milestone definition references `recommend` not `recommend_once`
- **Category:** Acceptance
- **Location:** Line 953
- **Plan text:** `npx 6nimmt recommend --state '<JSON>' --strategy random --format json` produces valid recommendation
- **Should be:** The CLI command IS `recommend` (this is correct for CLI). However, the MCP lifecycle on line 954 should also mention that `recommend_once` and `session_status` tools work.
- **Severity:** MINOR — CLI command name is correct; milestone just doesn't verify the two new MCP tools.

---

## 5. Harness Alignment

### GAP-HA-01 — Fixture schemas use old board format (affects T2-GATE)
- **Category:** Harness
- **Location:** T2-GATE (line 560), T1B-T1D fixture schemas
- **Current state:** If fixtures are created with `{ rows: [...] }` format per the plan, and the engine uses `number[][]` per the spec, fixture tests in T2-GATE will fail or require ad-hoc conversion.
- **Should be:** Fixture schemas in the plan must use `number[][]` board format so that fixture tests load cleanly into the engine.
- **Severity:** BREAKING — Fixtures won't work with the engine without schema adaptation.

### GAP-HA-02 — T2-GATE invariant tests don't cover updated invariants
- **Category:** Harness
- **Location:** T2-GATE lines 565-577
- **Current state:** The invariant list covers the engine.md §2.3 invariants well. However, it should be verified that the "rows strictly increasing by tail card value" invariant is listed (it is — "rows strictly increasing by tail card value" at line 570).
- **Should be:** ✅ The invariant list is mostly complete. One potential gap: the invariant "Rule 4 triggers at most once per turn" is covered at line 576.
- **Severity:** N/A — invariants are aligned.

### GAP-HA-03 — E2E tests don't cover all 12 MCP tools
- **Category:** Harness
- **Location:** T6-E2E lines 891-892
- **Plan text:** "MCP server E2E: spawn `6nimmt serve`, send MCP tool calls via stdio, verify full session lifecycle"
- **Should be:** Should explicitly verify that all 12 tools listed in `server_info.tools` are callable. Currently, `session_status` and `recommend_once` are not mentioned in E2E tests.
- **Severity:** IMPORTANT — Two tools have no E2E coverage.

---

## 6. Task Count / Summary

### GAP-SUM-01 — Task count says 31 but actual count is 33
- **Category:** Summary
- **Location:** Line 7 and line 939
- **Plan text:** "Total tasks: 31"
- **Actual count:** Counting all `### T*` headers:
  T0, T1A, T1B, T1C, T1D, T1E, T1F, T1G, T1H, T1-VERIFY, T1-CI,
  T2A, T2B, T2C, T2D, T2E, T2-GATE, T2-REVIEW,
  T3A, T3-TEST,
  T4A, T4B, T4-TEST,
  T5A, T5B, T5C, T5-TEST,
  T5D, T5E, T5F-TEST,
  T6-E2E, T6-CI, T6-REVIEW
  = **33 tasks**
- **Should be:** Either update the count to 33 or clarify which tasks are excluded from the count (e.g., if gates/reviews aren't counted as "tasks").
- **Severity:** MINOR — Cosmetic discrepancy, but confusing for planning.

---

## Summary of Findings

| Severity | Count | IDs |
|----------|-------|-----|
| **BREAKING** | 10 | GAP-ST-01, GAP-ST-02, GAP-ST-03, GAP-ST-04, GAP-ST-05, GAP-MT-01, GAP-FS-04, GAP-FS-05, GAP-AC-02, GAP-AC-03 |
| **IMPORTANT** | 13 | GAP-MT-03, GAP-MT-04, GAP-MT-06, GAP-MT-07, GAP-MT-08, GAP-MT-09, GAP-MT-12, GAP-FS-06, GAP-FS-07, GAP-AC-01, GAP-AC-05, GAP-HA-01, GAP-HA-03 |
| **MINOR** | 6 | GAP-MT-05, GAP-MT-10, GAP-MT-11, GAP-MT-13, GAP-AC-04, GAP-AC-06, GAP-SUM-01 |

**Total findings: 30**

### Critical Action Items (BREAKING)

1. **Rename `resolvedCardsThisRound` → `turnHistory`** everywhere in plan (2 occurrences)
2. **Rename `rowPickups` → `rowPicks`** and add `resolutions` to T3A acceptance
3. **Rename `recommend` → `recommend_once`** in all MCP contexts (5+ occurrences)
4. **Fix board format** from `{ rows: [...] }` to `number[][]` in all fixture schemas (7 occurrences)
5. **Add `session_status` tool** to T5E creates, T5F-TEST, and T6-E2E
6. **Fix TurnResolution shape** in T1F and T1B fixture schemas — use flat `resolutions` array, `causedOverflow`, no `placement` wrapper
7. **Fix `resolution` → `resolutions`** (plural) in fixture schemas
