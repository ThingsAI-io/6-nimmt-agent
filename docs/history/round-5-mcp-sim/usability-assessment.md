# Round 5 — MCP Agentic Usability Assessment

> Reviewer: Agentic Simulation (Round 5)
> Scope: MCP protocol fitness-for-purpose as an LLM agent interface
> Spec version: mcp.md (post–Round 4 fixes)

---

## 1. Tool Discoverability

### Analysis

The 11-tool surface is well-partitioned into three categories an LLM can learn from a single system prompt paragraph:

| Category | Tools | Pattern |
|----------|-------|---------|
| **Discovery** (0 sessions) | `server_info`, `list_strategies`, `validate_state`, `recommend_once` | Stateless, read-only |
| **Session lifecycle** | `start_session`, `end_session`, `resync_session` | Imperative verbs |
| **Session events** | `round_started`, `turn_resolved`, `round_ended`, `session_recommend` | Past-tense events + one imperative |

**Naming conventions.** The event-style past tense (`round_started`, `turn_resolved`, `round_ended`) is intuitive — it matches the mental model "I observed this on BGA, I'm reporting it." However, `session_recommend` breaks the pattern; it's imperative rather than observational. An agent must learn that event tools _report_ while `session_recommend` _requests_.

**`recommend_once` vs `session_recommend`.** These are easily confused. The `_once` suffix implies "do it once" but not "stateless." A naive agent might call `recommend_once` inside a session loop and lose all strategy history. The Round 4 review flagged this (F9); the rename from `recommend` to `recommend_once` helps but doesn't fully resolve confusion. The critical difference — stateless vs session-aware — is only apparent from reading descriptions, not from names.

**Session state machine.** The 5-phase model (`awaiting-round` → `in-round` → `awaiting-row-pick` → `game-over` → `ended`) is compact enough for a system prompt. The `phase` field returned in every mutating response gives the agent a reliable signal for what to do next. However, the `awaiting-row-pick` phase is entered implicitly (when `session_recommend(decision:"row")` is called) rather than by an explicit server transition, which is subtly different from the other phase changes that happen via event reporting.

### Score: 4/5

The naming is mostly clear and the category split is intuitive. One point deducted for the `recommend_once` / `session_recommend` naming ambiguity and the `session_recommend` pattern break.

---

## 2. Context Window Pressure

### Per-Game Context Budget

The agent must track these values across the full game:

| Data | Size (tokens est.) | Lifetime |
|------|--------------------|----------|
| `sessionId` | ~10 | Entire game |
| `sessionVersion` | ~5 | Updated every mutating call |
| `playerId` | ~10 | Entire game |
| Current round/turn | ~10 | Updated each turn |
| Hand (up to 10 cards) | ~30 | Per-round, shrinks each turn |
| Board (4 rows × up to 5 cards) | ~60 | Updated each turn |
| Player IDs (5 players) | ~50 | Entire game |
| Scores (5 players) | ~30 | Updated each round |
| Strategy name | ~5 | Entire game |
| Phase | ~10 | Updated each turn |
| **Subtotal (running state)** | **~220 tokens** | |

### Per-Turn Tool Call Cost

| Tool Call | Request tokens (est.) | Response tokens (est.) | Notes |
|-----------|-----------------------|------------------------|-------|
| `server_info` | ~20 | ~80 | Once per game |
| `list_strategies` | ~15 | ~60 | Once per game |
| `start_session` | ~60 | ~70 | Once per game |
| `round_started` | ~120 | ~40 | Once per round (board + hand) |
| `session_recommend` (card) | ~100 | ~100 | Once per turn |
| `session_recommend` (row) | ~150 | ~80 | Rare (Rule 4) |
| `turn_resolved` | ~250 | ~40 | Once per turn (heaviest request) |
| `round_ended` | ~80 | ~60 | Once per round |
| `end_session` | ~20 | ~30 | Once per game |
| `resync_session` | ~300 | ~50 | Recovery only |
| `recommend_once` | ~250 | ~100 | Fallback only |
| `validate_state` | ~200 | ~40 | Debugging only |

### Full-Game Token Estimate (5 rounds, 50 turns, 5 players)

