# Round 5 Review: Edge-Case & Recovery Simulation

> Simulates 12 edge-case scenarios from the LLM agent's perspective, tracing full MCP tool calls with JSON payloads and responses. Evaluates whether the MCP protocol provides sufficient information for graceful recovery.

---

## Scenario 1: VERSION_MISMATCH Recovery

**Setup:** Agent is in round 1 after `round_started` (version now 1). Agent observed turn 1 resolve on BGA, but a network hiccup caused a previous `turn_resolved` to succeed without the agent seeing the response. Server is at version 2; agent still thinks version is 1.

### Tool Call 1 — Agent sends stale expectedVersion

```json
// Agent → MCP: turn_resolved
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 1,
    "round": 1,
    "turn": 1,
    "plays": [
      { "playerId": "agent", "card": 42 },
      { "playerId": "alice", "card": 55 },
      { "playerId": "bob", "card": 23 },
      { "playerId": "carol", "card": 78 }
    ],
    "resolutions": [
      { "playerId": "bob", "card": 23, "rowIndex": 1, "causedOverflow": false },
      { "playerId": "agent", "card": 42, "rowIndex": 2, "causedOverflow": false },
      { "playerId": "alice", "card": 55, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "carol", "card": 78, "rowIndex": 3, "causedOverflow": false }
    ],
    "boardAfter": { "rows": [[5, 55], [10, 23], [20, 42], [30, 78]] }
  }
}
```

```json
// MCP → Agent: VERSION_MISMATCH error
{
  "ok": false,
  "code": "VERSION_MISMATCH",
  "recoverable": true,
  "message": "Expected version 1 but session is at version 2.",
  "details": {
    "expectedVersion": 1,
    "currentVersion": 2
  }
}
```

### Agent Reasoning

> "Got VERSION_MISMATCH. Recovery ladder step 1: retry with `currentVersion` from details. But wait — if the server is already at version 2, that means turn 1 was ALREADY processed (version went 1→2). So this is actually a duplicate event with matching payload."

### Tool Call 2 — Agent retries with correct version

```json
// Agent → MCP: turn_resolved (retry with currentVersion)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 2,
    "round": 1,
    "turn": 1,
    "plays": [
      { "playerId": "agent", "card": 42 },
      { "playerId": "alice", "card": 55 },
      { "playerId": "bob", "card": 23 },
      { "playerId": "carol", "card": 78 }
    ],
    "resolutions": [
      { "playerId": "bob", "card": 23, "rowIndex": 1, "causedOverflow": false },
      { "playerId": "agent", "card": 42, "rowIndex": 2, "causedOverflow": false },
      { "playerId": "alice", "card": 55, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "carol", "card": 78, "rowIndex": 3, "causedOverflow": false }
    ],
    "boardAfter": { "rows": [[5, 55], [10, 23], [20, 42], [30, 78]] }
  }
}
```

```json
// MCP → Agent: DUPLICATE_EVENT (payload matches)
{
  "ok": false,
  "code": "DUPLICATE_EVENT",
  "recoverable": true,
  "message": "Turn 1 of round 1 already recorded with identical data. Safe to ignore.",
  "details": {
    "round": 1,
    "turn": 1
  }
}
```

### Agent Reasoning

> "DUPLICATE_EVENT with identical payload — safe to ignore. Server is at version 2. I'll use version 2 for my next call."

### Assessment

✅ **Smooth recovery.** The error chain VERSION_MISMATCH → retry → DUPLICATE_EVENT is self-healing. The agent gets `currentVersion` from the first error and sufficient context from the second.

⚠️ **Ambiguity:** The recovery ladder says "retry with currentVersion", but the semantics differ depending on WHY the version mismatch occurred. If the mismatch was because a *different* turn advanced the version, the retry with version 2 would try to apply turn 1 at version 2 — which should succeed (not be a duplicate). The agent cannot distinguish "my event already applied" from "a different event advanced the version" without more context in the VERSION_MISMATCH details.

---

## Scenario 2: STATE_MISMATCH During session_recommend

**Setup:** Round 2, turn 3. Agent's DOM scrape picked up a stale board (missed a card placement due to animation delay). Server's accumulated board differs.

### Tool Call 1 — Agent requests recommendation with stale board

```json
// Agent → MCP: session_recommend
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "hand": [14, 33, 67, 72, 88, 91, 99],
    "board": [[5, 12, 28], [10, 45], [20, 63, 70], [30, 50, 55, 60]],
    "decision": "card"
  }
}
```

```json
// MCP → Agent: STATE_MISMATCH error
{
  "ok": false,
  "code": "STATE_MISMATCH",
  "recoverable": true,
  "message": "Agent snapshot diverges significantly from server state. Use resync_session to realign.",
  "details": {
    "drift": {
      "board": {
        "serverRow2": [20, 63, 70, 75],
        "agentRow2": [20, 63, 70],
        "difference": "agent missing card 75 in row 2"
      },
      "hand": "consistent",
      "scores": "not checked (read-only tool)"
    }
  }
}
```

### Agent Reasoning

> "STATE_MISMATCH — recovery ladder step 2: resync_session. I need to re-read the BGA DOM carefully, wait for all animations to complete, then provide the corrected snapshot."

### Tool Call 2 — Agent re-scrapes BGA DOM and resyncs

```json
// Agent → MCP: resync_session
{
  "tool": "resync_session",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "round": 2,
    "turn": 3,
    "board": [[5, 12, 28], [10, 45], [20, 63, 70, 75], [30, 50, 55, 60]],
    "hand": [14, 33, 67, 72, 88, 91, 99],
    "scores": [
      { "playerId": "agent", "score": 12 },
      { "playerId": "alice", "score": 8 },
      { "playerId": "bob", "score": 22 },
      { "playerId": "carol", "score": 15 }
    ],
    "turnHistory": [
      {
        "turn": 1,
        "plays": [
          { "playerId": "agent", "card": 40 },
          { "playerId": "alice", "card": 52 },
          { "playerId": "bob", "card": 63 },
          { "playerId": "carol", "card": 29 }
        ],
        "rowPicks": [],
        "boardAfter": [[5, 12, 28, 29], [10, 45, 52], [20, 40], [30, 63]]
      },
      {
        "turn": 2,
        "plays": [
          { "playerId": "agent", "card": 56 },
          { "playerId": "alice", "card": 70 },
          { "playerId": "bob", "card": 75 },
          { "playerId": "carol", "card": 45 }
        ],
        "rowPicks": [],
        "boardAfter": [[5, 12, 28], [10, 45], [20, 63, 70, 75], [30, 50, 55, 60]]
      }
    ]
  }
}
```

