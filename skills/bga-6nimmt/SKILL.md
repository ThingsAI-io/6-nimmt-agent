---
name: bga-6nimmt
description: "Playwright automation skill for playing 6 Nimmt! on Board Game Arena — DOM selectors, game state reading, card playing, and row picking."
---

# BGA 6 Nimmt! Playwright Skill

## Purpose

This skill automates playing 6 Nimmt! on Board Game Arena (BGA) using Playwright browser control. It reads game state from the DOM and the `gameui` JavaScript object, calls the 6nimmt MCP server for move recommendations, and executes plays.

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
2. Click the "Play" button (`ref` for the button with text "Play" in the game panel)
3. Select "Real-time" mode if prompted
4. Click "Start" to begin matchmaking
5. Alternatively, expand "Show N tables waiting for players" to see open tables
6. Click an "Available" slot in an open table to join directly
7. Wait for redirect to game URL: `https://boardgamearena.com/table?table=<id>`

**DOM selectors (game panel):**
- Play button: `button` containing text "Play"
- Real-time button: `button` containing text "Real-time"
- Start button: `link` with text "Start"
- Tables waiting: element containing "Show N tables waiting for players"
- Available slots: elements with text "Available" and a "+" indicator
- Number of players selector: `button` with current count (e.g. "5")

### 2. Read Game State

Once in a game (`/table?table=<id>` URL), use JavaScript evaluation to read state:

**Primary method — combining `gameui.playerHand` (live hand) + DOM board reading (live board):**

> ⚠️ **CRITICAL:** `gameui.gamedatas.hand` and `gameui.gamedatas.table` are STALE — they freeze at page load and are NEVER updated during gameplay. You MUST use the methods below for live data.

```javascript
// Execute via browser_evaluate — CORRECT live state reading
() => {
  const gd = gameui.gamedatas;
  
  // HAND: Use playerHand stock component (LIVE, updates correctly)
  // item.type = card number, item.id = stock/DOM id
  const hand = gameui.playerHand.getAllItems().map(i => parseInt(i.type)).sort((a,b) => a-b);
  
  // BOARD: Read from DOM (LIVE) — gd.table is STALE, never use it!
  // Cards live in #row_card_zone_1 through #row_card_zone_4
  // Card number is decoded from background-position on 10-column sprite sheet
  const board = [[], [], [], []];
  for (let row = 1; row <= 4; row++) {
    const zone = document.getElementById(`row_card_zone_${row}`);
    if (zone) {
      zone.querySelectorAll('[id^="card_"]').forEach(card => {
        const bgPos = card.style.backgroundPosition;
        const match = bgPos.match(/([-\d.]+)%\s+([-\d.]+)%/);
        if (match) {
          const col = Math.round(Math.abs(parseFloat(match[1])) / 100);
          const rowIdx = Math.round(Math.abs(parseFloat(match[2])) / 100);
          board[row-1].push(rowIdx * 10 + col + 1);
        }
      });
    }
  }
  
  const scores = {};
  Object.entries(gd.players).forEach(([id, p]) => { scores[id] = parseInt(p.score); });
  
  return JSON.stringify({
    hand,
    board,
    gamestate: gd.gamestate.name,
    possibleactions: gd.gamestate.possibleactions,
    players: Object.entries(gd.players).map(([id, p]) => ({
      id, name: p.name, score: parseInt(p.score)
    })),
    currentPlayerId: gameui.player_id,
    isActive: gameui.isCurrentPlayerActive()
  });
}
```

**Board reading — DOM-based (the ONLY correct approach):**
- Cards are in `#row_card_zone_1` through `#row_card_zone_4`
- Each card element has `id="card_{dbId}"` and class `cardspace card row_card`
- Card number is decoded from `background-position` on a 10-column sprite sheet:
  - Parse `-X% -Y%` → `col = |X|/100`, `row = |Y|/100` → `cardNum = row * 10 + col + 1`
- Do NOT use `gameui.gamedatas.table` — it is frozen at page load and never updates!