```
Setup:        server_info + list_strategies + start_session  ≈   305 tokens
Per round:    round_started + (session_recommend + turn_resolved) × 10 + round_ended
              = 120+40 + (100+100 + 250+40) × 10 + 80+60
              = 160 + 490×10 + 140
              = 5,200 tokens per round
5 rounds:     305 + 5,200 × 5 + 50 (end_session)
              ≈ 26,355 tokens total for tool I/O
```

This is **highly manageable** for modern LLMs (128K+ context windows). Even with system prompt, BGA DOM context, and conversation history, the MCP protocol adds ~26K tokens — well within budget.

### Response Compactness

Responses are appropriately compact. The `accepted: true` pattern avoids verbose confirmations. The `alternatives` array in recommendations is bounded (typically 1–3 items). The `stateWarnings` array is empty in the happy path.

**One concern:** `turn_resolved` _requests_ are the heaviest payload (~250 tokens for 5 players). With `plays` (5 entries), `resolutions` (5 entries), optional `rowPicks`, and `boardAfter`, this is unavoidable — the data is genuinely needed. But serializing `boardAfter` redundantly (the server could compute it from `resolutions` + previous board) adds ~60 tokens per call, or ~3,000 tokens per game.

### Score: 5/5

Token efficiency is excellent. The protocol adds minimal overhead relative to context window sizes. The heaviest per-call cost (`turn_resolved`) is unavoidable given the data semantics.

---

## 3. Decision Burden

### Decision Tree: "BGA shows cards revealed"

When BGA reveals all players' cards for a turn, the agent's decision tree is:

```
BGA: Cards revealed
  │
  ├─ Is my card lower than ALL row tails?
  │   ├─ YES (Rule 4 triggers for me)
  │   │   ├─ Call session_recommend(decision:"row", triggeringCard, revealedThisTurn, ...)
  │   │   ├─ Execute row pick on BGA
  │   │   ├─ Wait for BGA to finish resolving
  │   │   └─ Call turn_resolved(plays, resolutions, rowPicks, boardAfter)
  │   │
  │   └─ NO (normal resolution or someone else triggers Rule 4)
  │       ├─ Wait for BGA to finish resolving all cards
  │       └─ Call turn_resolved(plays, resolutions, rowPicks, boardAfter)
  │
  └─ After turn_resolved accepted:
      ├─ Is this turn 10?  → Wait for round_ended signal from BGA
      └─ Is this turn < 10? → Call session_recommend(decision:"card") for next turn
```

**Key ambiguity: When is turn resolution "complete"?** BGA animates card placements sequentially. The agent must wait for ALL animations to finish before reading `boardAfter`. There is no MCP-level signal for "animations done" — this is entirely a BGA DOM skill responsibility. The spec correctly delegates this to the BGA navigation skill, but an agent with no guidance could read the board mid-animation and get a partial `boardAfter`.

**Rule 4 signal clarity.** The spec clearly differentiates:
- **Agent's own Rule 4:** Agent detects its card < all row tails → calls `session_recommend(decision:"row")` before `turn_resolved`
- **Another player's Rule 4:** Appears in `turn_resolved.rowPicks` array — agent just reports it

This is well-designed. The agent can detect Rule 4 purely from card values (deterministic), and the `rowPicks` field explicitly captures forced picks by others.

**Remaining ambiguity: `resolutions` ordering.** The spec says "ordered lowest card first." BGA may or may not animate in this order. If BGA animates by table position rather than card value, the agent must reorder before calling `turn_resolved`. This is a BGA skill implementation detail but could trip up an LLM agent that reads DOM mutations in animation order.

### Score: 4/5

The decision tree is mostly unambiguous. Points deducted for the animation-completion timing gap and potential `resolutions` ordering mismatch with BGA's visual presentation.

---

## 4. Error Recovery UX

### Recovery Ladder Clarity

The spec (§5.5) defines a clear 5-step escalation ladder:

| Step | Trigger | Action |
|------|---------|--------|
| 1 | `VERSION_MISMATCH` | Retry with `currentVersion` from error |
| 2 | `STATE_MISMATCH` | Call `resync_session` with current BGA DOM |
| 3 | `resync_session` fails | `end_session` → `start_session` → `resync_session` |
| 4 | `UNKNOWN_SESSION` | `start_session` fresh |
| 5 | Process died | Restart `6nimmt serve` → `start_session` |

