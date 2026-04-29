---
name: bga-6nimmt
description: "Playwright automation skill for playing 6 Nimmt! on Board Game Arena — DOM selectors, game state reading, card playing, and row picking. VERIFIED against live games."
---

# BGA 6 Nimmt! Playwright Skill

## Purpose

This skill automates playing 6 Nimmt! on Board Game Arena (BGA) using Playwright browser control. It reads game state from the DOM and the `gameui` JavaScript object, calls the 6nimmt MCP server for move recommendations, and executes plays.

All selectors and patterns below are **verified from live gameplay** (April 2026).

## Prerequisites

- User is already logged into BGA in the browser session controlled by Playwright
- The 6nimmt MCP server is running and available
- Playwright MCP server is configured with `--browser msedge`

---

## Core Capabilities

### 1. Find and Join a Table

**Navigation:** `https://boardgamearena.com/gamepanel?game=sechsnimmt`

**Steps:**
1. Navigate to game panel: `https://boardgamearena.com/gamepanel?game=sechsnimmt`
2. Click the "Play" button
3. Select "Real-time" mode if prompted
4. Click "Start" to begin matchmaking
5. Alternatively, expand "Show N tables waiting for players" to see open tables
6. Click an "Available" slot in an open table to join directly
7. Wait for redirect to game URL (pattern: `/\d+/sechsnimmt?table=<id>`)

### 2. Read Game State (VERIFIED)

> ⚠️ **CRITICAL:** `gameui.gamedatas.hand` and `gameui.gamedatas.table` are **STALE** — they freeze at page load and are NEVER updated during gameplay. You MUST use the methods below for live data.

**Complete state-reading function (copy-paste ready):**

```javascript
() => {
  // HAND: from playerHand stock component (LIVE, always current)
  // item.type = card VALUE (number), item.id = internal stock ID (for DOM element)
  const hand = gameui.playerHand.getAllItems()
    .map(i => ({ id: i.id, value: parseInt(i.type) }));
  const handValues = hand.map(h => h.value).sort((a, b) => a - b);

  // BOARD: from DOM (LIVE) — rows are 1-indexed in DOM (#row_card_zone_1 to _4)
  // Card VALUE is decoded from CSS background-position on a 10-column sprite sheet
  // Formula: col = |X%|/100, row = |Y%|/100, cardValue = row * 10 + col + 1
  function cardValueFromBgPos(bgPos) {
    const match = bgPos.match(/(-?\d+)%\s+(-?\d+)%/);
    if (!match) return null;
    const col = Math.abs(parseInt(match[1])) / 100;
    const row = Math.abs(parseInt(match[2])) / 100;
    return row * 10 + col + 1;
  }

  const board = [];
  for (let i = 1; i <= 4; i++) {
    const zone = document.getElementById('row_card_zone_' + i);
    const cards = zone
      ? Array.from(zone.querySelectorAll('.card'))
          .map(el => cardValueFromBgPos(el.style.backgroundPosition))
          .filter(v => v !== null)
      : [];
    board.push(cards);
  }

  // SCORES: from player panels
  const scores = {};
  const players = gameui.gamedatas.players;
  for (const [id, p] of Object.entries(players)) {
    scores[p.name] = parseInt(p.score);
  }

  return {
    hand,        // [{id, value}] — id needed for clicking, value for logic
    handValues,  // [number] — sorted card values for MCP
    board,       // [[row0Cards], [row1Cards], ...] — 0-indexed, values
    scores,
    gameState: gameui.gamedatas.gamestate.name,
    myId: gameui.player_id,
    playerCount: Object.keys(players).length
  };
}
```

**Key DOM facts (VERIFIED):**

| Element | Selector | Notes |
|---------|----------|-------|
| Hand container | `#myhand` | Stock component container |
| Hand card element | `#myhand_item_{stockId}` | stockId from `item.id`, NOT card value |
| Row card zone | `#row_card_zone_1` ... `#row_card_zone_4` | **1-indexed** (not 0!) |
| Row wrapper | `#row_wrap_1` ... `#row_wrap_4` | class `card_row_wrap` |
| Board cards | `.card` inside zone | Card value from `background-position` |
| Row pick arrows | `#row_slot_1_arrow` ... `#row_slot_4_arrow` | class `selectable_row`, only during row pick |
| Page title/status | Page title contains state text | "You must choose a card to play" / "You must take a row" |

