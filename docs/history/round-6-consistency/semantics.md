# Round 6 Consistency Review — Semantic Precision

**Date:** 2025-07-27
**Scope:** All spec files in `spec/` — engine.md, strategies.md, mcp.md, cli.md, simulator.md
**Focus:** Ambiguity, contradictions, underspecification

---

## 1. State Machine Precision

### Finding 1 — MCP session phases differ from engine phases

**Severity:** IMPORTANT

**engine.md §1.5** defines `GamePhase`:
> `"awaiting-cards" | "resolving" | "awaiting-row-pick" | "round-over" | "game-over"`

**mcp.md §3.5** defines a different session state machine:
> `awaiting-round → in-round → [awaiting-row-pick →] in-round → awaiting-round / game-over → ... → ended`

The engine has no `"awaiting-round"` or `"in-round"` phase. The MCP server has no `"awaiting-cards"`, `"resolving"`, or `"round-over"` phase. The MCP `"in-round"` collapses engine phases `"awaiting-cards"` and `"resolving"` into one.

**Why it matters:** An implementer may assume the MCP session phases are 1:1 with engine phases. They are not — the MCP server wraps the engine with a coarser-grained state machine. This mapping is never explicitly documented.

**Resolution:** Add a mapping table in mcp.md §5.1 that shows how MCP session phases relate to engine phases:
- `awaiting-round` ≈ engine `"round-over"` (between rounds)
- `in-round` ≈ engine `"awaiting-cards"` + `"resolving"`
- `awaiting-row-pick` ≈ engine `"awaiting-row-pick"`
- `game-over` ≈ engine `"game-over"`
- `ended` = MCP-only (no engine equivalent)

---

### Finding 2 — `round_ended` not listed as allowed in `in-round` phase table

**Severity:** BLOCKING

**mcp.md §5.1** "Allowed tools per phase" table for `in-round`:
> `session_recommend(decision:"card")`, `turn_resolved`, `session_recommend(decision:"row")`, `session_status`, `resync_session`, `end_session`

`round_ended` is **not listed** as allowed in `in-round`, yet the flow diagram (§5.1) and typical flow (§9) both show `round_ended` being called from `in-round` after turn 10 to transition to `awaiting-round` or `game-over`.

The table also does not list `round_ended` in the "Rejected" column for `in-round` — it simply does not appear for that phase at all.

**Why it matters:** An implementer following the table strictly would reject `round_ended` calls during `in-round`, breaking the core game flow. The flow diagram and the table contradict each other.

**Resolution:** Add `round_ended` to the "Allowed tools" column for `in-round`. The transition occurs after turn 10 is resolved.

---

### Finding 3 — `end_session` does not require `expectedVersion`

**Severity:** MINOR

**mcp.md §5.2:**
> Read-only tools (`session_recommend`, `end_session`) do not require `expectedVersion`.

`end_session` is categorized as "read-only" even though it permanently terminates the session. It is listed alongside `session_recommend` which genuinely does not mutate state. Calling `end_session` a "read-only" tool is misleading.

**Why it matters:** An implementer might assume "read-only" means "no state change," which is false for `end_session`.

**Resolution:** Rephrase to: "Non-versioned tools (`session_recommend`, `session_status`, `end_session`) do not require `expectedVersion`." Separately note that `end_session` is destructive but exempt from versioning because it cannot conflict with other operations.

---

### Finding 4 — Initial `createGame()` returns `turn=0` but turn 0 is never valid

**Severity:** IMPORTANT

**engine.md §3.2:**
> `createGame()` returns: `round=1, turn=0, phase="round-over"`

**engine.md §4.2** (validation):
> Turn 1–10

Turn 0 exists as the initial value from `createGame()` before `dealRound()` is called. However, the validation rules say turns must be 1–10. This means the initial GameState returned by `createGame()` would fail validation if validated directly.

**Why it matters:** An implementer might add a `validateGameState()` function that checks `turn ∈ [1,10]` and it would reject the fresh game state. The specification should clarify that turn=0 is a sentinel value for "no turn yet" that only exists in the `round-over` phase.

**Resolution:** Add a note to §3.2: "Turn 0 is a sentinel indicating no turn has started. It is valid only in the `round-over` phase before the first `dealRound()`. The validation rules in §4 apply to visible state (CardChoiceState/RowChoiceState), not the internal GameState."

---

### Finding 5 — `createGame()` returns `phase="round-over"` for a game that hasn't started

**Severity:** MINOR