**VERSION_MISMATCH is self-healing.** The error response includes `currentVersion`, so the agent can immediately retry. This is a textbook optimistic concurrency recovery pattern.

**DUPLICATE_EVENT is a no-op.** The agent can safely ignore it and proceed. Combined with `EVENT_CONFLICT` (which signals actually conflicting data), this distinction prevents the agent from silently losing data.

**Actionability of error messages.** Each domain error includes:
- `code` (machine-readable)
- `recoverable` (boolean — tells agent "try again" vs "give up this path")
- `message` (human-readable explanation)
- `details` (contextual data like `currentVersion`, `validStrategies`)

This is well-designed for LLM agents. The `recoverable` boolean is especially valuable — it directly answers "retry same call vs do something different."

### Concern: Error Loop Detection

The spec doesn't define a maximum retry count or circuit breaker. An agent could:
1. Hit `VERSION_MISMATCH` → retry → `VERSION_MISMATCH` again (if another concurrent tool call also bumps version)
2. Hit `STATE_MISMATCH` → resync → `STATE_MISMATCH` again (if BGA DOM is still unstable)

The recovery ladder is linear (escalate on failure), but there's no explicit "after 3 retries at the same level, escalate." An LLM agent would need this in its system prompt.

**Recommendation:** Add guidance like "If the same error recurs 3 times at the same recovery level, escalate to the next level."

### Score: 4/5

The recovery model is clean and self-documenting. The `recoverable` flag is excellent. One point deducted for missing circuit-breaker guidance.

---

## 5. BGA Integration Friction

### 5.1 Player ID Mapping

**Problem:** `start_session` requires `playerId` (a string identifier). BGA shows usernames in the DOM. The agent must establish a mapping between BGA usernames and the `playerId` values used throughout the session.

**Current spec:** `playerId` is described as "e.g., BGA username." This is underspecified. If the agent uses BGA usernames directly as `playerId` values, the mapping is trivial. But if BGA internal IDs differ from display names (which they do — BGA uses numeric user IDs internally), there's a translation layer.

**Recommendation:** Explicitly state that `playerId` should be BGA username (the display name the agent sees in the DOM). This removes all ambiguity.

### 5.2 `boardAfter` Reliability

The `turn_resolved.boardAfter` field requires the agent to read the board state after all animations complete. This is fragile because:

1. **Animation timing varies.** BGA uses JavaScript animations with variable durations.
2. **DOM mutations are incremental.** Cards move one at a time; reading mid-animation yields partial state.
3. **Row overflow adds complexity.** When a row overflows, BGA animates: (a) collecting 5 cards, (b) placing the new card. The board is in an intermediate state between these steps.

**Mitigation in spec:** `boardAfter` serves as a consistency check — the server could theoretically compute it from `resolutions` + previous board. If the spec made `boardAfter` optional and used it purely for drift validation, the agent could skip it when animation state is uncertain.

**Recommendation:** Consider making `boardAfter` optional, with the server computing expected board state from `resolutions`. If provided, use for drift detection. If omitted, trust `resolutions`.

### 5.3 `revealedThisTurn` for Row-Pick

When the agent's card triggers Rule 4, `session_recommend(decision:"row")` requires `revealedThisTurn: [{playerId, card}]`. The agent must capture all revealed cards before BGA starts resolving placements.

**Challenge:** BGA may reveal cards and immediately begin animating placements. The window to capture `revealedThisTurn` may be brief. If the agent misses a card (e.g., DOM mutation timing), the `revealedThisTurn` array is incomplete, degrading strategy quality.

**Mitigating factor:** Since the agent's card is the lowest (that's why Rule 4 triggers), all other cards must be higher. The agent has time to read them because BGA resolves lowest card first — and that lowest card is the agent's, which triggers the row-pick prompt before any other resolution animations.

### 5.4 `resolutions` Array Ordering

The spec requires `resolutions` "ordered lowest card first." BGA's visual resolution order may differ (e.g., by table position or animation sequence). The agent must:
1. Read all card placements from the DOM
2. Sort them by card value ascending
3. Pass to `turn_resolved`

