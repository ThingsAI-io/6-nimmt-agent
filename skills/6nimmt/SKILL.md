# 6 Nimmt! Game Advisor — Skill Reference

## Game Overview

**6 Nimmt!** (Take 6!) is a card game for 2–10 players using cards numbered 1–104. Each card has a "bull head" value (penalty points). The goal is to **collect the fewest penalty points**.

### Setup
- 4 cards are dealt face-up to form 4 **rows** on the board (each row starts with 1 card).
- Each player receives a **hand** of 10 cards.

### Turn Flow (repeated 10 times per round)
1. **All players simultaneously pick one card** from their hand (hidden).
2. **Cards are revealed** and placed in ascending order (lowest first).
3. **Placement rules** for each revealed card:
   - The card goes to the row whose tail (rightmost card) is the **largest value still less than** the played card.
   - If a row already has **5 cards**, placing a 6th triggers a **take** — the player collects all 5 cards (penalty!) and their card starts the row fresh.
   - If the played card is **lower than all row tails**, the player must **choose a row to take** (pick up all its cards as penalty), then their card starts that row.

### Scoring
- Each card has bull heads: most cards = 1, multiples of 5 = 2, multiples of 10 = 3, multiples of 11 = 5, card 55 = 7.
- The player with the **fewest total bull heads** at the end wins.

### End Condition
- A round ends after 10 turns (all cards played).
- The game ends after a set number of rounds or when any player exceeds a score threshold (commonly 66 points).

---

## MCP Server Tools — End-to-End Game Flow

The 6nimmt MCP server provides advisory tools. There are two modes:

### Mode 1: Stateless (one-shot)
Use `recommend_once` for a single recommendation without session tracking.

### Mode 2: Stateful Session (full game tracking)
Use sessions to track the full game and get progressively better recommendations as the strategy accumulates information about other players.

---

### Tool Reference

#### `server_info`
Returns server metadata and capabilities. Call first to verify connectivity.

#### `list_strategies`
Lists available strategies (e.g., `random`). Each strategy has a name, description, and supported player count range.

#### `validate_state`
Validates a game state object. Use to check your state is well-formed before calling recommend.

#### `recommend_once`
**Stateless one-shot recommendation.** Pass the full game state and strategy name, get back a recommended card (or row pick). No session needed.

- `state`: Game state object (hand, board, scores, turn history, etc.)
- `strategy`: Strategy name (e.g., `"random"`)
- `decision`: `"card"` (which card to play) or `"row"` (which row to pick). Auto-detected if omitted.

---

### Session Lifecycle (stateful mode)

```
start_session → round_started → [session_recommend ↔ turn_resolved] × 10 → round_ended → ... → end_session
```

#### `start_session`
Creates a new advisory session. Returns a `sessionId`.

- `strategy`: Strategy name
- `playerCount`: Number of players (2–10)
- `playerId`: Your player identifier

#### `round_started`
**Call at the start of each round.** Provides the initial board and your hand.

- `sessionId`: From `start_session`
- `expectedVersion`: Session version (for optimistic concurrency)
- `round`: Round number (1-based)
- `board`: The 4 rows, each an array of card numbers (e.g., `{"0": [23], "1": [45], "2": [67], "3": [89]}`)
- `hand`: Your 10 cards (e.g., `[3, 17, 22, 44, 55, 61, 78, 82, 95, 101]`)

#### `session_recommend`
**Call when you need to decide what to play.** Uses accumulated session state for smarter recommendations.

- `sessionId`: Active session
- `hand`: Your current hand (cards remaining)
- `board`: Current board state (4 rows)
- `decision`: `"card"` or `"row"` (auto-detected if omitted)
- `triggeringCard`: (for row picks) The card that triggered the pick
- `revealedThisTurn`: Cards revealed this turn so far (for mid-resolution context)

**Returns:** `{ card: <number> }` for card decisions, `{ row: <0-3> }` for row picks.

#### `turn_resolved`
**Call after each turn resolves** (all cards placed). Feeds back what happened so the strategy can learn.

- `sessionId`: Active session
- `expectedVersion`: Session version
- `round`: Current round
- `turn`: Turn number (1-based within round)
- `plays`: Array of `{ playerId, card }` — all cards played this turn
- `resolutions`: Array of placement results (which row each card went to)
- `rowPicks`: Array of row pick events (if any player had to pick a row)
- `boardAfter`: Board state after resolution

#### `round_ended`
**Call when a round finishes** (after turn 10).

- `sessionId`: Active session
- `expectedVersion`: Session version
- `round`: Round that ended
- `scores`: Current cumulative scores (e.g., `{"player1": 12, "player2": 34, ...}`)

#### `resync_session`
**Recovery tool.** If the session state drifts (missed events, reconnection), call this to re-align.

- `sessionId`: Active session
- `round`, `turn`: Current position
- `board`: Current board
- `hand`: Current hand
- `scores`: Current scores
- `turnHistory`: Array of past turn events

#### `session_status`
Returns session metadata (strategy, version, state summary).

#### `end_session`
Cleans up the session when the game is over.

---

## Typical Agent Workflow (BGA Integration)

1. **Connect to BGA** (via Playwright or similar browser automation)
2. **`start_session`** with strategy, player count, your player ID
3. **When a round starts** → read board + hand from BGA → call `round_started`
4. **When it's time to play a card** → call `session_recommend` with current hand + board → play the recommended card on BGA
5. **If forced to pick a row** → call `session_recommend` with `decision: "row"` → pick the recommended row
6. **After all cards resolve** → read results from BGA → call `turn_resolved`
7. **After round ends** → call `round_ended` with scores
8. **Repeat** steps 3–7 for each round
9. **Game over** → call `end_session`

---

## Key Data Structures

### Board
An object with keys `"0"` through `"3"`, each mapping to an array of card numbers (ordered):
```json
{ "0": [3, 15, 28], "1": [44], "2": [67, 72, 80, 91, 99], "3": [12] }
```

### Hand
An array of card numbers you hold:
```json
[5, 22, 37, 48, 55, 63, 71, 88, 94, 100]
```

### Plays
Array of objects showing who played what:
```json
[{ "playerId": "p1", "card": 37 }, { "playerId": "p2", "card": 55 }]
```

### Scores
Object mapping player IDs to cumulative penalty points:
```json
{ "p1": 12, "p2": 7, "p3": 24 }
```