**engine.md §3.2:**
> `createGame()` returns: `round=1, turn=0, phase="round-over"`

A brand-new game starts in `"round-over"` phase. Semantically, no round has ended — the phase is used as a convenient entry point for the `dealRound()` transition (which requires `"round-over"`). This is pragmatic but unintuitive.

**Why it matters:** A developer reading the code may wonder why a game that hasn't started is in "round-over." The rationale is implicit (it's the precondition for `dealRound()`).

**Resolution:** Add a brief comment: "The initial `round-over` phase is a bootstrap state — no round has actually ended. It exists so that the first `dealRound()` call follows the same precondition as subsequent rounds."

---

## 2. Version Increment Edge Cases

### Finding 6 — `resync_session` version increment semantics unspecified

**Severity:** IMPORTANT

**mcp.md §5.2:**
> `sessionVersion` increments on every mutating tool call (`round_started`, `turn_resolved`, `round_ended`, `resync_session`).

**mcp.md §3.10** shows a resync result with `sessionVersion: 10`.

The spec says resync increments the version, but by how much? Does it increment by exactly 1 (like other mutating tools), or does it reset to some computed value? The resync replays turnHistory entries internally — do those replays also increment the version?

**Why it matters:** If an agent calls `resync_session` and the server internally replays 5 turnHistory entries, does the version go up by 1 or by 6? The agent needs to know the post-resync version to send the next `expectedVersion`.

**Resolution:** Explicitly state: "`resync_session` increments `sessionVersion` by exactly 1 regardless of how many turnHistory entries are replayed internally. Internal replays are reconstruction steps, not discrete events." The result already returns the new version, so the agent can read it — but the semantics should still be documented.

---

### Finding 7 — `DUPLICATE_EVENT` version behavior not explicitly stated

**Severity:** MINOR

**mcp.md §4.2:**
> `DUPLICATE_EVENT` — Exact same round/turn AND same payload already processed. Safe to ignore — no state change. Response includes `currentVersion` for convenience.

"No state change" implies the version does not increment, but this is never explicitly stated.

**Why it matters:** An implementer must know whether to increment the version when returning DUPLICATE_EVENT. The phrase "no state change" should be sufficient but could be clearer.

**Resolution:** Add: "The `sessionVersion` does not increment for DUPLICATE_EVENT responses."

---

## 3. Scoring Rules

### Finding 8 — Initial score of 0 not explicitly stated for all players

**Severity:** MINOR

**engine.md §1.4:**
> `readonly score: number;`

**engine.md §3.2:**
> `createGame()` returns: `score=0 for all players`

The initial score is stated in the `createGame()` docstring. However, the `PlayerState` interface does not specify a default value — `score: number` could be anything.

**Why it matters:** Low risk — the `createGame()` docs are clear. But the `PlayerState` type alone doesn't convey the invariant.

**Resolution:** Add a comment to `PlayerState.score`: `/** Cumulative score across all rounds. Starts at 0. */`  — actually this is already partially done: the comment says "Cumulative score across all rounds." Adding "Starts at 0" would complete it.

---

### Finding 9 — Game-over threshold check timing is clear but scattered

**Severity:** MINOR

**engine.md §2.1:**
> `isGameOver()` is checked **only after scoring a round** — never mid-round.

**mcp.md §3.8:**
> Used for game-over detection (any player ≥ 66).

Both are consistent. The game-over check happens after `scoreRound()` in the engine, and after `round_ended` in MCP. No contradiction found.

**Resolution:** None needed — this is consistent across files.

---

### Finding 10 — Multiple players exceeding 66 not explicitly addressed

**Severity:** MINOR

**engine.md §2.1:**
> If any player's `score ≥ 66`, phase becomes `"game-over"`.

**engine.md §2.4:**
> If multiple players share the lowest score at game end, they all win (shared victory).

The spec handles the case where multiple players exceed 66: the game ends, and the winner is whoever has the lowest score. But it does not explicitly state what happens if *all* players exceed 66 in the same round. The tie-breaking rule (§2.4) covers this — the lowest score wins regardless.

**Resolution:** None strictly needed, but a clarifying note could help: "If multiple players exceed 66 in the same round, the game still ends and the player(s) with the lowest cumulative score win."

---

## 4. Turn/Round Numbering

### Finding 11 — Seed derivation uses different separator formats

**Severity:** MINOR

**engine.md §2.2:**
> `perRoundSeed = SHA256(gameSeed + '/' + round)`