```json
// MCP → Agent: resync success
{
  "sessionVersion": 10,
  "phase": "in-round",
  "round": 2,
  "turn": 3,
  "resynced": true,
  "strategyStateReset": true,
  "message": "Session resynced. Strategy state rebuilt from provided snapshot. 2 turns replayed."
}
```

### Tool Call 3 — Agent retries recommendation

```json
// Agent → MCP: session_recommend
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "hand": [14, 33, 67, 72, 88, 91, 99],
    "board": [[5, 12, 28], [10, 45], [20, 63, 70, 75], [30, 50, 55, 60]],
    "decision": "card"
  }
}
```

```json
// MCP → Agent: recommendation
{
  "sessionId": "s-a1b2c3d4",
  "sessionVersion": 10,
  "decision": "card",
  "strategy": "bayesian",
  "recommendation": {
    "card": 67,
    "confidence": 0.72,
    "alternatives": [
      { "card": 72, "confidence": 0.18 },
      { "card": 88, "confidence": 0.10 }
    ]
  },
  "timedOut": false,
  "stateConsistent": true,
  "stateWarnings": []
}
```

### Assessment

✅ **Smooth recovery.** The drift details in STATE_MISMATCH clearly identified which field diverged and how. The resync path is clean and well-defined.

⚠️ **Note:** `resync_session` resets the version to a new value (10). The agent must capture this for subsequent `turn_resolved` calls. The `session_recommend` response conveniently echoes it.

---

## Scenario 3: Multiple Players Trigger Rule 4 in Same Turn

**Setup:** Round 1, turn 5. Two players (bob and carol) both play cards lower than all row tails. Neither is the agent. Both must pick rows.

### Agent Perspective

The agent observes this on BGA: all cards flip, bob's card 2 and carol's card 4 are both lower than the smallest row tail (6). BGA prompts bob first (lowest card), bob picks row 1. Then carol picks row 3. The agent is NOT involved in any row pick — agent just observes.

### Tool Call — Agent reports full resolution

```json
// Agent → MCP: turn_resolved
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 5,
    "round": 1,
    "turn": 5,
    "plays": [
      { "playerId": "agent", "card": 55 },
      { "playerId": "alice", "card": 40 },
      { "playerId": "bob", "card": 2 },
      { "playerId": "carol", "card": 4 }
    ],
    "resolutions": [
      { "playerId": "bob", "card": 2, "rowIndex": 0, "causedOverflow": false, "collectedCards": [6, 15, 22, 30, 38] },
      { "playerId": "carol", "card": 4, "rowIndex": 2, "causedOverflow": false, "collectedCards": [8, 19, 27] },
      { "playerId": "alice", "card": 40, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "agent", "card": 55, "rowIndex": 1, "causedOverflow": false }
    ],
    "rowPicks": [
      { "playerId": "bob", "rowIndex": 0, "collectedCards": [6, 15, 22, 30, 38] },
      { "playerId": "carol", "rowIndex": 2, "collectedCards": [8, 19, 27] }
    ],
    "boardAfter": { "rows": [[2, 40], [10, 55], [4], [20, 35, 42, 48]] }
  }
}
```

```json
// MCP → Agent: success
{
  "sessionVersion": 6,
  "phase": "in-round",
  "round": 1,
  "turn": 5,
  "accepted": true
}
```

### Agent Reasoning

> "Bob and Carol both triggered Rule 4. Bob resolved first (card 2 < card 4). His row pick appears in both `resolutions` (with collectedCards) and `rowPicks`. Carol's pick appears similarly. After both picks, alice and my cards resolve normally against the newly placed cards."

### Assessment

✅ **Well-structured.** The `rowPicks` array cleanly separates Rule 4 events. The `resolutions` array ordered by card value preserves the resolution order. The agent can correctly reconstruct the turn narrative.

⚠️ **Minor concern:** There's redundancy between `resolutions[].collectedCards` and `rowPicks[].collectedCards`. The spec should clarify whether both are required or if `rowPicks` is the canonical source.

---

## Scenario 4: Agent's Card Triggers Rule 4 AND Another Player Causes Overflow

**Setup:** Round 2, turn 7. Agent plays card 3 (lowest, triggers Rule 4). Alice plays card 82 which is the 6th card in row 0 (causes overflow). Complex resolution: agent picks a row first (lowest card), then alice's overflow collects that row.

### Tool Call 1 — Agent asks for row recommendation

```json
// Agent → MCP: session_recommend (row decision, mid-turn)
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "hand": [3, 18, 44, 65],
    "board": [[10, 25, 38, 52, 77], [14, 29], [20, 60], [33, 41, 56, 70, 80]],
    "decision": "row",
    "triggeringCard": 3,
    "revealedThisTurn": [
      { "playerId": "agent", "card": 3 },
      { "playerId": "alice", "card": 82 },
      { "playerId": "bob", "card": 50 },
      { "playerId": "carol", "card": 61 }
    ],
    "resolutionIndex": 0
  }
}
```

```json
// MCP → Agent: row recommendation
{
  "sessionId": "s-a1b2c3d4",
  "sessionVersion": 8,
  "decision": "row",
  "strategy": "bayesian",
  "recommendation": {
    "rowIndex": 1,
    "confidence": 0.88,
    "alternatives": [
      { "rowIndex": 2, "confidence": 0.08 },
      { "rowIndex": 0, "confidence": 0.03 },
      { "rowIndex": 3, "confidence": 0.01 }
    ]
  },
  "timedOut": false,
  "stateConsistent": true,
  "stateWarnings": []
}
```

### Agent picks row 1 on BGA, observes full resolution, then reports:

### Tool Call 2 — Full turn_resolved

```json
// Agent → MCP: turn_resolved
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 8,
    "round": 2,
    "turn": 7,
    "plays": [
      { "playerId": "agent", "card": 3 },
      { "playerId": "alice", "card": 82 },
      { "playerId": "bob", "card": 50 },
      { "playerId": "carol", "card": 61 }
    ],
    "resolutions": [
      { "playerId": "agent", "card": 3, "rowIndex": 1, "causedOverflow": false, "collectedCards": [14, 29] },
      { "playerId": "bob", "card": 50, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "carol", "card": 61, "rowIndex": 2, "causedOverflow": false },
      { "playerId": "alice", "card": 82, "rowIndex": 3, "causedOverflow": true, "collectedCards": [33, 41, 56, 70, 80] }
    ],
    "rowPicks": [
      { "playerId": "agent", "rowIndex": 1, "collectedCards": [14, 29] }
    ],
    "boardAfter": { "rows": [[10, 25, 38, 52, 77, 50], [3], [20, 60, 61], [82]] }
  }
}
```

