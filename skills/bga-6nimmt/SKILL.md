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

**Primary method — `gameui.gamedatas` object (most reliable):**
```javascript
// Execute via browser_evaluate
() => {
  const gd = gameui.gamedatas;
  const hand = Object.values(gd.hand).map(c => parseInt(c.type_arg));
  
  // gd.table is { "1": [cards...], "2": [cards...], "3": [cards...], "4": [cards...] }
  const board = [[], [], [], []];
  Object.entries(gd.table).forEach(([rowKey, cards]) => {
    const rowIdx = parseInt(rowKey) - 1;
    cards.forEach(c => board[rowIdx].push(parseInt(c.type_arg)));
  });
  
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

**Board state extraction from `gameui.gamedatas.table`:**
- `gd.table` is an **object of arrays**: `{ "1": [{card}, {card}], "2": [...], "3": [...], "4": [...] }`
- Keys are row numbers "1"–"4" 
- Values are arrays of card objects in that row
- Each card object has `type_arg` (card number as string)
- Parse with: `Object.entries(gd.table).forEach(([rowKey, cards]) => { ... })`
- Do NOT use `Object.values(gd.table).forEach(c => c.location_arg...)` — that iterates arrays, not cards!

**Game state names (from `gameui.gamedatas.gamestate.name`):**
| State Name | Meaning | Our Action |
|---|---|---|
| `cardChoice` | All players must choose a card | Play a card |
| `smallestCard` | Active player must take a row | Pick a row (take) |
| `multipleChoice` | Active player must choose row to place card | Pick a row (choose) |
| `cardPlace` | Cards being placed (server-side) | Wait |
| `endTurn` | Turn resolving | Wait |
| `roundStart` / `roundBegin` | New round starting | Read new hand |
| `gameEnd` | Game over | End session |

**Fallback DOM selectors:**
```
# Hand cards
#player_hand .stockitem            → id="player_hand_item_{cardNumber}"
[id^="player_hand_item_"]          → card number is the suffix

# Board rows (4 rows, 6 slots each)
#row_1, #row_2, #row_3, #row_4    → row containers
#place_{row}{col}                  → e.g. #place_11, #place_12, ... #place_46
Cards inside: [id^="card_"]        → id="card_{cardNumber}"

# Cards on table (initial deal / revealed)
#cards_on_table .card_on_table     → id="card_{cardNumber}"

# Row pick buttons
#chooserow_1 ... #chooserow_4      → click to choose row (class "chooserow_btn")
#takerow_1 ... #takerow_4          → click to take row (class "takerow_btn")

# Game status text
#pagemaintitletext                 → "You must choose a card to play" etc.

# Player scores
#player_score_{playerId}           → current score text

# Player panels
#player_boards                     → container for all player panels
#overall_player_board_{playerId}   → individual player panel
```

### 3. Play a Card

**Steps:**
1. Detect `gamestate.name === "cardChoice"` and `isCurrentPlayerActive() === true`
2. Read hand: `Object.values(gameui.gamedatas.hand).map(c => parseInt(c.type_arg))`
3. Read board: parse `gameui.gamedatas.table` by `location_arg`
4. Call `session_recommend` with hand + board → get recommended card number
5. Click the card: `page.click('#player_hand_item_' + cardNumber)`
6. The click triggers `onPlayerHandChangeSelection` which calls the AJAX endpoint automatically

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
// Get full game state for MCP
() => {
  const gd = gameui.gamedatas;
  const hand = Object.values(gd.hand).map(c => parseInt(c.type_arg));
  
  // gd.table is { "1": [cards...], "2": [cards...], "3": [cards...], "4": [cards...] }
  const board = [[], [], [], []];
  Object.entries(gd.table).forEach(([rowKey, cards]) => {
    const rowIdx = parseInt(rowKey) - 1;
    cards.forEach(c => board[rowIdx].push(parseInt(c.type_arg)));
  });
  
  const scores = {};
  Object.entries(gd.players).forEach(([id, p]) => {
    scores[id] = parseInt(p.score);
  });
  
  return { hand, board, scores, state: gd.gamestate.name, myId: gameui.player_id };
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

1. **Card IDs = card numbers.** `player_hand_item_43` holds card 43. `card_43` on the board is card 43.
2. **Location arg encoding.** Table cards use `location_arg = "{row}{position}"` — first digit is row (1-4), second is position within row (0-5, **0-indexed**).
3. **Score is "starting score" minus penalties.** Default starting score is 66. Lower = worse.
4. **Multi-active state.** `cardChoice` is a multi-player simultaneous state. All players choose at once.
5. **No confirmation.** Clicking a hand card immediately submits the choice via AJAX.
6. **Sprite-based cards.** Cards are `<div>` elements with `background-position` on a sprite sheet, not separate images. The card number is encoded in the element ID.
7. **Tutorials are view-only.** BGA tutorials (`/tutorial?game=sechsnimmt`) run in `g_archive_mode` with `g_tutorialwritten.mode = "view"`. They block AJAX calls and cannot be played interactively. Only real games support actual play.
8. **Hand doesn't update immediately.** `gameui.gamedatas.hand` retains played cards until the server-side round resolution is complete. Track played cards locally.
9. **State name varies.** Live games use `cardSelect` (not `cardChoice` as documented in some places). Check for both.
10. **Professional variant uses different hand mechanics.** When `professional === "1"`, the hand/card flow is different (drafting). Our engine does NOT support this.
8. **Dojo popups.** BGA uses Dijit/Dojo popups that can intercept clicks. Dismiss with: `document.querySelector('.dijitPopup').style.display = 'none'`