**Hand reading — Stock component (the ONLY correct approach):**
- `gameui.playerHand.getAllItems()` returns live hand items
- Each item: `{ id: "stockId", type: "cardNumber" }`
- `parseInt(item.type)` = the card number
- Do NOT use `gameui.gamedatas.hand` — it is frozen at page load!

**Game state names (from `gameui.gamedatas.gamestate.name`):**
| State Name | Meaning | Our Action |
|---|---|---|
| `cardSelect` | All players must choose a card (multi-active) | Play a card |
| `takeRow` | Active player must take a row (card lower than all) | Pick a row |
| `cardProcess` | Server processing card choices | Wait |
| `cardReveal` | Cards being revealed/animated | Wait |
| `gameEnd` | Game over | End session |

> Note: Some docs reference `cardChoice` and `smallestCard` — these are WRONG for live BGA games. The actual state names are `cardSelect` and `takeRow`.

**DOM selectors (VERIFIED from live game):**
```
# Hand cards (via BGA Stock component)
Container: #myhand_wrap (class "whiteblock")
Card elements: #myhand_item_{stockId}  ← stockId is NOT the card number!
Card class: "stockitem cardspace card"
Unselectable: adds class "stockitem_unselectable"

To find a card's element:
  const item = gameui.playerHand.getAllItems().find(i => parseInt(i.type) === cardNumber);
  const element = document.getElementById(`myhand_item_${item.id}`);

# Board rows (4 rows, up to 5+1 cards each)
Row wrapper: #row_wrap_1 ... #row_wrap_4 (class "card_row_wrap")
Card zone: #row_card_zone_1 ... #row_card_zone_4 (class "row_card_zone")
Card elements: #card_{dbId} (class "cardspace card row_card")
Empty slots: #row_slot_{row}_{pos} (class "cardspace empty_slot")

# Game board container
#game_board

# Row pick buttons (only exist during takeRow state)
#takerow_1 ... #takerow_4    → click to take a row

# Game status text
#pagemaintitletext            → "You must choose a card to play" etc.

# Player scores
#player_score_{playerId}     → current score text

# Player panels
#player_boards               → container for all player panels
#overall_player_board_{playerId} → individual player panel
```

### 3. Play a Card

**Steps:**
1. Detect `gamestate.name === "cardSelect"` and `isCurrentPlayerActive() === true`
2. Read hand: `gameui.playerHand.getAllItems().map(i => parseInt(i.type))`
3. Read board: parse from DOM `#row_card_zone_X` elements (see above)
4. Call `session_recommend` with hand + board → get recommended card number
5. Click the card via JS (most reliable):
```javascript
// Click card number N
() => {
  const cardNumber = N;
  const item = gameui.playerHand.getAllItems().find(i => parseInt(i.type) === cardNumber);
  if (!item) return { error: `Card ${cardNumber} not in hand` };
  const el = document.getElementById(`myhand_item_${item.id}`);
  if (!el) return { error: `Element myhand_item_${item.id} not found` };
  el.click();
  return { clicked: cardNumber, elementId: `myhand_item_${item.id}` };
}
```
6. The click triggers BGA's selection handler which auto-submits via AJAX

**BGA AJAX endpoint (for reference):**
```
POST /sechsnimmt/sechsnimmt/chooseCard.html
Body: { id: cardNumber, lock: true }
```

No confirmation dialog needed — selecting a card in the hand stock immediately submits it.

### 4. Pick a Row

**Two scenarios:**

**a) `smallestCard` state** — our card is lower than all row endings, must take a full row:
1. Detect `gamestate.name === "smallestCard"` and we're the active player
2. Call `session_recommend` with `decision: "row"`
3. Click `#takerow_{row}` (row 1-4)

**b) `multipleChoice` state** — card could go in multiple rows:
1. Detect `gamestate.name === "multipleChoice"` and we're the active player
2. Call `session_recommend` with `decision: "row"`
3. Click `#chooserow_{row}` (row 1-4)

**BGA AJAX endpoints:**
```
POST /sechsnimmt/sechsnimmt/takerow.html   → { row: N, lock: true }
POST /sechsnimmt/sechsnimmt/chooseRow.html  → { row: N, lock: true }
```