```json
// MCP → Agent: success
{
  "sessionVersion": 9,
  "phase": "in-round",
  "round": 2,
  "turn": 7,
  "accepted": true
}
```

### Agent Reasoning

> "My card 3 triggered Rule 4 (lowest card, below all row tails). I picked row 1, collecting [14, 29]. Then bob's 50 placed normally on row 0. Carol's 61 placed on row 2. Alice's 82 was the 6th card on row 3 — overflow! She collected [33, 41, 56, 70, 80] and her 82 became the new sole card in row 3."

### Assessment

✅ **Clean representation.** The `rowPicks` array captures agent's Rule 4 pick. The `resolutions` array captures alice's overflow. Both mechanisms compose naturally.

⚠️ **Note on session version:** `session_recommend` is read-only and does NOT increment version. So agent correctly uses version 8 (from the last mutating call) for `turn_resolved`. The recommend response echoes version 8 as confirmation but doesn't advance it.

---

## Scenario 5: SESSION_EXPIRED (30-Minute Inactivity)

**Setup:** Agent's browser lost focus for 35 minutes during opponent's long turns. Agent returns to find it's their turn.

### Tool Call 1 — Agent tries session_recommend on expired session

```json
// Agent → MCP: session_recommend
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "hand": [22, 45, 67],
    "board": [[5, 12], [10, 33], [20, 55, 60], [30, 42, 51, 58, 63]],
    "decision": "card"
  }
}
```

```json
// MCP → Agent: SESSION_EXPIRED
{
  "ok": false,
  "code": "SESSION_EXPIRED",
  "recoverable": true,
  "message": "Session s-a1b2c3d4 expired after 30 minutes of inactivity. Start a new session.",
  "details": {
    "sessionId": "s-a1b2c3d4",
    "lastActivity": "2025-07-01T14:05:00Z",
    "expiredAt": "2025-07-01T14:35:00Z"
  }
}
```

### Tool Call 2 — Agent creates new session

```json
// Agent → MCP: start_session
{
  "tool": "start_session",
  "arguments": {
    "strategy": "bayesian",
    "playerCount": 4,
    "playerId": "agent"
  }
}
```

```json
// MCP → Agent: new session
{
  "sessionId": "s-e5f6g7h8",
  "seed": "auto-9c4d1e",
  "sessionVersion": 0,
  "phase": "awaiting-round",
  "strategy": "bayesian",
  "playerCount": 4,
  "playerId": "agent"
}
```

### Tool Call 3 — Agent resyncs from BGA DOM

```json
// Agent → MCP: resync_session
{
  "tool": "resync_session",
  "arguments": {
    "sessionId": "s-e5f6g7h8",
    "round": 3,
    "turn": 8,
    "board": [[5, 12], [10, 33], [20, 55, 60], [30, 42, 51, 58, 63]],
    "hand": [22, 45, 67],
    "scores": [
      { "playerId": "agent", "score": 28 },
      { "playerId": "alice", "score": 15 },
      { "playerId": "bob", "score": 42 },
      { "playerId": "carol", "score": 33 }
    ]
  }
}
```

```json
// MCP → Agent: resynced
{
  "sessionVersion": 1,
  "phase": "in-round",
  "round": 3,
  "turn": 8,
  "resynced": true,
  "strategyStateReset": true,
  "message": "Session resynced. Strategy state rebuilt from provided snapshot. No turn history provided."
}
```

### Tool Call 4 — Agent gets recommendation

```json
// Agent → MCP: session_recommend
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-e5f6g7h8",
    "hand": [22, 45, 67],
    "board": [[5, 12], [10, 33], [20, 55, 60], [30, 42, 51, 58, 63]],
    "decision": "card"
  }
}
```

```json
// MCP → Agent: recommendation
{
  "sessionId": "s-e5f6g7h8",
  "sessionVersion": 1,
  "decision": "card",
  "strategy": "bayesian",
  "recommendation": {
    "card": 22,
    "confidence": 0.60,
    "alternatives": [
      { "card": 45, "confidence": 0.25 },
      { "card": 67, "confidence": 0.15 }
    ]
  },
  "timedOut": false,
  "stateConsistent": true,
  "stateWarnings": []
}
```

### Assessment

✅ **Clean recovery path.** SESSION_EXPIRED → start_session → resync_session → session_recommend works as expected.

⚠️ **Strategy quality degraded.** Cross-round memory is lost. The bayesian strategy starts fresh — it has no knowledge of rounds 1-2's opponent play patterns. No turn history was available for round 3 either, so even intra-round knowledge is minimal.

⚠️ **Resync on new session in `awaiting-round` phase:** The session starts in `awaiting-round`, but `resync_session` sets it to `in-round` (round 3, turn 8). This skips the normal `round_started` → `in-round` transition. The spec should confirm this is explicitly allowed.

---

## Scenario 6: MCP Process Crash and Restart

**Setup:** The `6nimmt serve` process crashes (segfault, OOM, etc.). The agent detects stdin/stdout closure.

### Detection

```
Agent detects: stdin/stdout pipe to 6nimmt serve process is closed.
Error: "EPIPE: broken pipe" or EOF on stdout read.
```

### Step 1 — Agent restarts the MCP server

```
$ 6nimmt serve --log-level warn
# MCP server starts, no sessions exist
```

### Tool Call 1 — Agent checks server is alive

```json
// Agent → MCP: server_info
{
  "tool": "server_info",
  "arguments": {}
}
```

```json
// MCP → Agent: server info
{
  "name": "6nimmt",
  "version": "1.0.0",
  "tools": ["server_info", "list_strategies", "validate_state", "recommend_once",
            "start_session", "round_started", "turn_resolved", "round_ended",
            "session_recommend", "resync_session", "end_session"],
  "sessionSupport": true,
  "maxConcurrentSessions": 4
}
```

### Tool Call 2 — New session

```json
// Agent → MCP: start_session
{
  "tool": "start_session",
  "arguments": {
    "strategy": "bayesian",
    "playerCount": 4,
    "playerId": "agent"
  }
}
```

```json
// MCP → Agent: new session
{
  "sessionId": "s-new12345",
  "seed": "auto-ff2a3b",
  "sessionVersion": 0,
  "phase": "awaiting-round",
  "strategy": "bayesian",
  "playerCount": 4,
  "playerId": "agent"
}
```

