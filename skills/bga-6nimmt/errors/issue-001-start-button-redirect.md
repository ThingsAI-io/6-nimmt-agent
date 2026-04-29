# Issue: Start Button Redirect Timeout

**Date:** 2026-04-28T16:42:01Z  
**Severity:** Medium (can workaround by joining existing tables)
**Status:** Root cause understood

## Problem
After clicking "Start" button on game panel (`/gamepanel?game=sechsnimmt`), the page does not redirect to a game table. `wait_for` call for `#game_play_area` times out after 30s.

## Root Cause
"Start" creates a new table and waits for matchmaking. The correct approach for fast play is to **join an existing table** by clicking an "Available" slot.

## Fix
Use "Show N tables waiting for players" → click an existing table's Available slot instead of auto-matchmaking.

---

# Issue: Board Always Empty (FIXED)

**Date:** 2026-04-28T16:53:00Z  
**Severity:** Critical  
**Status:** FIXED

## Problem
Board always parsed as `[[], [], [], []]` even when cards are visible on screen.

## Root Cause
`gd.table` is NOT a flat object of cards. It's `{ "1": [cards...], "2": [cards...], "3": [cards...], "4": [cards...] }` — an **object of arrays** keyed by row number.

Old (broken) code treated it as flat:
```javascript
Object.values(gd.table).forEach(c => {
  const row = parseInt(c.location_arg.charAt(0)) - 1;
  // c is actually an ARRAY, not a card object!
});
```

## Fix
```javascript
Object.entries(gd.table).forEach(([rowKey, cards]) => {
  const rowIdx = parseInt(rowKey) - 1;
  cards.forEach(c => board[rowIdx].push(parseInt(c.type_arg)));
});
```

---

# Issue: Hand Shows All Cards After Playing (Known Limitation)

**Date:** 2026-04-28T16:54:00Z  
**Severity:** High  
**Status:** Documented — track played cards locally

## Problem
After playing a card, `gameui.gamedatas.hand` still contains the played card. This causes the MCP session to drift because we pass stale hand data.

## Root Cause
BGA only removes cards from `gamedatas.hand` after the server-side round resolution is complete (all players have played + cards placed). During the multi-active `cardSelect` phase, your played card remains in the hand object.

## Workaround
Track played cards locally:
```javascript
let playedThisRound = [];
// After each play:
playedThisRound.push(cardPlayed);
// True hand = gamedatas.hand minus playedThisRound
const trueHand = hand.filter(c => !playedThisRound.includes(c));
```

---

# Issue: State Name is "cardSelect" not "cardChoice"

**Date:** 2026-04-28T16:53:00Z  
**Severity:** Medium  
**Status:** FIXED in agent

## Problem
Agent instructions reference `cardChoice` but live BGA uses `cardSelect`. Also observed `takeRow` instead of just `smallestCard`.

## Fix
Check for both names: `cardSelect` OR `cardChoice`, `takeRow` OR `smallestCard`.