### 5. Observe Turn Resolution

**Notification-based state tracking:**

BGA pushes notifications to update the UI. Key notifications:
| Notification | Meaning |
|---|---|
| `notif_cardPlayed` | A player played a card (revealed) |
| `notif_cardPlaced` | A card was placed on a row |
| `notif_shiftCards` | Cards shifted in a row |
| `notif_playerTakesRow` | A player took a row (overflow) |
| `notif_clearTable` | Table cleared for new round |
| `notif_newTable` | New starting cards placed |
| `notif_newHand` | New hand dealt |
| `notif_availableCards` | Available cards shown (professional variant) |

**Practical approach:** After playing a card, poll `gameui.gamedatas.gamestate.name` every 1-2 seconds. When it returns to `cardChoice`, the turn has resolved. Read the updated `gameui.gamedatas.table` for new board state.

### 6. Detect Round/Game End

**Round end:** When `gamestate.name === "roundStart"` or `"roundBegin"` after 10 turns, scores update. Read all `#player_score_{id}` or `gameui.gamedatas.players[id].score`.

**Game end:** `gamestate.name === "gameEnd"`. Final results shown in `#pagesection_gameresult`.

---

## Session Lifecycle Mapping

| BGA Event | MCP Tool Call |
|-----------|--------------|
| Game starts, cards dealt | `start_session` + `round_started` |
| `cardChoice` state, our turn | `session_recommend` (decision: card) |
| `smallestCard` / `multipleChoice` state | `session_recommend` (decision: row) |
| State returns to `cardChoice` or `endTurn` | `turn_resolved` |
| Scores update, new hand dealt | `round_ended` + `round_started` |
| `gameEnd` state | `end_session` |

---

## JavaScript Helpers

Use `browser_evaluate` to run these helper functions:

```javascript
// Get full game state for MCP (CORRECT — uses live sources)
() => {
  const gd = gameui.gamedatas;
  
  // HAND from stock component (LIVE)
  const hand = gameui.playerHand.getAllItems().map(i => parseInt(i.type)).sort((a,b) => a-b);
  
  // BOARD from DOM (LIVE) — decodes card numbers from sprite background-position
  const board = [[], [], [], []];
  for (let row = 1; row <= 4; row++) {
    const zone = document.getElementById(`row_card_zone_${row}`);
    if (zone) {
      zone.querySelectorAll('[id^="card_"]').forEach(card => {
        const bgPos = card.style.backgroundPosition;
        const match = bgPos.match(/([-\d.]+)%\s+([-\d.]+)%/);
        if (match) {
          const col = Math.round(Math.abs(parseFloat(match[1])) / 100);
          const rowIdx = Math.round(Math.abs(parseFloat(match[2])) / 100);
          board[row-1].push(rowIdx * 10 + col + 1);
        }
      });
    }
  }
  
  const scores = {};
  Object.entries(gd.players).forEach(([id, p]) => {
    scores[id] = parseInt(p.score);
  });
  
  return { hand, board, scores, state: gd.gamestate.name, myId: gameui.player_id };
}

// Click a card by number
(cardNumber) => {
  const item = gameui.playerHand.getAllItems().find(i => parseInt(i.type) === cardNumber);
  if (!item) return { error: `Card ${cardNumber} not in hand` };
  document.getElementById(`myhand_item_${item.id}`).click();
  return { clicked: cardNumber };
}

// Check if it's our turn to act
() => gameui.isCurrentPlayerActive()

// Get possible actions
() => gameui.gamedatas.gamestate.possibleactions
```

---

## Error Recovery

| Situation | Action |
|-----------|--------|
| `gameui` not defined | Page still loading. Wait for `#game_play_area` to appear. |
| Game state drift (board mismatch) | Call `resync_session` with current `gameui.gamedatas` |
| Timeout waiting for state change | Take screenshot, check connection status via `#connect_status` |
| Disconnection from BGA | BGA auto-reconnects. If `#connect_status` shows error, refresh page + `resync_session` |
| Popup blocking interaction | Dismiss with `document.querySelector('.dijitPopup').style.display = 'none'` |
| Can't find an open table | Navigate to game panel, click "Play" → "Real-time" → "Start" for auto-match |