**simulator.md §6:**
> `hash(batchSeed + gameIndex)` and `hash(gameSeed + round)`

The engine spec uses `'/'` as separator (`gameSeed + '/' + round`) but the simulator spec omits the separator (`gameSeed + round`). For batch seeds, there's `batchSeed + gameIndex` with no separator.

**Why it matters:** String concatenation without a separator is ambiguous: is seed `"abc"` + round `12` → `"abc12"` or `"abc/12"`? Without a separator, seed `"abc1"` + round `2` would collide with seed `"abc"` + round `12`.

**Resolution:** Standardize all seed derivation to use the `'/'` separator as engine.md specifies: `SHA256(batchSeed + '/' + gameIndex)` and `SHA256(gameSeed + '/' + round)`. Update simulator.md §6 to match.

---

## 5. Card Validity Rules

### Finding 12 — Card uniqueness across all locations is well-specified

**Severity:** (No issue)

**engine.md §2.3:**
> All cards across board rows, player hands, player collected piles, and undealt deck are **unique** (no duplicates). The total cards across all locations equals 104.

This is clear and unambiguous. Cards 1–104 are unique across the entire game. No contradictions found.

---

## 6. Row Rules

### Finding 13 — "6th card triggers overflow" is implicit, not always explicit

**Severity:** MINOR

**engine.md §1.2:**
> A row is an ordered list of cards (1–5 cards). Length 1–5. If 5, next placement triggers overflow.

**engine.md §3.3:**
> Overflow collection (rule 3 — 6th card on a row) is automatic.

The "6 Nimmt" name meaning "6th card takes" is consistent with the spec — row holds 1–5 cards, and the 6th card triggers overflow. However, the spec never explicitly says "the 6th card placed on a row causes the player to collect all 5 existing cards." It says "next placement triggers overflow" and "overflow collection is automatic."

**Why it matters:** Low risk — the combination of "length 1–5" and "next placement triggers overflow" is unambiguous. But an implementer unfamiliar with the game rules might not realize the placed card then *starts a new row* with just itself.

**Resolution:** Add to §1.2 or §3.3: "When overflow occurs, the player collects all 5 existing cards as penalty, and their played card becomes the sole card in that row."

---

## 7. Strategy Interface Contracts

### Finding 14 — `chooseCard()` return value validation specified only in strategies.md

**Severity:** MINOR

**strategies.md §2:**
> **Card not in hand** → engine error (bug in strategy). The simulator logs the error and forfeits the player's turn by playing their lowest card.
> **Row index out of range** → engine error. The simulator picks the row with the fewest cattle heads.
> **Strategy throws** → caught by the simulator, logged, and treated as forfeit.

**engine.md §3.4:**
> `resolveTurn()` precondition: "each played card must be in the corresponding player's hand."

The engine throws on invalid input. The simulator catches and applies fallback behavior. This is consistent — the simulator wraps the engine. But the MCP server's behavior for strategy errors is not specified anywhere.

**Why it matters:** If a strategy throws during `session_recommend`, what does the MCP server return? The `recommend_once` tool mentions `strategyFallback: true`, but `session_recommend` has no such field in its result schema.

**Resolution:** Add `strategyFallback` field to `session_recommend` result, or document that session strategies use the same fallback behavior (lowest card / fewest-heads row) and the `stateWarnings` array reports the fallback.

---

### Finding 15 — Lifecycle hooks optionality not enforced by type system

**Severity:** MINOR

**strategies.md §1:**
> `onGameStart?`, `onTurnResolved?`, `onRoundEnd?` — all marked optional with `?`.

The TypeScript `?` suffix makes these optional at the type level. The spec (strategies.md §6) also says:
> Strategies that don't implement `onGameStart` (and thus have no `rng`) must be fully deterministic.

This is clear. No issue.

---

## 8. MCP Session Semantics

### Finding 16 — Session reuse not explicitly forbidden or allowed

**Severity:** IMPORTANT

**mcp.md §3.5:**
> One session = one live game.

**mcp.md §3.12:**
> After `end_session`, the `sessionId` is invalid.

The spec says one session = one live game, and ending a session invalidates it. But can a session in `game-over` phase be "restarted" for a new game without calling `end_session` first? The only tool allowed in `game-over` is `end_session` (per the phase table), so the answer is implicitly "no" — you must end and create a new session.

**Why it matters:** An implementer might try to call `resync_session` from `game-over` to start a "new game." The phase table forbids this (resync is not listed in game-over), but this isn't called out explicitly.