### Tool Call 3 — Resync from BGA DOM

```json
// Agent → MCP: resync_session
{
  "tool": "resync_session",
  "arguments": {
    "sessionId": "s-new12345",
    "round": 2,
    "turn": 5,
    "board": [[5, 18, 32], [10, 44], [20, 55, 62, 71], [30, 40]],
    "hand": [15, 28, 63, 77, 90],
    "scores": [
      { "playerId": "agent", "score": 18 },
      { "playerId": "alice", "score": 10 },
      { "playerId": "bob", "score": 30 },
      { "playerId": "carol", "score": 22 }
    ],
    "turnHistory": [
      {
        "turn": 1,
        "plays": [
          { "playerId": "agent", "card": 44 },
          { "playerId": "alice", "card": 55 },
          { "playerId": "bob", "card": 32 },
          { "playerId": "carol", "card": 40 }
        ],
        "rowPicks": [],
        "boardAfter": [[5, 32], [10, 44], [20, 55], [30, 40]]
      }
    ]
  }
}
```

```json
// MCP → Agent: resynced
{
  "sessionVersion": 1,
  "phase": "in-round",
  "round": 2,
  "turn": 5,
  "resynced": true,
  "strategyStateReset": true,
  "message": "Session resynced. Strategy state rebuilt from provided snapshot. 1 turn replayed."
}
```

### Assessment

✅ **Recovery works.** The crash → restart → new session → resync pipeline is well-defined.

⚠️ **Data loss:** All sessions lost. All cross-round strategy memory lost. Only partial intra-round recovery possible via turnHistory.

⚠️ **Agent must cache turnHistory locally.** The BGA DOM does not always retain full turn-by-turn history. If the agent didn't cache `turn_resolved` payloads in memory, the `turnHistory` in resync may be empty or incomplete.

---

## Scenario 7: DUPLICATE_EVENT (Retry After Network Hiccup)

**Setup:** Agent sent `turn_resolved` for round 1, turn 3. Network hiccup — agent didn't receive the response. Agent retries with exact same payload.

### Tool Call 1 — Original (succeeded on server, response lost)

```json
// Agent → MCP: turn_resolved (original — response lost in transit)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 3,
    "round": 1,
    "turn": 3,
    "plays": [
      { "playerId": "agent", "card": 88 },
      { "playerId": "alice", "card": 22 },
      { "playerId": "bob", "card": 45 },
      { "playerId": "carol", "card": 67 }
    ],
    "resolutions": [
      { "playerId": "alice", "card": 22, "rowIndex": 1, "causedOverflow": false },
      { "playerId": "bob", "card": 45, "rowIndex": 2, "causedOverflow": false },
      { "playerId": "carol", "card": 67, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "agent", "card": 88, "rowIndex": 3, "causedOverflow": false }
    ],
    "boardAfter": { "rows": [[5, 67], [10, 22], [20, 45], [30, 88]] }
  }
}
```

```
// Response lost — agent sees timeout/connection error
```

### Tool Call 2 — Agent retries with same payload

```json
// Agent → MCP: turn_resolved (exact same payload, same expectedVersion)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 3,
    "round": 1,
    "turn": 3,
    "plays": [
      { "playerId": "agent", "card": 88 },
      { "playerId": "alice", "card": 22 },
      { "playerId": "bob", "card": 45 },
      { "playerId": "carol", "card": 67 }
    ],
    "resolutions": [
      { "playerId": "alice", "card": 22, "rowIndex": 1, "causedOverflow": false },
      { "playerId": "bob", "card": 45, "rowIndex": 2, "causedOverflow": false },
      { "playerId": "carol", "card": 67, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "agent", "card": 88, "rowIndex": 3, "causedOverflow": false }
    ],
    "boardAfter": { "rows": [[5, 67], [10, 22], [20, 45], [30, 88]] }
  }
}
```

**Question:** Which error does the agent get?

The `expectedVersion` is 3, but the server already advanced to 4 after processing the original. So the agent gets VERSION_MISMATCH first:

```json
// MCP → Agent: VERSION_MISMATCH
{
  "ok": false,
  "code": "VERSION_MISMATCH",
  "recoverable": true,
  "message": "Expected version 3 but session is at version 4.",
  "details": {
    "expectedVersion": 3,
    "currentVersion": 4
  }
}
```

### Tool Call 3 — Agent retries with currentVersion

```json
// Agent → MCP: turn_resolved (same payload, updated version)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 4,
    "round": 1,
    "turn": 3,
    "plays": [ /* same */ ],
    "resolutions": [ /* same */ ],
    "boardAfter": { "rows": [[5, 67], [10, 22], [20, 45], [30, 88]] }
  }
}
```

```json
// MCP → Agent: DUPLICATE_EVENT
{
  "ok": false,
  "code": "DUPLICATE_EVENT",
  "recoverable": true,
  "message": "Turn 3 of round 1 already recorded with identical data. Safe to ignore.",
  "details": {
    "round": 1,
    "turn": 3
  }
}
```

### Agent Reasoning

> "Good — DUPLICATE_EVENT confirms my original call went through. Server is at version 4. I can proceed to turn 4."

### Assessment

✅ **Works but requires two round-trips.** The agent must go through VERSION_MISMATCH → retry → DUPLICATE_EVENT. This is correct per the spec but slightly wasteful.

💡 **Improvement idea:** If the server detects VERSION_MISMATCH but the round/turn matches an already-recorded event with identical payload, it could return DUPLICATE_EVENT directly instead of VERSION_MISMATCH, saving a round-trip. The DUPLICATE_EVENT response should include `currentVersion` in this case.

---

## Scenario 8: EVENT_CONFLICT (Same Round/Turn, Different Payload)

**Setup:** Agent's first `turn_resolved` call for round 1, turn 2 succeeded (response lost). Agent scrapes BGA DOM again but this time misreads a card value. Retries with different payload.

### Tool Call 1 — Agent retries with wrong data

```json
// Agent → MCP: turn_resolved (different payload, stale expectedVersion)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 2,
    "round": 1,
    "turn": 2,
    "plays": [
      { "playerId": "agent", "card": 55 },
      { "playerId": "alice", "card": 31 },
      { "playerId": "bob", "card": 72 },
      { "playerId": "carol", "card": 48 }
    ],
    "resolutions": [
      { "playerId": "alice", "card": 31, "rowIndex": 1, "causedOverflow": false },
      { "playerId": "carol", "card": 48, "rowIndex": 2, "causedOverflow": false },
      { "playerId": "agent", "card": 55, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "bob", "card": 72, "rowIndex": 3, "causedOverflow": false }
    ],
    "boardAfter": { "rows": [[5, 55], [10, 31], [20, 48], [30, 72]] }
  }
}
```