This is straightforward but requires the agent to know about the ordering requirement. If an LLM agent naively reports placements in DOM observation order, the server rejects with `INVALID_RESOLUTIONS`.

**Recommendation:** Either relax the ordering requirement (server sorts internally) or make the error message explicitly say "resolutions must be ordered by card value ascending."

### 5.5 `initialBoardCards` Derivation

Round 3 flagged (F13) that `CardChoiceState.initialBoardCards` requires the agent to remember the first card of each row at round start. This is needed for `recommend_once` (stateless mode) but NOT for `session_recommend` (server tracks it). Since session mode is preferred, this is less critical, but the stateless fallback path has this burden.

### Score: 3/5

BGA integration has genuine friction points. `boardAfter` timing, `revealedThisTurn` capture window, and `resolutions` ordering all require careful BGA skill implementation. Player ID mapping is underspecified. These are solvable but represent the highest-risk area for autonomous play.

---

## 6. Autonomy Assessment

### Can the agent run a full game with ZERO human intervention?

**Yes, with caveats.** The protocol provides every tool needed for a complete game lifecycle: session creation, round reporting, move recommendation, turn reporting, and session cleanup. The recovery ladder handles most failure modes.

### Most Likely Failure Mode

**Missed DOM update → stale state → drift → cascading errors.**

Scenario:
1. BGA turn resolves, but the agent reads the board mid-animation
2. `turn_resolved` is called with incorrect `boardAfter`
3. Next `session_recommend` detects drift (`stateConsistent: false`)
4. If drift is major → `STATE_MISMATCH` → `resync_session`
5. If drift is minor → recommendation proceeds with degraded accuracy
6. Degraded accuracy → suboptimal play → more penalties → still playable

This is recoverable. The more dangerous variant:

1. Agent misses a BGA notification entirely (e.g., BGA tab loses focus)
2. Agent doesn't call `turn_resolved` for a turn
3. Session version gets out of sync
4. All subsequent calls get `VERSION_MISMATCH`
5. Agent retries with wrong version → still mismatched
6. Agent needs to `resync_session` to recover

### Consecutive Error Tolerance

| Errors | State | Recovery |
|--------|-------|----------|
| 1 | `VERSION_MISMATCH` | Retry with correct version |
| 2 | `STATE_MISMATCH` | `resync_session` |
| 3 | `resync_session` fails | `end_session` + `start_session` + `resync_session` |
| 4 | Fresh session + resync fails | Agent is stuck |

**4 consecutive errors before irrecoverable.** This is a reasonable depth. In practice, step 3 (nuclear option) should almost always succeed because it creates a completely fresh session.

### Panic Button

**`resync_session` IS the panic button.** It accepts the full current state from BGA DOM and rebuilds everything. Combined with `end_session` + `start_session` as the nuclear option, the agent can always recover as long as it can read the BGA DOM.

**Missing: "query current session state" tool.** There's no way for the agent to ask the server "what do you think the current board/hand/scores are?" This would help diagnose drift without triggering a full resync. Currently the only way to detect drift is to call `session_recommend` and check `stateConsistent`.

### Score: 4/5

The protocol supports full autonomy with robust recovery. One point deducted for the missing "inspect session state" diagnostic tool and the potential for 4-error cascades from missed DOM updates.

---

## 7. Token Efficiency

### Per-Tool Token Estimates (request + response)

| Tool | Req (tokens) | Resp (tokens) | Total | Frequency (5-round game) | Game Total |
|------|-------------|---------------|-------|--------------------------|------------|
| `server_info` | 20 | 80 | 100 | 1 | 100 |
| `list_strategies` | 15 | 60 | 75 | 1 | 75 |
| `start_session` | 60 | 70 | 130 | 1 | 130 |
| `round_started` | 120 | 40 | 160 | 5 | 800 |
| `session_recommend` (card) | 100 | 100 | 200 | 50 | 10,000 |
| `turn_resolved` | 250 | 40 | 290 | 50 | 14,500 |
| `round_ended` | 80 | 60 | 140 | 5 | 700 |
| `end_session` | 20 | 30 | 50 | 1 | 50 |
| **Total** | | | | **114 calls** | **~26,355** |

### Consolidation Opportunities