---

## Timing Considerations

- **Card play:** BGA timer is typically 60-110s per turn. Play within 5-15s.
- **Between turns:** Wait for animations (~2-5s). Poll `gamestate.name` for state transitions.
- **Polling interval:** Check `gameui.gamedatas.gamestate.name` every 1-2 seconds when waiting.
- **Anti-bot:** Add random delay of 1-4 seconds before acting to appear natural.

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `strategy` | `bayesian-simple` | MCP strategy to use |
| `playDelay` | `2000` | Milliseconds to wait before playing (human-like) |
| `pollInterval` | `1500` | Milliseconds between state checks |
| `maxWaitForGame` | `300000` | Max wait for game to start (5 min) |
| `screenshotOnError` | `true` | Take screenshot when something unexpected happens |

---

## Game Variants

BGA 6 Nimmt has several variants. **Our engine only supports the regular variant (Disabled).**

**Variant fields in `gameui.gamedatas`:**

| Field | Values | Meaning |
|-------|--------|---------|
| `card_variant` | `"1"` = Disabled (regular), `"2"` = Tactics, `"3"` = Logic | Card set variant |
| `professional` | `"0"` = off, `"1"` = on | Professional variant (draft cards) |
| `game_length_type` | `"0"` = Starting score, `"1"` = Fixed rounds | How game length is determined |
| `current_round` | number string | Current round number |
| `maximum_round` | number | Max rounds (0 = play until score threshold) |

**Variant descriptions:**
- **Disabled (regular):** All 104 cards used, dealt randomly. ← **Only supported variant**
- **Tactics variant:** Reduced card set based on player count (removes highest cards)
- **Logic variant:** Players draft/pick cards at the start of each round (uses `pickCard` game state)
- **Professional variant:** Additional drafting mechanic on top of the card set

**Agent behavior:**
- On game start, read `gameui.gamedatas.card_variant` and `gameui.gamedatas.professional`
- If `card_variant !== "1"` OR `professional !== "0"`, warn the user: "This table uses a variant not supported by our engine. Play manually or leave."
- Only auto-play when `card_variant === "1"` and `professional === "0"`

**When joining tables:**
- On the game panel, the table config shows "Card set variant: Disabled" and "Professional variant" checkbox
- Prefer joining/creating tables with "Disabled" + Professional OFF
- The dropdown options are visible under the "Default options" section of each table

---

## Key BGA Quirks

1. **Card IDs ≠ card numbers!** `#myhand_item_79` might hold card 95. The stock `item.id` is a DB/internal ID; `item.type` is the card number. Board cards use `#card_{dbId}` — decode card number from `background-position`.
2. **Sprite-based cards.** Cards are `<div>` elements styled with `background-position` on a 10-column sprite sheet. Card number = `row * 10 + col + 1` where `col = |X%|/100`, `row = |Y%|/100`.
3. **`gameui.gamedatas.hand` is STALE.** Frozen at page load. Use `gameui.playerHand.getAllItems()` instead.
4. **`gameui.gamedatas.table` is STALE.** Frozen at page load. Read board from DOM `#row_card_zone_X` elements instead.
5. **Score is "starting score" minus penalties.** Default starting score is 66. Lower = worse.
6. **Multi-active state.** `cardSelect` is a multi-player simultaneous state. All players choose at once.
7. **No confirmation.** Clicking a hand card immediately submits the choice via AJAX.
8. **Tutorials are view-only.** BGA tutorials run in `g_archive_mode` and cannot be played interactively.
9. **State names.** Live games use `cardSelect` and `takeRow` (NOT `cardChoice`/`smallestCard`).
10. **Professional variant uses different mechanics.** When `professional === "1"`, don't auto-play.
11. **Dojo popups.** BGA uses Dijit/Dojo popups that can intercept clicks. Dismiss with: `document.querySelector('.dijitPopup').style.display = 'none'`