**Resolution:** Add a note: "A session cannot be reused for a new game. After game-over, the agent must call `end_session` and then `start_session` to begin a new session."

---

### Finding 17 — Session expiry measured from "last tool call" is ambiguous

**Severity:** IMPORTANT

**mcp.md §5.6:**
> Sessions expire after **30 minutes** of inactivity (no tool calls for that session).

"No tool calls for that session" is reasonably clear — it means 30 minutes since the last tool call targeting that specific sessionId. But:
- Does `session_status` (read-only) reset the timer? Presumably yes, since it's a "tool call."
- Does a failed tool call (e.g., returning `INVALID_PHASE`) reset the timer? Presumably yes.
- Does a tool call to a *different* session reset this session's timer? Presumably no.

**Why it matters:** The implementer needs to know what counts as "activity" for expiry purposes.

**Resolution:** Add: "Any tool call that includes a valid `sessionId` resets the inactivity timer for that session, regardless of whether the call succeeds or fails. Tool calls to other sessions do not affect this session's timer."

---

### Finding 18 — `maxConcurrentSessions: 4` scope unclear

**Severity:** MINOR

**mcp.md §3.1:**
> `maxConcurrentSessions: 4`

**mcp.md §5.4:**
> The server supports up to 4 concurrent sessions.

**cli.md §2 (serve command):**
> `--max-sessions` number, default `4`

The limit is per server process (since sessions are in-memory per §5.3). This is implicit but could be clearer.

**Resolution:** Add: "per server process instance" after the limit. Since one `6nimmt serve` process = one MCP server, this is per-process.

---

## 9. Drift Detection Semantics

### Finding 19 — "Minor drift" vs "Major drift" threshold undefined

**Severity:** BLOCKING

**mcp.md §3.9:**
> - **Minor drift** (`stateConsistent: false`, `stateWarnings` populated): Agent snapshot differs slightly.
> - **Major drift** → returns `STATE_MISMATCH` error recommending `resync_session`.

The spec distinguishes minor and major drift but provides no definition of what constitutes each. What counts as "differs slightly" vs. "diverged significantly"?

Examples of ambiguous cases:
- Hand has 1 extra card (minor or major?)
- Board has same cards but different row assignment (minor or major?)
- One row has an extra card not tracked by server (minor or major?)
- All 4 rows match but in different order (minor or major?)

**Why it matters:** Without explicit thresholds, two implementations could categorize the same drift differently, leading to inconsistent recovery behavior.

**Resolution:** Define explicit thresholds. Suggested:
- **Minor drift:** Board cards match but order within a row differs, OR hand size differs by ≤ 1 card, OR board has ≤ 2 unexpected cards.
- **Major drift (STATE_MISMATCH):** Hand size differs by > 1, OR board has > 2 unexpected cards, OR board row count ≠ 4, OR total card count is inconsistent.

Alternatively, define minor drift as "recommendation can still be produced using agent-provided snapshot" and major drift as "agent-provided state is internally inconsistent or contradicts known game progression."

---

### Finding 20 — Drift detection comparison target unclear

**Severity:** IMPORTANT

**mcp.md §3.9:**
> The server compares the agent-provided `hand` and `board` against its accumulated session state.

What is the "accumulated session state"? The MCP server receives board state through `round_started` (initial board), `turn_resolved` (boardAfter), and `resync_session`. Does the server maintain its own shadow board by applying resolutions, or does it only use the last `boardAfter` received?

**Why it matters:** If the server computes a shadow board from resolutions, drift detection catches resolution errors. If it only stores the last `boardAfter`, it's comparing agent-provided state against agent-provided state (circular).

**Resolution:** Specify: "The server maintains a shadow board state by applying each `turn_resolved` resolution to its internal state. When `boardAfter` is provided in `turn_resolved`, it is compared against the server's computed board for validation. The drift comparison in `session_recommend` compares the agent-provided snapshot against this server-computed shadow state."

---

## 10. Cross-File Contradictions

### Finding 21 — `TurnResolution` vs `TurnHistoryEntry` structural mismatch

**Severity:** IMPORTANT

**strategies.md §1** defines `TurnResolution`:
```typescript
interface TurnResolution {
  readonly turn: number;
  readonly plays: readonly { playerId: string; card: CardNumber }[];
  readonly rowPickups: readonly { ... }[];
  readonly boardAfter: Board;
}
```