The server first sees VERSION_MISMATCH (expected 2, current is 3):

```json
// MCP → Agent: VERSION_MISMATCH
{
  "ok": false,
  "code": "VERSION_MISMATCH",
  "recoverable": true,
  "message": "Expected version 2 but session is at version 3.",
  "details": { "expectedVersion": 2, "currentVersion": 3 }
}
```

### Tool Call 2 — Agent retries with correct version

```json
// Agent → MCP: turn_resolved (same wrong payload, correct version)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 3,
    "round": 1,
    "turn": 2,
    "plays": [
      { "playerId": "agent", "card": 55 },
      { "playerId": "alice", "card": 31 },
      { "playerId": "bob", "card": 72 },
      { "playerId": "carol", "card": 48 }
    ],
    "resolutions": [ /* same wrong data */ ],
    "boardAfter": { "rows": [[5, 55], [10, 31], [20, 48], [30, 72]] }
  }
}
```

```json
// MCP → Agent: EVENT_CONFLICT
{
  "ok": false,
  "code": "EVENT_CONFLICT",
  "recoverable": false,
  "message": "Turn 2 of round 1 already recorded with different data. Session state may be corrupted. Use resync_session.",
  "details": {
    "round": 1,
    "turn": 2,
    "conflictFields": ["plays[1].card", "resolutions[1].card", "boardAfter"]
  }
}
```

### Agent Reasoning

> "EVENT_CONFLICT — `recoverable: false` but message says use resync_session. I need to re-scrape BGA DOM carefully and resync."

### Tool Call 3 — Agent resyncs

```json
// Agent → MCP: resync_session
{
  "tool": "resync_session",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "round": 1,
    "turn": 3,
    "board": [[5, 55], [10, 33], [20, 48], [30, 72]],
    "hand": [14, 28, 63, 77, 90, 91, 99],
    "scores": [
      { "playerId": "agent", "score": 0 },
      { "playerId": "alice", "score": 0 },
      { "playerId": "bob", "score": 0 },
      { "playerId": "carol", "score": 0 }
    ]
  }
}
```

```json
// MCP → Agent: resynced
{
  "sessionVersion": 5,
  "phase": "in-round",
  "round": 1,
  "turn": 3,
  "resynced": true,
  "strategyStateReset": true,
  "message": "Session resynced. Strategy state rebuilt from provided snapshot."
}
```

### Assessment

⚠️ **Recoverable but `recoverable: false` is confusing.** The EVENT_CONFLICT error is marked `recoverable: false` in the spec, but the recovery path (resync_session) works fine. The `recoverable` flag semantics need clarification — does it mean "this specific error can be retried" (no) or "the session can be recovered" (yes)?

⚠️ **VERSION_MISMATCH fires before EVENT_CONFLICT.** The agent must first fix the version, then encounters the conflict. This is a two-step discovery. If the spec defined that VERSION_MISMATCH checks happen after duplicate/conflict checks, the agent would get EVENT_CONFLICT immediately and skip the version retry.

---

## Scenario 9: Game Ends Mid-Turn

**Setup:** Round 5, turn 10 (last turn). After round resolution, bob's score hits 70 (≥ 66). The game is over.

### Tool Call 1 — Last turn resolves

```json
// Agent → MCP: turn_resolved
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 50,
    "round": 5,
    "turn": 10,
    "plays": [
      { "playerId": "agent", "card": 99 },
      { "playerId": "alice", "card": 15 },
      { "playerId": "bob", "card": 88 },
      { "playerId": "carol", "card": 42 }
    ],
    "resolutions": [
      { "playerId": "alice", "card": 15, "rowIndex": 0, "causedOverflow": false },
      { "playerId": "carol", "card": 42, "rowIndex": 1, "causedOverflow": false },
      { "playerId": "bob", "card": 88, "rowIndex": 2, "causedOverflow": true, "collectedCards": [60, 65, 70, 75, 80] },
      { "playerId": "agent", "card": 99, "rowIndex": 3, "causedOverflow": false }
    ],
    "boardAfter": { "rows": [[5, 15], [10, 42], [88], [30, 99]] }
  }
}
```

```json
// MCP → Agent: success
{
  "sessionVersion": 51,
  "phase": "in-round",
  "round": 5,
  "turn": 10,
  "accepted": true
}
```

### Tool Call 2 — Agent reports round ended

```json
// Agent → MCP: round_ended
{
  "tool": "round_ended",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 51,
    "round": 5,
    "scores": [
      { "playerId": "agent", "score": 38 },
      { "playerId": "alice", "score": 22 },
      { "playerId": "bob", "score": 70 },
      { "playerId": "carol", "score": 45 }
    ]
  }
}
```

```json
// MCP → Agent: game over!
{
  "sessionVersion": 52,
  "phase": "game-over",
  "round": 5,
  "accepted": true,
  "gameOver": true,
  "finalScores": [
    { "playerId": "alice", "score": 22, "rank": 1 },
    { "playerId": "agent", "score": 38, "rank": 2 },
    { "playerId": "carol", "score": 45, "rank": 3 },
    { "playerId": "bob", "score": 70, "rank": 4 }
  ]
}
```

### Tool Call 3 — Agent (confused) tries to start next round

```json
// Agent → MCP: round_started
{
  "tool": "round_started",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 52,
    "round": 6,
    "board": [[3], [18], [44], [77]],
    "hand": [10, 25, 33, 55, 60, 72, 81, 90, 95, 100]
  }
}
```

```json
// MCP → Agent: INVALID_PHASE
{
  "ok": false,
  "code": "INVALID_PHASE",
  "recoverable": true,
  "message": "Session is in 'game-over' phase. Only end_session is valid.",
  "details": {
    "currentPhase": "game-over",
    "validTools": ["end_session"]
  }
}
```

### Tool Call 4 — Agent ends session

```json
// Agent → MCP: end_session
{
  "tool": "end_session",
  "arguments": {
    "sessionId": "s-a1b2c3d4"
  }
}
```

```json
// MCP → Agent: session ended
{
  "sessionId": "s-a1b2c3d4",
  "ended": true,
  "totalRounds": 5,
  "finalPhase": "ended"
}
```

### Assessment

