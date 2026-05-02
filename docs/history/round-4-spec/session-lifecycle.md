# Round 4 Review — Session Lifecycle Correctness

> Reviewer focus: MCP session state machine, versioning, drift detection, and recovery

## 🔴 BLOCKING

### 1. No game-over state or signal

- **mcp.md §3.8/§5.1:** `round_ended` always returns `phase:"awaiting-round"`
- **engine.md §2.1:** Game ends when any player hits 66+ after scoring

Agent cannot distinguish "start next round" from "game is over".

**Recommendation:** Add `game-over` phase or `gameOver: true` + `finalScores` in `round_ended` response. Make `round_started` invalid after game over.

### 2. Idempotency/versioning contract is internally inconsistent

- §5.2 says version mismatch → `VERSION_MISMATCH`
- §3.7 says duplicate round/turn → `DUPLICATE_EVENT`
- A retry after timeout has old version → gets `VERSION_MISMATCH`, not `DUPLICATE_EVENT`
- `resync_session` is mutating but exempt from version requirement

**Recommendation:** Define one consistent rule set:
- Identical replay of applied event (same round/turn + same payload) → `DUPLICATE_EVENT`
- Same round/turn, different payload → new `EVENT_CONFLICT` error
- `resync_session` takes `expectedVersion` or is explicitly exempted with rationale

### 3. Row-pick lifecycle missing from session model

- Agent's card triggers Rule 4 mid-turn → needs row recommendation BEFORE `turn_resolved`
- `session_recommend(row)` requires `triggeringCard` but lacks `revealedThisTurn`, `resolutionIndex`
- No `awaiting-row-pick` session phase defined

**Recommendation:** Add partial-turn state or dedicated mid-turn tool. Define interaction order: card placements observed → row pick needed → `session_recommend(row)` → agent acts → `turn_resolved` with full results.

## 🟡 IMPORTANT

### 4. Drift detection criteria undefined

- "Minor drift" vs "major drift" has no definition
- Same input could be classified differently by different implementations
- Unclear whether hand vs board vs score mismatch triggers different severity

**Recommendation:** Define exact per-field comparison rules:
- Hand mismatch → always major (STATE_MISMATCH)
- Board mismatch → major if >1 card differs, warning if 1 card
- Score mismatch → informational warning
- All drift detection must be deterministic

### 5. Recovery contract ambiguous after `resync_session`

- Returns new `sessionVersion` but never says agent must use it for next call
- Unclear which phases allow resync
- Stale DOM snapshot in resync not handled

**Recommendation:** Explicitly state: use returned version for next mutating call. Allow resync from `in-round` and `awaiting-round`. Reject obviously stale snapshots.

### 6. Read-only/destructive call races undefined

- `turn_resolved` and `session_recommend` arrive simultaneously → recommendation computed against unclear state
- `end_session` is destructive but has no version guard

**Recommendation:** Define per-session serialization of tool execution (FIFO), or add `expectedVersion` to `session_recommend` and `end_session`.

### 7. No session expiry/cleanup policy

- Sessions are ephemeral, max 4 concurrent
- No idle timeout defined
- Orphaned sessions exhaust capacity

**Recommendation:** Define inactivity timeout (e.g., 30 minutes), eviction behavior, and error (`SESSION_EXPIRED`).

## 🟢 MINOR

### 8. Concurrent strategy isolation should be stated explicitly

Text implies independence but doesn't explicitly say each session gets its own strategy instance even with same strategy name.

**Recommendation:** Add: "Same strategy name may be used by multiple sessions; each gets an independent instance and RNG state."

### 9. Edge-case flows should be documented as normative examples

Several valid flows are inferable but not explicit:
- Turn 1 round 1: `round_started` → immediate `session_recommend` (no prior `turn_resolved`)
- Another player triggers Rule 4: appears only in `turn_resolved.placements`
- This player triggers Rule 4: call row recommendation BEFORE `turn_resolved`

**Recommendation:** Add these as explicit examples in §9.