**engine.md §1.5** defines `TurnHistoryEntry`:
```typescript
interface TurnHistoryEntry {
  readonly turn: number;
  readonly plays: readonly { playerId: string; card: CardNumber }[];
  readonly resolutions: readonly { ... }[];
  readonly rowPicks: readonly { ... }[];
  readonly boardAfter: readonly CardNumber[][];
}
```

Key differences:
1. `TurnResolution` has `rowPickups`; `TurnHistoryEntry` has `rowPicks`. Different names.
2. `TurnResolution` has no `resolutions` field; `TurnHistoryEntry` does.
3. `TurnResolution.boardAfter` is `Board`; `TurnHistoryEntry.boardAfter` is `readonly CardNumber[][]`.

**Why it matters:** strategies.md §7.1 says turnHistory entries "directly map to a TurnResolution." But they don't — `TurnHistoryEntry` has a superset of fields with different names and types. An implementer must write a mapping function, but the spec implies direct compatibility.

**Resolution:** Either:
(a) Align the two types — make `TurnResolution` include `resolutions` and use `rowPicks` (matching `TurnHistoryEntry`), or
(b) Explicitly document the mapping: `TurnHistoryEntry.rowPicks` → `TurnResolution.rowPickups`, `TurnHistoryEntry.boardAfter` (serialized) → `TurnResolution.boardAfter` (typed Board), and note that `resolutions` is available but not part of `TurnResolution`.

---

### Finding 22 — `mcp.md` `turn_resolved` field `rowPicks` vs strategies.md `rowPickups`

**Severity:** IMPORTANT

**mcp.md §3.7** uses `rowPicks`:
> `rowPicks: { playerId: string, rowIndex: number, collectedCards: number[] }[]`

**strategies.md §1** uses `rowPickups`:
> `readonly rowPickups: readonly { playerId: string; rowIndex: number; collectedCards: readonly CardNumber[]; }[]`

**engine.md §1.5** uses `rowPicks`:
> `readonly rowPicks: readonly { playerId: string; rowIndex: number; collectedCards: readonly CardNumber[] }[]`

The field is named `rowPicks` in engine.md and mcp.md but `rowPickups` in strategies.md.

**Why it matters:** An implementer mapping between these types will hit a naming mismatch. This is likely a typo/inconsistency.

**Resolution:** Standardize on one name. `rowPicks` is used in 2 of 3 files, so rename `TurnResolution.rowPickups` to `rowPicks` in strategies.md.

---

### Finding 23 — `recommend_once` has `strategyFallback` but `session_recommend` does not

**Severity:** IMPORTANT

**mcp.md §3.4** (`recommend_once` result):
> `strategyFallback: false`

**mcp.md §3.9** (`session_recommend` result):
> No `strategyFallback` field in result schema.

If a session strategy throws during `session_recommend`, the agent has no way to know a fallback was used.

**Resolution:** Add `strategyFallback: boolean` to the `session_recommend` result schema, with the same semantics as `recommend_once`.

---

### Finding 24 — `recommend_once` result has `stateValid` but `session_recommend` has `stateConsistent`

**Severity:** MINOR

**mcp.md §3.4:**
> `stateValid: true`, `stateWarnings: []`

**mcp.md §3.9:**
> `stateConsistent: true`, `stateWarnings: []`

Different field names for similar concepts. `recommend_once` validates the state internally (is it well-formed?). `session_recommend` compares the state against session history (does it match?). These are semantically different checks, so different names may be intentional — but this should be explicitly noted.

**Resolution:** Add a note explaining the difference: "`stateValid` (in `recommend_once`) indicates whether the provided state passes structural validation. `stateConsistent` (in `session_recommend`) indicates whether the provided state matches the server's accumulated session state. Both can surface `stateWarnings`."

---

### Finding 25 — `session_recommend` result in `awaiting-row-pick` doesn't list `round_ended` as rejected

**Severity:** MINOR

**mcp.md §5.1** phase table for `awaiting-row-pick`:
> Rejected: `session_recommend(decision:"card")`, `round_started`, `round_ended`

`round_ended` is correctly listed as rejected in `awaiting-row-pick`. This is consistent — you can't end a round mid-turn resolution. No issue.

---

### Finding 26 — `resync_session` phase determination ambiguous for turn=0

**Severity:** IMPORTANT

**mcp.md §3.10:**
> After resync, phase is always `in-round` (if `turn` > 0 within a round) or `awaiting-round` (if at a round boundary).

What does "at a round boundary" mean? If `turn` is provided as `0`, does that mean "round boundary"? The spec doesn't specify valid turn values for resync. Engine turn 0 is the sentinel from `createGame()`.