✅ **Game-over signal is clear.** `round_ended` returns `gameOver: true` with `finalScores`. The INVALID_PHASE error for `round_started` includes `validTools`, making recovery obvious.

✅ **Ranking included.** `finalScores` has `rank` field, so the agent can report results to the user immediately.

⚠️ **Minor: Agent must check `gameOver` flag in every `round_ended` response.** If the agent blindly loops `round_ended` → `round_started`, it will waste one tool call. The agent should branch on `gameOver` before calling `round_started`.

---

## Scenario 10: Concurrent Sessions (Bayesian + Random)

**Setup:** Agent runs two sessions in parallel to compare strategy quality against the same live game state.

### Tool Call Batch 1 — Start both sessions (parallel)

```json
// Agent → MCP: start_session (bayesian)
{
  "tool": "start_session",
  "arguments": {
    "strategy": "bayesian",
    "playerCount": 4,
    "playerId": "agent"
  }
}
```

```json
// Agent → MCP: start_session (random, in parallel)
{
  "tool": "start_session",
  "arguments": {
    "strategy": "random",
    "playerCount": 4,
    "playerId": "agent"
  }
}
```

```json
// MCP → Agent: bayesian session
{
  "sessionId": "s-bayes-01",
  "seed": "auto-aaa111",
  "sessionVersion": 0,
  "phase": "awaiting-round",
  "strategy": "bayesian",
  "playerCount": 4,
  "playerId": "agent"
}
```

```json
// MCP → Agent: random session
{
  "sessionId": "s-rand-01",
  "seed": "auto-bbb222",
  "sessionVersion": 0,
  "phase": "awaiting-round",
  "strategy": "random",
  "playerCount": 4,
  "playerId": "agent"
}
```

### Tool Call Batch 2 — Round started for both (parallel)

```json
// Agent → MCP: round_started (bayesian)
{
  "tool": "round_started",
  "arguments": {
    "sessionId": "s-bayes-01",
    "expectedVersion": 0,
    "round": 1,
    "board": [[5], [10], [20], [30]],
    "hand": [14, 28, 42, 55, 63, 71, 80, 88, 93, 99]
  }
}
```

```json
// Agent → MCP: round_started (random)
{
  "tool": "round_started",
  "arguments": {
    "sessionId": "s-rand-01",
    "expectedVersion": 0,
    "round": 1,
    "board": [[5], [10], [20], [30]],
    "hand": [14, 28, 42, 55, 63, 71, 80, 88, 93, 99]
  }
}
```

Both succeed with `sessionVersion: 1` for their respective sessions.

### Tool Call Batch 3 — Get recommendations from both (parallel)

```json
// Agent → MCP: session_recommend (bayesian)
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-bayes-01",
    "hand": [14, 28, 42, 55, 63, 71, 80, 88, 93, 99],
    "board": [[5], [10], [20], [30]],
    "decision": "card"
  }
}
```

```json
// Agent → MCP: session_recommend (random)
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-rand-01",
    "hand": [14, 28, 42, 55, 63, 71, 80, 88, 93, 99],
    "board": [[5], [10], [20], [30]],
    "decision": "card"
  }
}
```

```json
// MCP → Agent: bayesian recommendation
{
  "sessionId": "s-bayes-01",
  "sessionVersion": 1,
  "decision": "card",
  "strategy": "bayesian",
  "recommendation": {
    "card": 28,
    "confidence": 0.72,
    "alternatives": [
      { "card": 14, "confidence": 0.15 },
      { "card": 42, "confidence": 0.13 }
    ]
  },
  "timedOut": false,
  "stateConsistent": true,
  "stateWarnings": []
}
```

```json
// MCP → Agent: random recommendation
{
  "sessionId": "s-rand-01",
  "sessionVersion": 1,
  "decision": "card",
  "strategy": "random",
  "recommendation": {
    "card": 80,
    "confidence": 0.10,
    "alternatives": [
      { "card": 14, "confidence": 0.10 },
      { "card": 28, "confidence": 0.10 }
    ]
  },
  "timedOut": false,
  "stateConsistent": true,
  "stateWarnings": []
}
```

### Agent Reasoning

> "Bayesian says play 28 (confidence 0.72), random says 80 (no real confidence). I'll play bayesian's choice. After the turn resolves, I feed the SAME turn_resolved to both sessions so they stay in sync."

### Tool Call Batch 4 — Feed turn results to both (parallel)

```json
// Agent → MCP: turn_resolved (bayesian session)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-bayes-01",
    "expectedVersion": 1,
    "round": 1, "turn": 1,
    "plays": [/* ... */],
    "resolutions": [/* ... */],
    "boardAfter": { "rows": [/* ... */] }
  }
}
```

```json
// Agent → MCP: turn_resolved (random session)
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-rand-01",
    "expectedVersion": 1,
    "round": 1, "turn": 1,
    "plays": [/* ... */],
    "resolutions": [/* ... */],
    "boardAfter": { "rows": [/* ... */] }
  }
}
```

Both succeed independently.

### Assessment

✅ **Clean parallel operation.** Sessions are fully independent. Same game data fed to both. Agent can compare recommendations each turn.

⚠️ **Double the tool calls.** Every event must be sent to both sessions. Over a 5-round game (50 turns), that's ~100 extra `turn_resolved` calls. The spec could support a "broadcast" mode or session groups to reduce overhead, but this is a post-MVP concern.

⚠️ **Session limit awareness.** With 4 max sessions, running 2 per game leaves only 2 slots. If agent manages multiple concurrent BGA games, it could hit the limit.

---

## Scenario 11: Row Pick With No Prior Turns This Round

**Setup:** Round 1, turn 1. Agent plays card 2 (the lowest possible). All row tails are higher. Agent needs a row pick immediately — no `turn_resolved` has been called yet this round.

### Agent Observes on BGA

Cards revealed: agent plays 2, alice plays 15, bob plays 33, carol plays 50. Card 2 is lower than all row tails ([5], [10], [20], [30]). BGA prompts agent to pick a row.

### Tool Call 1 — Row recommendation with empty turnHistory

```json
// Agent → MCP: session_recommend (row decision)
{
  "tool": "session_recommend",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "hand": [8, 17, 25, 42, 56, 64, 78, 89, 95],
    "board": [[5], [10], [20], [30]],
    "decision": "row",
    "triggeringCard": 2,
    "revealedThisTurn": [
      { "playerId": "agent", "card": 2 },
      { "playerId": "alice", "card": 15 },
      { "playerId": "bob", "card": 33 },
      { "playerId": "carol", "card": 50 }
    ],
    "resolutionIndex": 0
  }
}
```