**1. Merge `session_recommend` + `turn_resolved` responses.**
After the agent gets a recommendation and plays the card, it always follows with `turn_resolved`. A hypothetical `play_and_resolve` tool could combine these, but this doesn't work because BGA resolves the turn (the agent doesn't control when results appear). The two-step flow (recommend → observe → report) correctly models the async BGA interaction.

**2. Batch `turn_resolved` calls.**
A `report_turns` tool that accepts multiple turns at once could reduce overhead if the agent falls behind (e.g., processing delays). However, this conflicts with the versioning model — each turn bumps the version, and batching would require multi-version semantics. Not worth the complexity.

**3. Drop `server_info` + `list_strategies` in production.**
These are one-time discovery calls. An agent with a fixed system prompt already knows the available tools and strategies. Skipping these saves ~175 tokens and 2 round-trips. The spec could mark them as optional for agents with prior knowledge.

**4. Make `boardAfter` optional in `turn_resolved`.**
As discussed in §5.2, the server could compute `boardAfter` from `resolutions` + previous state. Making it optional saves ~60 tokens per turn (~3,000 per game) and eliminates the animation-timing fragility.

### Score: 4/5

Token efficiency is good. The main overhead is inherent to the data (5 players × 10 turns × 5 rounds). The `boardAfter` redundancy is the only significant optimization opportunity.

---

## 8. Comparison: What Would Be Ideal?

### What the current design gets right

1. **Server-side state management.** The agent reports observations; the server maintains the strategy state machine. This is the correct division of labor for an LLM agent.
2. **Optimistic concurrency.** Version-gated mutations prevent duplicate/stale events without requiring locks.
3. **Drift detection built into recommendations.** The agent doesn't need a separate "check state" call — drift is detected as a side effect of `session_recommend`.
4. **Clear recovery ladder.** The escalation model is simple enough to fit in a system prompt.
5. **Compact responses.** No unnecessary verbosity.

### What could be improved

**A. Add a `get_session_state` diagnostic tool.**
Currently, the only way to check server state is via `session_recommend`'s `stateConsistent` field. A dedicated read-only tool that returns the server's view of `{phase, round, turn, board, hand, scores, sessionVersion}` would:
- Help diagnose drift before it causes errors
- Provide a "what does the server think?" check without requiring a recommendation
- Cost ~150 tokens but save many more in avoided resync cycles

**B. Make `boardAfter` optional in `turn_resolved`.**
The server can compute expected board state from `resolutions`. If provided, use for validation. If omitted, compute. This eliminates the highest-friction BGA integration point.

**C. Relax `resolutions` ordering requirement.**
Accept `resolutions` in any order and sort server-side. The agent already provides `card` values; the server can sort by card ascending trivially. This removes a subtle correctness requirement that provides no value (the server can enforce the invariant itself).

**D. Add retry guidance to error model.**
Extend `DomainError` with a `suggestedAction` field:
```json
{
  "ok": false,
  "code": "VERSION_MISMATCH",
  "recoverable": true,
  "suggestedAction": "retry_with_version",
  "details": { "currentVersion": 5 }
}
```
This makes error recovery fully machine-parseable without requiring the agent to maintain a lookup table of error codes → actions.

**E. Consider a `report_observation` unified event tool.**
Instead of three separate event tools (`round_started`, `turn_resolved`, `round_ended`), a single `report_observation` tool with an `event` discriminator could reduce the tool surface from 11 to 9:
```json
{ "event": "round_started", "data": { "round": 1, "board": [...], "hand": [...] } }
{ "event": "turn_resolved", "data": { "turn": 1, "plays": [...], ... } }
{ "event": "round_ended", "data": { "round": 1, "scores": [...] } }
```
Trade-off: Simpler tool surface vs. less specific parameter validation. The current 3-tool approach is acceptable and arguably clearer for an LLM.

**F. Missing tools.**
- `get_session_state` (discussed above)
- `get_turn_history` — return turn history for current round, useful for debugging without full resync
- Neither is blocking; both are quality-of-life improvements.

### Score: N/A (benchmark comparison, not rated)

---

## Summary Scorecard