**Game state names (VERIFIED from `gameui.gamedatas.gamestate.name`):**

| State Name | Page Title | Our Action |
|---|---|---|
| `cardSelect` | "You must choose a card to play" | Play a card |
| (row pick) | "You must take a row" | Pick a row via `#row_slot_X_arrow` |
| (waiting) | "Everyone must choose a card to play" | Wait — we already submitted |
| `gameEnd` | varies | End session |

**Turn detection (VERIFIED — most reliable method):**
- Wait for page title text: `"You must choose a card to play"` → it's our turn to play
- Wait for page title text: `"You must take a row"` → we must pick a row
- Use Playwright `waitFor` with text matching

### 3. Play a Card (VERIFIED)

**Steps:**
1. Read hand via evaluate: `gameui.playerHand.getAllItems()` → `[{id, type}]`
2. Call MCP `recommend_once` with state → get recommended card value
3. Find the stock item: `items.find(i => parseInt(i.type) === cardValue)`
4. Click via Playwright: `#myhand_item_{item.id}`
5. Card is immediately submitted (no confirmation needed)
6. Wait for next state: text "You must choose a card to play" (next turn) or "You must take a row"

**Click method — use Playwright `browser_click` with selector:**
```
target: #myhand_item_{stockId}
```

Where `stockId` comes from `gameui.playerHand.getAllItems().find(i => parseInt(i.type) === cardValue).id`

**IMPORTANT:** The stock item ID is NOT the card value! Card value 58 might have stock ID "9". Always look up the mapping.

### 4. Pick a Row (VERIFIED)

When page title says "You must take a row":

1. Read current board state
2. Call MCP `recommend_once` with `decision: "row"` → get row index (0-3)
3. Click the arrow: `#row_slot_{rowIndex + 1}_arrow`
   - Row index 0 → `#row_slot_1_arrow`
   - Row index 1 → `#row_slot_2_arrow`
   - Row index 2 → `#row_slot_3_arrow`
   - Row index 3 → `#row_slot_4_arrow`

**VERIFIED:** The clickable elements during row pick have class `selectable_row` and IDs `row_slot_X_arrow`.

**⚠️ NOT `#takerow_X`** — that selector does NOT exist in the live DOM!

### 5. Turn Flow (VERIFIED)

The game turn works as follows:
1. All players simultaneously pick a card (`cardSelect` state)
2. After clicking a card, title shows "Everyone must choose a card to play" (waiting for others)
3. Once all players have chosen, cards are revealed and placed (animations ~2-3s)
4. If any card is below all row endings → that player gets "You must take a row" state
5. After resolution, title returns to "You must choose a card to play" for next turn
6. After 10 turns, new round starts with fresh board and hand

**Practical loop:**
```
1. Wait for text "You must choose a card to play"
2. Read state (hand + board from DOM)
3. Get recommendation from MCP
4. Click recommended card
5. Wait for text "You must choose a card to play" OR "You must take a row"
6. If "take a row" → pick cheapest/recommended row, then wait for step 1
7. Repeat until game ends
```

### 6. Detect Round/Game End

**Round end:** After 10 turns, scores update and new cards are dealt. The hand will have 10 new cards and board will have 4 single-card rows.

**Game end:** Page shows final results. Check `gameui.gamedatas.gamestate.name === "gameEnd"`.

---

## MCP State Format (VERIFIED)

The `recommend_once` tool requires this state format:

```json
{
  "board": { "rows": [[4, 6, 7], [30, 32], [66], [86, 90]] },
  "hand": [12, 18, 24, 34, 45, 58, 68, 80, 104],
  "initialBoardCards": { "rows": [[4], [30], [66], [86]] },
  "playerCount": 2,
  "playerScores": { "0": 0, "1": 5 },
  "round": 1,
  "turn": 3,
  "turnHistory": []
}
```