```json
// MCP → Agent: row recommendation
{
  "sessionId": "s-a1b2c3d4",
  "sessionVersion": 1,
  "decision": "row",
  "strategy": "bayesian",
  "recommendation": {
    "rowIndex": 0,
    "confidence": 0.70,
    "alternatives": [
      { "rowIndex": 1, "confidence": 0.15 },
      { "rowIndex": 2, "confidence": 0.10 },
      { "rowIndex": 3, "confidence": 0.05 }
    ]
  },
  "timedOut": false,
  "stateConsistent": true,
  "stateWarnings": []
}
```

### Agent Reasoning

> "Row 0 has only [5] — 1 card = 1 cattle head. Best choice for minimizing penalty. Bayesian agrees. I'll pick row 0."

### Tool Call 2 — After picking, report full turn resolution

```json
// Agent → MCP: turn_resolved
{
  "tool": "turn_resolved",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "expectedVersion": 1,
    "round": 1,
    "turn": 1,
    "plays": [
      { "playerId": "agent", "card": 2 },
      { "playerId": "alice", "card": 15 },
      { "playerId": "bob", "card": 33 },
      { "playerId": "carol", "card": 50 }
    ],
    "resolutions": [
      { "playerId": "agent", "card": 2, "rowIndex": 0, "causedOverflow": false, "collectedCards": [5] },
      { "playerId": "alice", "card": 15, "rowIndex": 1, "causedOverflow": false },
      { "playerId": "bob", "card": 33, "rowIndex": 3, "causedOverflow": false },
      { "playerId": "carol", "card": 50, "rowIndex": 3, "causedOverflow": false }
    ],
    "rowPicks": [
      { "playerId": "agent", "rowIndex": 0, "collectedCards": [5] }
    ],
    "boardAfter": { "rows": [[2, 15], [10], [20], [30, 33, 50]] }
  }
}
```

```json
// MCP → Agent: success
{
  "sessionVersion": 2,
  "phase": "in-round",
  "round": 1,
  "turn": 1,
  "accepted": true
}
```

### Assessment

✅ **Works correctly.** No prior `turn_resolved` needed. `session_recommend(decision:"row")` works immediately after `round_started`. The `revealedThisTurn` and `resolutionIndex` provide sufficient context for the strategy to evaluate row options.

✅ **Hand correctly reflects card already played.** The hand has 9 cards (not 10) because card 2 was already played. The board is still the initial board (no prior turns changed it). This is consistent.

⚠️ **Phase transition:** The spec says `session_recommend(row)` transitions to `awaiting-row-pick`. The subsequent `turn_resolved` must transition back to `in-round`. This works per the state machine but the phase should be documented as allowing `turn_resolved` from `awaiting-row-pick`.

---

## Scenario 12: resync_session With turnHistory (3 Turns)

**Setup:** Agent reconnects to BGA after a brief disconnection mid-round 2. The BGA DOM shows the game log with 3 resolved turns. Agent caches these and provides them in resync.

### Tool Call — Full resync with 3-turn history

```json
// Agent → MCP: resync_session
{
  "tool": "resync_session",
  "arguments": {
    "sessionId": "s-a1b2c3d4",
    "round": 2,
    "turn": 4,
    "board": [[5, 14, 22, 31, 40], [10, 55], [20, 62, 78], [30, 45, 52]],
    "hand": [18, 33, 67, 72, 88, 91, 99],
    "scores": [
      { "playerId": "agent", "score": 12 },
      { "playerId": "alice", "score": 8 },
      { "playerId": "bob", "score": 22 },
      { "playerId": "carol", "score": 15 }
    ],
    "turnHistory": [
      {
        "turn": 1,
        "plays": [
          { "playerId": "agent", "card": 14 },
          { "playerId": "alice", "card": 55 },
          { "playerId": "bob", "card": 45 },
          { "playerId": "carol", "card": 22 }
        ],
        "rowPicks": [],
        "boardAfter": [[5, 14], [10, 55], [20, 22], [30, 45]]
      },
      {
        "turn": 2,
        "plays": [
          { "playerId": "agent", "card": 40 },
          { "playerId": "alice", "card": 62 },
          { "playerId": "bob", "card": 52 },
          { "playerId": "carol", "card": 31 }
        ],
        "rowPicks": [],
        "boardAfter": [[5, 14, 31, 40], [10, 55, 62], [20, 22], [30, 45, 52]]
      },
      {
        "turn": 3,
        "plays": [
          { "playerId": "agent", "card": 78 },
          { "playerId": "alice", "card": 3 },
          { "playerId": "bob", "card": 91 },
          { "playerId": "carol", "card": 46 }
        ],
        "rowPicks": [
          { "playerId": "alice", "rowIndex": 2, "collectedCards": [20, 22] }
        ],
        "boardAfter": [[5, 14, 22, 31, 40], [10, 55], [20, 62, 78], [30, 45, 52]]
      }
    ]
  }
}
```

```json
// MCP → Agent: resynced with history
{
  "sessionVersion": 4,
  "phase": "in-round",
  "round": 2,
  "turn": 4,
  "resynced": true,
  "strategyStateReset": true,
  "message": "Session resynced. Strategy state rebuilt from provided snapshot. 3 turns replayed via onTurnResolved()."
}
```

### Reconstruction Contract Verification

The server processes this as:

1. **`onGameStart({ playerId: "agent", playerCount: 4, ... })`** — Fresh strategy initialization
2. **Synthetic `onTurnResolved(turn1)`** — Strategy observes cards played in turn 1, updates opponent models
3. **Synthetic `onTurnResolved(turn2)`** — Strategy observes turn 2 plays
4. **Synthetic `onTurnResolved(turn3)`** — Strategy observes turn 3, including alice's Rule 4 row pick

After replay, the bayesian strategy has:
- 3 turns of opponent card observations
- Knowledge that alice picked row 2 (collecting [20, 22])
- Updated probability distributions for each opponent's remaining hand

### Assessment

✅ **Reconstruction works well.** The turnHistory format provides enough data for `onTurnResolved()` replay.

⚠️ **Missing `resolutions` in turnHistory.** The turnHistory schema uses `plays` and `rowPicks` but NOT `resolutions`. The full `TurnResolution` type includes per-card resolution detail (`rowIndex`, `causedOverflow`, `collectedCards`). Without this, the synthetic `onTurnResolved()` call receives less data than a live call would. Strategies that track overflow patterns lose information.