**Why it matters:** If the agent calls `resync_session` between rounds (after round_ended, before round_started), what turn value should it provide? The previous round's turn 10? Or 0?

**Resolution:** Specify: "If `turn` is 0 or omitted, phase is set to `awaiting-round`. If `turn` is 1–10, phase is set to `in-round`. The agent should provide `turn: 0` (or the special value indicating 'between rounds') when resyncing at a round boundary."

---

### Finding 27 — Cascading Rule 4 contradicts engine invariant

**Severity:** IMPORTANT

**mcp.md §3.9 note:**
> In rare cases, multiple players' cards may trigger Rule 4 in the same turn.

**engine.md §2.3 invariant:**
> **Rule 4 (must-pick-row) can trigger at most once per turn**, and only for the lowest-valued card in that turn. Once that card becomes a row tail, all subsequent cards (which have higher values) will always find at least one eligible row.

**engine.md §3.2:**
> `applyRowPick()` note: "rule 4 can only trigger once per turn (for the lowest card), so the returned result will always be { kind: "completed" }."

The engine explicitly states Rule 4 triggers at most once per turn. The MCP spec says "in rare cases, multiple players' cards may trigger Rule 4." This is a direct contradiction.

**Why it matters:** This is a factual contradiction about game mechanics. The engine invariant is mathematically correct — after the lowest card picks a row and becomes a new tail, all remaining cards (being higher) will find at least one row with a tail lower than them. The MCP note is wrong.

**Resolution:** Remove the "cascading Rule 4 picks" paragraph from mcp.md §3.9. Rule 4 can only trigger once per turn. The `resolutionIndex` field's documentation should be simplified to: "Always 0 for Rule 4 picks, since only the lowest card in a turn can trigger Rule 4."

---

## Summary

| # | Severity | Area | Summary |
|---|----------|------|---------|
| 1 | IMPORTANT | State machine | MCP session phases ≠ engine phases (no mapping) |
| 2 | BLOCKING | State machine | `round_ended` missing from `in-round` allowed tools |
| 3 | MINOR | State machine | `end_session` misleadingly called "read-only" |
| 4 | IMPORTANT | Turn numbering | `turn=0` from `createGame()` conflicts with validation rules |
| 5 | MINOR | State machine | `createGame()` returning `phase="round-over"` is unintuitive |
| 6 | IMPORTANT | Versioning | `resync_session` version increment amount unspecified |
| 7 | MINOR | Versioning | `DUPLICATE_EVENT` version non-increment not explicit |
| 8 | MINOR | Scoring | Initial score=0 not in `PlayerState` comment |
| 9 | — | Scoring | Game-over timing is consistent (no issue) |
| 10 | MINOR | Scoring | Multiple players >66 scenario implicitly handled |
| 11 | MINOR | Seed derivation | Inconsistent separator in hash formulas |
| 12 | — | Cards | Card uniqueness is well-specified (no issue) |
| 13 | MINOR | Rows | Overflow mechanics could be more explicit |
| 14 | MINOR | Strategy | `session_recommend` missing `strategyFallback` field |
| 15 | — | Strategy | Lifecycle hooks optionality is clear (no issue) |
| 16 | IMPORTANT | Sessions | Session reuse not explicitly forbidden |
| 17 | IMPORTANT | Sessions | Expiry activity definition ambiguous |
| 18 | MINOR | Sessions | `maxConcurrentSessions` scope unclear |
| 19 | BLOCKING | Drift | Minor vs major drift threshold undefined |
| 20 | IMPORTANT | Drift | Shadow board computation not specified |
| 21 | IMPORTANT | Cross-file | `TurnResolution` vs `TurnHistoryEntry` structural mismatch |
| 22 | IMPORTANT | Cross-file | `rowPicks` vs `rowPickups` naming inconsistency |
| 23 | IMPORTANT | Cross-file | `strategyFallback` missing from `session_recommend` |
| 24 | MINOR | Cross-file | `stateValid` vs `stateConsistent` different names |
| 25 | — | Cross-file | `awaiting-row-pick` rejected tools correct (no issue) |
| 26 | IMPORTANT | Resync | Phase determination for `turn=0` ambiguous |
| 27 | IMPORTANT | Cross-file | Cascading Rule 4 in mcp.md contradicts engine invariant |

**Totals:** 2 BLOCKING, 12 IMPORTANT, 9 MINOR, 4 no-issue confirmations