| Dimension | Score | Verdict |
|-----------|-------|---------|
| 1. Tool Discoverability | **4/5** | Clear categories, minor naming ambiguity |
| 2. Context Window Pressure | **5/5** | ~26K tokens per game, well within budget |
| 3. Decision Burden | **4/5** | Mostly unambiguous, animation timing is the gap |
| 4. Error Recovery UX | **4/5** | Clean recovery ladder, missing circuit breaker |
| 5. BGA Integration Friction | **3/5** | Highest-risk area: timing, ordering, IDs |
| 6. Autonomy Assessment | **4/5** | Full autonomy achievable, 4-error cascade limit |
| 7. Token Efficiency | **4/5** | Good efficiency, one redundancy opportunity |
| **Overall** | **4.0/5** | **Production-viable with targeted improvements** |

---

## FINDINGS

### 🔴 BLOCKING

*None.* All Round 4 blocking issues have been resolved. The protocol supports a complete game lifecycle.

### 🟡 IMPORTANT

| ID | Finding | Recommendation |
|----|---------|----------------|
| **U1** | **`boardAfter` in `turn_resolved` creates BGA animation-timing fragility.** The agent must read board state after all animations complete, but BGA provides no reliable "animations done" signal. Incorrect `boardAfter` causes drift detection on subsequent `session_recommend` calls. | Make `boardAfter` optional. If omitted, server computes expected board from `resolutions` + previous state. If provided, use for drift validation. |
| **U2** | **`resolutions` array ordering requirement (lowest card first) may not match BGA animation order.** Agent must sort placements by card value, not DOM observation order. Error message for `INVALID_RESOLUTIONS` should explicitly state the ordering rule. | Either relax ordering (server sorts) or ensure `INVALID_RESOLUTIONS` error message says "expected ascending card order." Prefer server-side sorting. |
| **U3** | **No "inspect session state" tool.** The only way to detect drift is via `session_recommend`'s `stateConsistent` field. The agent cannot ask "what does the server think the board looks like?" without requesting a recommendation. | Add `get_session_state` read-only tool returning `{phase, round, turn, board, hand, scores, sessionVersion}`. |
| **U4** | **No circuit-breaker / retry-limit guidance in recovery ladder.** An agent could retry the same error indefinitely without escalating. The recovery ladder is escalation-based but has no "after N retries, move up" rule. | Add explicit guidance: "If the same error recurs 3 times at one recovery level, escalate to the next level." Include in spec §5.5. |
| **U5** | **Player ID mapping between BGA DOM and MCP is underspecified.** `playerId` is described as "e.g., BGA username" but BGA uses numeric user IDs internally. The agent needs clear guidance on what value to use. | Explicitly state: "`playerId` should be the BGA display username visible in the game DOM." All player IDs in `plays`, `scores`, `rowPicks` must use the same identifier format. |

### 🟢 MINOR

| ID | Finding | Recommendation |
|----|---------|----------------|
| **U6** | **`recommend_once` vs `session_recommend` naming ambiguity.** The `_once` suffix doesn't clearly communicate "stateless." An agent might call `recommend_once` inside a session loop by mistake. | Consider adding a `deprecated_in_session: true` warning if `recommend_once` is called while a session is active. Or rename to `recommend_stateless`. |
| **U7** | **`server_info` and `list_strategies` add 2 round-trips for agents with fixed system prompts.** These are valuable for dynamic discovery but unnecessary for production agents that know the available tools and strategies. | Mark these as optional for agents with prior knowledge. The system prompt can embed strategy list and tool catalog. |
| **U8** | **Error responses lack `suggestedAction` field.** The `recoverable` boolean tells the agent "try again" but not *how*. The agent must map error codes to recovery actions. | Add `suggestedAction` enum to `DomainError`: `retry_with_version`, `resync_session`, `start_fresh`, `none`. |
| **U9** | **`session_recommend` breaks the event-tool naming pattern.** Event tools use past tense (`round_started`, `turn_resolved`); `session_recommend` is imperative. Not confusing per se, but inconsistent. | Acceptable as-is. The imperative name correctly signals "this requests an action, not reports an observation." |
| **U10** | **`revealedThisTurn` capture window during Rule 4.** BGA may reveal cards and begin animations immediately. The agent needs guidance on when to capture revealed cards (before any resolution animations). | Add a note in §9.1 Edge Case 3: "The agent should capture `revealedThisTurn` immediately upon card reveal, before BGA begins resolution animations." |