⚠️ **`boardAfter` in turnHistory is bare `number[][]`** while `turn_resolved.boardAfter` uses `{ rows: number[][] }`. This inconsistency (flagged in Round 4) persists and could cause implementation bugs.

⚠️ **Cross-round memory lost.** The resync is for round 2, but the strategy has no knowledge of round 1. If the bayesian strategy had built strong opponent models in round 1, that information is permanently lost. The spec acknowledges this ("Cross-round strategy memory is lost") but the quality impact is material for multi-round games.

---

## FINDINGS

### Error Message Sufficiency

| Finding | Severity | Description |
|---------|----------|-------------|
| **F1** | **IMPORTANT** | VERSION_MISMATCH → retry path doesn't distinguish "my event already applied" from "a different event advanced the version". The agent cannot know if retrying with `currentVersion` will produce DUPLICATE_EVENT or actually apply. Should include `lastEventSummary` in details. |
| **F2** | **MINOR** | DUPLICATE_EVENT response doesn't include `currentVersion`. After a VERSION_MISMATCH → retry → DUPLICATE_EVENT chain, the agent must remember the version from the VERSION_MISMATCH error. Including `currentVersion` in DUPLICATE_EVENT would be more self-contained. |
| **F3** | **MINOR** | EVENT_CONFLICT is `recoverable: false` but recovery via `resync_session` works. The `recoverable` flag is semantically unclear — clarify whether it means "this call can be retried" vs "the session can be recovered". |

### Recovery Dead-Ends

| Finding | Severity | Description |
|---------|----------|-------------|
| **F4** | **IMPORTANT** | No dead-ends found in the specified recovery ladder. All paths eventually converge to a working state (worst case: full restart). However, the ladder requires up to 5 steps (error → version fix → conflict → resync → success), which is complex for an LLM agent to navigate without explicit decision tree documentation. |
| **F5** | **MINOR** | If `resync_session` itself returns STATE_MISMATCH (e.g., provided board fails validation), the agent enters an infinite loop: STATE_MISMATCH → resync → STATE_MISMATCH. The recovery ladder step 3 ("resync failure → end_session + start_session + resync") handles this, but it should be noted that resync uses different validation than session_recommend drift detection. |

### Missing Error Codes / Ambiguous Recovery

| Finding | Severity | Description |
|---------|----------|-------------|
| **F6** | **BLOCKING** | **turnHistory in resync_session is missing `resolutions` field.** The turnHistory schema provides `plays`, `rowPicks`, and `boardAfter` per turn, but NOT per-card resolution details (`rowIndex`, `causedOverflow`, `collectedCards`). Strategies that call `onTurnResolved()` receive `TurnResolution` which requires these fields. Either expand turnHistory to include full resolution data, or define how the server derives resolutions from plays + boardBefore + boardAfter. |
| **F7** | **IMPORTANT** | **`boardAfter` shape inconsistency between turn_resolved and resync turnHistory.** `turn_resolved` uses `{ rows: number[][] }` while `resync_session.turnHistory[].boardAfter` uses bare `number[][]`. This will cause serialization/parsing bugs. Standardize to one shape. |
| **F8** | **IMPORTANT** | **VERSION_MISMATCH priority vs DUPLICATE_EVENT/EVENT_CONFLICT.** The server checks version first, so a retry of an already-applied event always hits VERSION_MISMATCH before DUPLICATE_EVENT. This forces an extra round-trip. Consider checking round/turn duplicate status before (or alongside) version checking for `turn_resolved`. |
| **F9** | **MINOR** | **No error code for "max sessions reached".** If all 4 session slots are in use and the agent calls `start_session`, there's no defined error. Should be `MAX_SESSIONS_REACHED` or similar. |

### Race Conditions / Timing Issues

| Finding | Severity | Description |
|---------|----------|-------------|
| **F10** | **IMPORTANT** | **session_recommend and turn_resolved race.** If agent sends session_recommend (read-only, no version) and turn_resolved (mutating) simultaneously, the recommendation may be computed against pre-turn or post-turn state depending on server-side ordering. §5.2 mentions per-session serialization but doesn't mandate FIFO ordering. Should define: "Tool calls for a single session are processed in arrival order." |
| **F11** | **MINOR** | **resync_session during awaiting-row-pick phase.** If agent calls session_recommend(row) → server enters awaiting-row-pick → agent decides to resync instead of completing the row pick → does resync_session clear the awaiting-row-pick state? Spec should state that resync resets phase unconditionally. |

### Information the Agent Needs but Can't Obtain

| Finding | Severity | Description |
|---------|----------|-------------|
| **F12** | **IMPORTANT** | **Agent can't determine if its previous tool call succeeded after a network hiccup.** When the response is lost, the agent doesn't know if the server applied the event. The only discovery mechanism is retry → VERSION_MISMATCH → retry → DUPLICATE_EVENT/success. A `session_status` read-only tool returning `{ version, phase, round, turn, lastEventSummary }` would allow the agent to check state without mutation. |
| **F13** | **MINOR** | **No way to query remaining session TTL.** After SESSION_EXPIRED, the agent knows the session died. But there's no proactive way to check how long until expiry. A `session_info` tool or TTL field in responses would let the agent proactively refresh before timeout. |
| **F14** | **MINOR** | **BGA DOM may not retain full turnHistory.** The reconstruction quality depends on how much history the agent can scrape from BGA. If BGA only shows the current board and last few moves, turnHistory will be incomplete. This is a BGA-skill concern, not MCP, but the spec should acknowledge the degradation path: "Reconstruction quality degrades proportionally to missing turnHistory entries." |

### Summary Table

| Severity | Count | IDs |
|----------|-------|-----|
| **BLOCKING** | 1 | F6 |
| **IMPORTANT** | 6 | F1, F4, F7, F8, F10, F12 |
| **MINOR** | 7 | F2, F3, F5, F9, F11, F13, F14 |

### Top 3 Recommended Actions

1. **F6 (BLOCKING):** Expand `resync_session.turnHistory` schema to include full `resolutions` array per turn, or define server-side derivation from plays + board transitions.

2. **F12 (IMPORTANT):** Add a `session_status` read-only tool that returns current version, phase, round, turn, and last event summary. This eliminates the need for speculative retries after lost responses.

3. **F8 (IMPORTANT):** Reorder version checking so that DUPLICATE_EVENT/EVENT_CONFLICT detection runs before (or alongside) version validation for `turn_resolved`. This saves a round-trip in the common retry case.