**Field notes:**
- `board.rows` — array of 4 arrays, each containing card values in that row
- `hand` — array of card values currently in hand
- `initialBoardCards.rows` — the 4 starting cards at the beginning of the round
- `playerScores` — bull heads collected (penalties), NOT the BGA score display
- BGA displays `66 - penalties` as score. To get penalties: `66 - displayedScore`
- `turnHistory` — can be empty `[]` for stateless recommendations (bayesian still works)

**Available strategies in MCP:** `bayesian-simple`, `random`, `dummy-min`, `dummy-max`
(Note: `mcs` strategy exists in code but is not yet registered in the MCP server)

---

## Session Lifecycle Mapping

| BGA Event | MCP Tool Call |
|-----------|--------------|
| Game starts, cards dealt | `start_session` + `round_started` |
| Our turn to play card | `session_recommend` (decision: card) or `recommend_once` |
| Must pick a row | `session_recommend` (decision: row) or `recommend_once` |
| Turn resolves | `turn_resolved` (optional — only for stateful tracking) |
| Round ends | `round_ended` + `round_started` |
| Game over | `end_session` |

**Simplified (stateless) approach:** Just use `recommend_once` each turn with the current state — no session management needed!

---

## Error Recovery

| Situation | Action |
|-----------|--------|
| `gameui` not defined | Page still loading. Wait for `#game_play_area` to appear. |
| Card click doesn't work | Verify stock item ID mapping; try `el.click()` via evaluate |
| Row pick doesn't work | Use `#row_slot_X_arrow` (NOT `#takerow_X`) |
| Timeout waiting for state | Check page title text; try snapshot |
| Disconnection from BGA | BGA auto-reconnects. If stuck, refresh page |
| Popup blocking interaction | Dismiss with `document.querySelector('.dijitPopup').style.display = 'none'` |

---

## Timing

- **Card play:** Play within 5-15s of detecting our turn
- **Between turns:** Wait 2-3s for animations after playing
- **Turn detection:** Use Playwright `waitFor` with title text (more reliable than polling)
- **BGA turn timer:** Typically 60-110s — plenty of time

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `strategy` | `bayesian-simple` | MCP strategy to use for recommendations |
| `playDelay` | `2000` | Optional ms delay before playing (appear human) |

---

## Game Variants

**Our engine only supports the regular variant.**

Check on game start:
```javascript
() => ({
  card_variant: gameui.gamedatas.card_variant,  // must be "1"
  professional: gameui.gamedatas.professional    // must be "0"
})
```

If `card_variant !== "1"` OR `professional !== "0"` → warn user and don't auto-play.

---

## Key BGA Quirks (ALL VERIFIED)

1. **Card IDs ≠ card values!** `#myhand_item_92` holds card value 7 (not 92). Stock `item.id` = DOM suffix, `item.type` = card value. Board `#card_73` might be value 86.
2. **Sprite-based card values.** Cards are `<div>` with `background-position` on a 10-column sprite sheet. Formula: `value = (|Y%|/100) * 10 + (|X%|/100) + 1`.
3. **`gameui.gamedatas.hand` is STALE.** Frozen at page load. Always use `gameui.playerHand.getAllItems()`.
4. **`gameui.gamedatas.table` is STALE.** Frozen at page load. Always read board from DOM `#row_card_zone_X`.
5. **DOM rows are 1-indexed.** `#row_card_zone_1` to `#row_card_zone_4`. Map to 0-indexed for MCP.
6. **Row pick arrows.** Click `#row_slot_X_arrow` (class `selectable_row`). NOT `#takerow_X`.
7. **Score = 66 - penalties.** Starting score 66, decreases as you collect bull heads.
8. **No confirmation on card play.** Click = submit. Cannot undo.
9. **Multi-active state.** All players choose cards simultaneously in `cardSelect`.
10. **Page title is the best state indicator.** More reliable than polling `gamestate.name`.
