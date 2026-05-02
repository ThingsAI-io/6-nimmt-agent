# Round 3 Review: Agentic Simulation

> Simulates end-to-end interactions between the Copilot custom agent, Playwright/BGA skills, and the game engine CLI as they would operate during a live BGA game.

---

## Part 1: Interaction Diagram

### 1.1 Component Overview

```
┌─────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  User    │   │  Copilot Agent   │   │  Playwright Skill│   │  BGA Nav Skill   │   │  Game Engine CLI  │
│          │   │  (.github/agents)│   │  (browser ops)   │   │  (BGA DOM)       │   │  (6nimmt)        │
└────┬─────┘   └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
     │                  │                       │                      │                       │
```

### 1.2 Full Lifecycle Sequence

```
User                   Agent                 Playwright           BGA Skill            Engine CLI
 │                       │                       │                    │                    │
 │  "Play 6 Nimmt! on   │                       │                    │                    │
 │   BGA for me"         │                       │                    │                    │
 │──────────────────────>│                       │                    │                    │
 │                       │                       │                    │                    │
 │                       │  ┌─────────────────────────────────────────────────────────┐   │
 │                       │  │ PRE-GAME: Benchmark strategy                            │   │
 │                       │  └─────────────────────────────────────────────────────────┘   │
 │                       │                       │                    │                    │
 │                       │  6nimmt strategies --format json           │                    │
 │                       │──────────────────────────────────────────────────────────────>│
 │                       │<─────────────────────────────────────── {strategies list}─────│
 │                       │                       │                    │                    │
 │                       │  6nimmt simulate -s bayesian,random,random,random -n 100      │
 │                       │──────────────────────────────────────────────────────────────>│
 │                       │<───────────────────────────────────── {batch results}─────────│
 │                       │                       │                    │                    │
 │                       │  ┌─────────────────────────────────────────────────────────┐   │
 │                       │  │ BROWSER SETUP                                           │   │
 │                       │  └─────────────────────────────────────────────────────────┘   │
 │                       │                       │                    │                    │
 │                       │  launch(headless)      │                    │                    │
 │                       │──────────────────────>│                    │                    │
 │                       │<── {browser, page} ───│                    │                    │
 │                       │                       │                    │                    │
 │                       │  navigate(bga.com)     │                    │                    │
 │                       │──────────────────────>│                    │                    │
 │                       │<── page loaded ───────│                    │                    │
 │                       │                       │                    │                    │
 │                       │  ┌─────────────────────────────────────────────────────────┐   │
 │                       │  │ BGA LOGIN & LOBBY                                       │   │
 │                       │  └─────────────────────────────────────────────────────────┘   │
 │                       │                       │                    │                    │
 │                       │  login(user, pass)     │                    │                    │
 │                       │──────────────────────────────────────────>│                    │
 │                       │                       │  fill(#username)   │                    │
 │                       │                       │<──────────────────│                    │
 │                       │                       │  fill(#password)   │                    │
 │                       │                       │<──────────────────│                    │
 │                       │                       │  click(#submit)    │                    │
 │                       │                       │<──────────────────│                    │
 │                       │<──────────────────────────── logged in ───│                    │
 │                       │                       │                    │                    │
 │                       │  joinGame(6nimmt)      │                    │                    │
 │                       │──────────────────────────────────────────>│                    │
 │                       │                       │  navigate(lobby)   │                    │
 │                       │                       │<──────────────────│                    │
 │                       │                       │  click(join btn)   │                    │
 │                       │                       │<──────────────────│                    │
 │                       │<──────────────── in game table ──────────│                    │
 │                       │                       │                    │                    │
 │                       │  ┌─────────────────────────────────────────────────────────┐   │
 │                       │  │ GAME LOOP (repeat per turn)                             │   │
 │                       │  └─────────────────────────────────────────────────────────┘   │
 │                       │                       │                    │                    │
 │                       │  waitForMyTurn()       │                    │                    │
 │                       │──────────────────────────────────────────>│                    │
 │                       │                       │ poll DOM phase     │                    │
 │                       │                       │<──────────────────│                    │
 │                       │<─────── {phase: "card-choice"} ──────────│                    │
 │                       │                       │                    │                    │
 │                       │  readGameState()       │                    │                    │
 │                       │──────────────────────────────────────────>│                    │
 │                       │                       │ read DOM rows      │                    │
 │                       │                       │ read DOM hand      │                    │
 │                       │                       │ read DOM scores    │                    │
 │                       │                       │<──────────────────│                    │
 │                       │<─────── {CardChoiceState JSON} ──────────│                    │
 │                       │                       │                    │                    │
 │                       │  6nimmt recommend --state '<json>' --strategy bayesian         │
 │                       │──────────────────────────────────────────────────────────────>│
 │                       │<──────────────────────────────── {card: 42} ──────────────────│
 │                       │                       │                    │                    │
 │                       │  playCard(42)          │                    │                    │
 │                       │──────────────────────────────────────────>│                    │
 │                       │                       │ click card-42 el   │                    │
 │                       │                       │<──────────────────│                    │
 │                       │                       │ click confirm btn  │                    │
 │                       │                       │<──────────────────│                    │
 │                       │<──────────────── card played ────────────│                    │
 │                       │                       │                    │                    │
 │                       │  waitForResolution()   │                    │                    │
 │                       │──────────────────────────────────────────>│                    │
 │                       │                       │ poll DOM state     │                    │
 │                       │                       │<──────────────────│                    │
 │                       │                       │                    │                    │
 │                       │  ┌────────────────────────────────────────┐                    │
 │                       │  │ IF row-pick needed (rule 4):          │                    │
 │                       │  │                                        │                    │
 │                       │  │  readRowPickState()                    │                    │
 │                       │  │  ───────────────────────────────────>BGA                   │
 │                       │  │  <─── {RowChoiceState JSON} ────────BGA                   │
 │                       │  │                                        │                    │
 │                       │  │  6nimmt recommend --state '<json>'     │                    │
 │                       │  │    --decision row --strategy bayesian  │                    │
 │                       │  │  ──────────────────────────────────>Engine                 │
 │                       │  │  <──── {rowIndex: 2} ──────────────Engine                 │
 │                       │  │                                        │                    │
 │                       │  │  pickRow(2)                            │                    │
 │                       │  │  ───────────────────────────────────>BGA                   │
 │                       │  │  <───── row picked ─────────────────BGA                   │
 │                       │  └────────────────────────────────────────┘                    │
 │                       │                       │                    │                    │
 │                       │  ─── loop back to waitForMyTurn() ───     │                    │
 │                       │                       │                    │                    │
 │                       │  ┌─────────────────────────────────────────────────────────┐   │
 │                       │  │ GAME END                                                │   │
 │                       │  └─────────────────────────────────────────────────────────┘   │
 │                       │                       │                    │                    │
 │                       │  readFinalResults()    │                    │                    │
 │                       │──────────────────────────────────────────>│                    │
 │                       │<──── {scores, rankings} ─────────────────│                    │
 │                       │                       │                    │                    │
 │                       │  close()               │                    │                    │
 │                       │──────────────────────>│                    │                    │
 │                       │<── browser closed ────│                    │                    │
 │                       │                       │                    │                    │
 │  "Game over! You      │                       │                    │                    │
 │   placed 2nd with     │                       │                    │                    │
 │   28 penalty points"  │                       │                    │                    │
 │<──────────────────────│                       │                    │                    │
```

### 1.3 Key Observation: Missing `recommend` Command

The sequence diagram reveals **the most critical gap** in the current spec. The existing CLI commands are:
- `simulate` — batch game simulation (offline only)
- `strategies` — list strategies
- `play` — run a full game turn-by-turn (offline only)

**None of these support the live BGA use case.** The agent needs a command like:

```
6nimmt recommend \
  --state '<CardChoiceState JSON>' \
  --strategy bayesian \
  --format json
```

This command does NOT exist in `spec/cli.md`. This is a **blocking gap**.

---

## Part 2: Simulated Walkthrough

### Scenario A: Full Game (Happy Path)

**Setup:** 4-player game on BGA. Agent is "player-1" using bayesian strategy. Opponents are human players: alice, bob, carol.

---

#### A.0 Pre-Game Strategy Check

```
AGENT → CLI:
$ 6nimmt strategies --format json

CLI OUTPUT:
{
  "meta": { "command": "strategies", "version": "1.0.0", "timestamp": "2025-07-01T14:00:00Z", "durationMs": 3 },
  "strategies": [
    { "name": "random", "description": "Picks a card uniformly at random. Baseline strategy." },
    { "name": "bayesian", "description": "Maintains probability distributions over opponent hands." }
  ],
  "usage": {
    "simulateExample": "6nimmt simulate --strategies random,random,random,random --games 100",
    "playerCountRange": { "min": 2, "max": 10 },
    "strategyNamesCaseSensitive": true
  }
}

AGENT DECIDES: Use "bayesian" strategy. It's available.
```

#### A.1 Browser Launch & BGA Login

```
AGENT → PLAYWRIGHT SKILL:
  launch({ headless: true, timeout: 30000 })

PLAYWRIGHT OUTPUT:
  { browserId: "br-1", pageId: "pg-1", status: "ready" }

AGENT → PLAYWRIGHT SKILL:
  navigate({ pageId: "pg-1", url: "https://boardgamearena.com" })

PLAYWRIGHT OUTPUT:
  { status: "loaded", title: "Board Game Arena", url: "https://boardgamearena.com/" }

AGENT → BGA SKILL:
  login({ pageId: "pg-1", username: "agent-player", password: "••••••" })

BGA SKILL INTERNALLY:
  → page.fill('#username_input', 'agent-player')
  → page.fill('#password_input', '••••••')
  → page.click('#submit_login_button')
  → page.waitForSelector('#header_username', { timeout: 10000 })

BGA SKILL OUTPUT:
  { status: "logged_in", username: "agent-player" }

AGENT DECIDES: Login succeeded. Navigate to 6 Nimmt! lobby.
```

#### A.2 Join Game

```
AGENT → BGA SKILL:
  joinGame({ pageId: "pg-1", game: "sechsnimmt", tableId: "283947561" })

BGA SKILL INTERNALLY:
  → page.goto('https://boardgamearena.com/table?table=283947561')
  → page.waitForSelector('#game_play_area', { timeout: 15000 })

BGA SKILL OUTPUT:
  {
    status: "in_game",
    tableId: "283947561",
    players: ["agent-player", "alice", "bob", "carol"],
    myPosition: 0
  }

AGENT DECIDES: Seated in game. Wait for first turn.
```

---

#### A.3 Turn 1 — Normal Card Placement

```
AGENT → BGA SKILL:
  waitForMyTurn({ pageId: "pg-1", timeout: 120000 })

BGA SKILL INTERNALLY:
  → poll: page.waitForSelector('.card_selectable', { timeout: 120000 })

BGA SKILL OUTPUT:
  { phase: "card-choice", turnTimer: 90 }

AGENT → BGA SKILL:
  readGameState({ pageId: "pg-1" })

BGA SKILL INTERNALLY:
  → Read rows: page.$$eval('.row_container .card', ...)
  → Read hand: page.$$eval('#my_hand .card', ...)
  → Read scores: page.$$eval('.player_score', ...)

BGA SKILL OUTPUT:
  {
    "board": {
      "rows": [
        { "cards": [7] },
        { "cards": [23] },
        { "cards": [55] },
        { "cards": [91] }
      ]
    },
    "hand": [3, 15, 28, 42, 56, 67, 74, 85, 96, 101],
    "playerScores": [
      { "id": "agent-player", "score": 0, "penaltyThisRound": 0 },
      { "id": "alice", "score": 0, "penaltyThisRound": 0 },
      { "id": "bob", "score": 0, "penaltyThisRound": 0 },
      { "id": "carol", "score": 0, "penaltyThisRound": 0 }
    ],
    "playerCount": 4,
    "round": 1,
    "turn": 1,
    "resolvedCardsThisRound": [],
    "initialBoardCards": [7, 23, 55, 91]
  }
```

**🔴 FINDING: Missing `recommend` CLI command.**

The agent now needs to ask the engine "what card should I play?" The current CLI has no command for this. We simulate what the command *should* look like:

```
AGENT → CLI (PROPOSED):
$ 6nimmt recommend \
  --state '{"board":{"rows":[{"cards":[7]},{"cards":[23]},{"cards":[55]},{"cards":[91]}]},"hand":[3,15,28,42,56,67,74,85,96,101],"playerScores":[{"id":"agent-player","score":0,"penaltyThisRound":0},{"id":"alice","score":0,"penaltyThisRound":0},{"id":"bob","score":0,"penaltyThisRound":0},{"id":"carol","score":0,"penaltyThisRound":0}],"playerCount":4,"round":1,"turn":1,"resolvedCardsThisRound":[],"initialBoardCards":[7,23,55,91]}' \
  --strategy bayesian \
  --format json

CLI OUTPUT (PROPOSED):
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 12 },
  "decision": "play-card",
  "recommended": {
    "card": 28,
    "confidence": 0.82,
    "reasoning": "Places safely on row 1 (tail 23). Low overflow risk."
  },
  "alternatives": [
    { "card": 42, "expectedPenalty": 1.2 },
    { "card": 56, "expectedPenalty": 2.8 },
    { "card": 67, "expectedPenalty": 3.1 }
  ]
}

AGENT DECIDES: Play card 28. Engine recommends it with 82% confidence.
```

```
AGENT → BGA SKILL:
  playCard({ pageId: "pg-1", card: 28 })

BGA SKILL INTERNALLY:
  → page.click('[data-card-number="28"]')
  → page.waitForSelector('.card_selected[data-card-number="28"]')
  → page.click('#confirm_move_button')

BGA SKILL OUTPUT:
  { status: "card_played", card: 28 }

AGENT → BGA SKILL:
  waitForResolution({ pageId: "pg-1", timeout: 60000 })

BGA SKILL INTERNALLY:
  → page.waitForFunction(() => {
      // Wait until all cards are revealed and placed
      return document.querySelector('.turn_resolution_complete') !== null
        || document.querySelector('.card_selectable') !== null
        || document.querySelector('.row_selectable') !== null;
    }, { timeout: 60000 })

BGA SKILL OUTPUT:
  {
    status: "turn_resolved",
    revealedCards: [
      { "player": "agent-player", "card": 28 },
      { "player": "alice", "card": 33 },
      { "player": "bob", "card": 12 },
      { "player": "carol", "card": 94 }
    ],
    placements: [
      { "card": 12, "row": 0, "overflow": false },
      { "card": 28, "row": 1, "overflow": false },
      { "card": 33, "row": 1, "overflow": false },
      { "card": 94, "row": 3, "overflow": false }
    ],
    phase: "card-choice"
  }

AGENT DECIDES: Turn 1 resolved normally. No row pick needed. Board updated. Wait for turn 2.
```

**Board after turn 1:**
```
Row 0: [7, 12]
Row 1: [23, 28, 33]
Row 2: [55]
Row 3: [91, 94]
```

---

#### A.4 Turn 2 — Overflow (Rule 3: 6th Card on a Row)

Assume row 1 fills up during prior turns. We jump to the moment it matters:

```
AGENT → BGA SKILL:
  readGameState({ pageId: "pg-1" })

BGA SKILL OUTPUT:
  {
    "board": {
      "rows": [
        { "cards": [7, 12, 14, 19, 20] },
        { "cards": [23, 28, 33, 44, 48] },
        { "cards": [55, 62] },
        { "cards": [91, 94, 97] }
      ]
    },
    "hand": [42, 56, 67, 74, 85, 96, 101],
    "playerScores": [
      { "id": "agent-player", "score": 0, "penaltyThisRound": 0 },
      { "id": "alice", "score": 0, "penaltyThisRound": 0 },
      { "id": "bob", "score": 3, "penaltyThisRound": 3 },
      { "id": "carol", "score": 0, "penaltyThisRound": 0 }
    ],
    "playerCount": 4,
    "round": 1,
    "turn": 4,
    "resolvedCardsThisRound": [
      { "playerId": "agent-player", "card": 28 },
      { "playerId": "alice", "card": 33 },
      { "playerId": "bob", "card": 12 },
      { "playerId": "carol", "card": 94 },
      { "playerId": "agent-player", "card": 15 },
      { "playerId": "alice", "card": 44 },
      { "playerId": "bob", "card": 14 },
      { "playerId": "carol", "card": 97 },
      { "playerId": "agent-player", "card": 96 },
      { "playerId": "alice", "card": 48 },
      { "playerId": "bob", "card": 19 },
      { "playerId": "carol", "card": 62 }
    ],
    "initialBoardCards": [7, 23, 55, 91]
  }
```

**🔴 FINDING: `resolvedCardsThisRound` ordering.** The spec says "Ordered ascending by card number within each turn." But the BGA DOM will reveal cards in order of play resolution (lowest card first per turn). The BGA skill must sort cards within each turn group when constructing the state. The spec does NOT explicitly tell the BGA skill how to identify turn boundaries within `resolvedCardsThisRound`.

```
AGENT → CLI (PROPOSED):
$ 6nimmt recommend \
  --state '<CardChoiceState with row 0 at 5 cards>' \
  --strategy bayesian \
  --format json

CLI OUTPUT (PROPOSED):
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 18 },
  "decision": "play-card",
  "recommended": {
    "card": 56,
    "confidence": 0.71,
    "reasoning": "Places on row 2 (tail 62→ no, tail 55 < 56). Row 0 is full (5 cards) — avoid. Row 1 has 5 cards — avoid."
  },
  "alternatives": [
    { "card": 67, "expectedPenalty": 2.5 },
    { "card": 74, "expectedPenalty": 4.0 }
  ]
}

AGENT DECIDES: Play card 56. Places on row 2 safely, avoiding overflow rows.
```

```
AGENT → BGA SKILL:
  playCard({ pageId: "pg-1", card: 56 })

BGA SKILL OUTPUT:
  { status: "card_played", card: 56 }

AGENT → BGA SKILL:
  waitForResolution({ pageId: "pg-1", timeout: 60000 })

BGA SKILL OUTPUT:
  {
    status: "turn_resolved",
    revealedCards: [
      { "player": "agent-player", "card": 56 },
      { "player": "alice", "card": 21 },
      { "player": "bob", "card": 50 },
      { "player": "carol", "card": 99 }
    ],
    placements: [
      { "card": 21, "row": 0, "overflow": true,
        "collectedCards": [7, 12, 14, 19, 20],
        "collectedBy": "alice",
        "penalty": 6 },
      { "card": 50, "row": 1, "overflow": true,
        "collectedCards": [23, 28, 33, 44, 48],
        "collectedBy": "bob",
        "penalty": 10 },
      { "card": 56, "row": 2, "overflow": false },
      { "card": 99, "row": 3, "overflow": false }
    ],
    phase: "card-choice"
  }

AGENT DECIDES: Overflow happened on rows 0 and 1 but agent's card 56 placed safely. Good outcome.
```

**Board after turn 4:**
```
Row 0: [21]          (alice collected [7,12,14,19,20], penalty 6)
Row 1: [50]          (bob collected [23,28,33,44,48], penalty 10)
Row 2: [55, 56]
Row 3: [91, 94, 97, 99]
```

**🟡 FINDING: Overflow is automatic — no agent action needed.** The engine spec correctly states overflow (rule 3) doesn't require a `PickRowMove`. But the BGA skill must distinguish between "overflow happened automatically" (no action) vs "must-pick-row triggered" (agent must click a row). The BGA skill needs to detect which situation it's in by reading the DOM phase.

---

#### A.5 Turn 5 — Must-Pick-Row (Rule 4)

Agent has card 3 in hand, which is lower than all row tails:

```
AGENT → BGA SKILL:
  readGameState({ pageId: "pg-1" })

BGA SKILL OUTPUT:
  {
    "board": {
      "rows": [
        { "cards": [21, 25] },
        { "cards": [50, 52, 58] },
        { "cards": [55, 56, 60, 63] },
        { "cards": [91, 94, 97, 99, 103] }
      ]
    },
    "hand": [3, 67, 74, 85, 101],
    "playerScores": [
      { "id": "agent-player", "score": 0, "penaltyThisRound": 0 },
      { "id": "alice", "score": 6, "penaltyThisRound": 6 },
      { "id": "bob", "score": 13, "penaltyThisRound": 13 },
      { "id": "carol", "score": 0, "penaltyThisRound": 0 }
    ],
    "playerCount": 4,
    "round": 1,
    "turn": 6,
    "resolvedCardsThisRound": [ ... ],
    "initialBoardCards": [7, 23, 55, 91]
  }
```

Row tails: 25, 58, 63, 103. Card 3 < all of them. Agent must play 3 and then pick a row.

The bayesian strategy might recommend playing 3 deliberately to pick the lowest-penalty row:

```
AGENT → CLI (PROPOSED):
$ 6nimmt recommend \
  --state '<CardChoiceState>' \
  --strategy bayesian \
  --format json

CLI OUTPUT (PROPOSED):
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 25 },
  "decision": "play-card",
  "recommended": {
    "card": 3,
    "confidence": 0.55,
    "reasoning": "Card 3 forces row pick. Row 0 has penalty 2 (cheapest). Playing other cards risks worse outcomes."
  },
  "alternatives": [
    { "card": 67, "expectedPenalty": 4.2 },
    { "card": 74, "expectedPenalty": 5.1 }
  ]
}

AGENT DECIDES: Play card 3 — this will trigger rule 4.
```

```
AGENT → BGA SKILL:
  playCard({ pageId: "pg-1", card: 3 })
  
BGA SKILL OUTPUT:
  { status: "card_played", card: 3 }

AGENT → BGA SKILL:
  waitForResolution({ pageId: "pg-1", timeout: 60000 })

BGA SKILL OUTPUT:
  {
    status: "awaiting_row_pick",
    triggeringCard: 3,
    message: "Your card is lower than all rows. Pick a row to take."
  }

AGENT DECIDES: Need to pick a row. Read the row-pick state.
```

Now the agent reads the RowChoiceState and asks the engine for a row recommendation:

```
AGENT → BGA SKILL:
  readRowPickState({ pageId: "pg-1" })

BGA SKILL OUTPUT:
  {
    "board": {
      "rows": [
        { "cards": [21, 25] },
        { "cards": [50, 52, 58] },
        { "cards": [55, 56, 60, 63] },
        { "cards": [91, 94, 97, 99, 103] }
      ]
    },
    "hand": [67, 74, 85, 101],
    "playerScores": [
      { "id": "agent-player", "score": 0, "penaltyThisRound": 0 },
      { "id": "alice", "score": 6, "penaltyThisRound": 6 },
      { "id": "bob", "score": 13, "penaltyThisRound": 13 },
      { "id": "carol", "score": 0, "penaltyThisRound": 0 }
    ],
    "playerCount": 4,
    "round": 1,
    "turn": 6,
    "resolvedCardsThisRound": [ ... ],
    "initialBoardCards": [7, 23, 55, 91],
    "triggeringCard": 3,
    "revealedThisTurn": [
      { "playerId": "agent-player", "card": 3 },
      { "playerId": "alice", "card": 40 },
      { "playerId": "bob", "card": 72 },
      { "playerId": "carol", "card": 95 }
    ],
    "resolutionIndex": 0
  }
```

**🟡 FINDING: `RowChoiceState` requires fields not trivially available from DOM.** The BGA DOM likely shows the revealed cards, but `resolutionIndex` and `revealedThisTurn` are engine-level concepts. The BGA skill will need to infer these from the DOM state (e.g., which cards are visible, which have already been placed). This translation logic is non-trivial.

```
AGENT → CLI (PROPOSED):
$ 6nimmt recommend \
  --state '<RowChoiceState JSON>' \
  --strategy bayesian \
  --decision row \
  --format json

CLI OUTPUT (PROPOSED):
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 8 },
  "decision": "pick-row",
  "recommended": {
    "rowIndex": 0,
    "penalty": 2,
    "reasoning": "Row 0 has only 2 cattle heads (cards 21, 25). All other rows cost more."
  },
  "alternatives": [
    { "rowIndex": 1, "penalty": 4 },
    { "rowIndex": 2, "penalty": 5 },
    { "rowIndex": 3, "penalty": 14 }
  ]
}

AGENT DECIDES: Pick row 0 (penalty 2).
```

```
AGENT → BGA SKILL:
  pickRow({ pageId: "pg-1", rowIndex: 0 })

BGA SKILL INTERNALLY:
  → page.click('.row_container[data-row-index="0"]')
  → page.waitForSelector('.turn_resolution_complete', { timeout: 15000 })

BGA SKILL OUTPUT:
  { status: "row_picked", rowIndex: 0, collectedCards: [21, 25], penalty: 2 }

AGENT DECIDES: Picked row 0. Agent now has 2 penalty points this round. Continue game.
```

**Board after turn 6 (after all placements):**
```
Row 0: [3]           (agent collected [21, 25], penalty 2)
Row 1: [50, 52, 58]  (40 placed → [40] after further resolution)
Row 2: [55, 56, 60, 63]
Row 3: [91, 94, 97, 99, 103]  (95 placed → overflow!)
```

---

### Scenario B: Error Recovery

#### B.1 BGA Page Loads Slowly — DOM Not Ready

```
AGENT → BGA SKILL:
  readGameState({ pageId: "pg-1" })

BGA SKILL INTERNALLY:
  → page.waitForSelector('.row_container', { timeout: 5000 })
  → TIMEOUT — element not found

BGA SKILL OUTPUT:
  {
    "error": true,
    "code": "DOM_NOT_READY",
    "message": "Game board not loaded within 5000ms. Rows not found."
  }

AGENT DECIDES: DOM not ready. Retry with backoff.
```

```
AGENT → PLAYWRIGHT SKILL:
  wait({ pageId: "pg-1", ms: 3000 })

PLAYWRIGHT OUTPUT:
  { status: "waited", ms: 3000 }

AGENT → BGA SKILL:
  readGameState({ pageId: "pg-1" })

BGA SKILL OUTPUT:
  { ... valid CardChoiceState ... }

AGENT DECIDES: State read successfully on retry. Continue normal flow.
```

**🟡 FINDING: No retry/timeout configuration in BGA skill spec.** The BGA skill needs a configurable timeout and retry policy. Currently the spec doesn't define:
- Default timeout for DOM reads
- Max retry count
- Backoff strategy
- What constitutes "DOM ready" for each game phase

---

#### B.2 Agent Plays Wrong Card — BGA Rejects

```
AGENT → BGA SKILL:
  playCard({ pageId: "pg-1", card: 42 })

BGA SKILL INTERNALLY:
  → page.click('[data-card-number="42"]')
  → Element not found — card 42 is not in hand (stale state!)

BGA SKILL OUTPUT:
  {
    "error": true,
    "code": "CARD_NOT_FOUND",
    "message": "Card 42 not found in hand. Available cards: [3, 67, 74, 85, 101]"
  }

AGENT DECIDES: Stale state. Re-read game state and get fresh recommendation.
```

```
AGENT → BGA SKILL:
  readGameState({ pageId: "pg-1" })

BGA SKILL OUTPUT:
  { ... fresh state with hand: [3, 67, 74, 85, 101] ... }

AGENT → CLI (PROPOSED):
$ 6nimmt recommend --state '<fresh state>' --strategy bayesian --format json

CLI OUTPUT:
  { "recommended": { "card": 67, ... } }

AGENT → BGA SKILL:
  playCard({ pageId: "pg-1", card: 67 })

BGA SKILL OUTPUT:
  { status: "card_played", card: 67 }

AGENT DECIDES: Recovery successful.
```

**🟡 FINDING: Stale state detection is agent-level logic.** The spec doesn't define how the agent detects stale state vs genuine errors. Should the BGA skill always re-read state before executing a move? Or should the agent handle retries? The responsibility boundary is unclear.

---

#### B.3 Opponent Disconnects Mid-Game

```
AGENT → BGA SKILL:
  waitForMyTurn({ pageId: "pg-1", timeout: 120000 })

BGA SKILL INTERNALLY:
  → Polling for turn... 30s... 60s... 90s...
  → BGA shows "bob has left the game" notification
  → BGA auto-replaces bob with AI or ends game

BGA SKILL OUTPUT:
  {
    "status": "game_state_changed",
    "event": "player_disconnected",
    "disconnectedPlayer": "bob",
    "bgaAction": "replaced_by_ai",
    "phase": "card-choice"
  }

AGENT DECIDES: bob replaced by BGA AI. Game continues. Read fresh state.
```

**🟡 FINDING: The BGA skill needs to handle non-turn game events.** The current flow assumes `waitForMyTurn` only returns when it's the agent's turn. But BGA can trigger:
- Player disconnect/replacement
- Game cancellation
- Chat messages
- Timer warnings

The skill needs to surface these as structured events, not just "it's your turn" / "timeout".

---

#### B.4 Strategy Recommends Already-Played Card (Stale State)

This scenario is a variant of B.2 but specifically caused by the engine returning a stale recommendation.

```
AGENT → CLI (PROPOSED):
$ 6nimmt recommend --state '<state where hand incorrectly includes card 28>' \
  --strategy bayesian --format json

CLI OUTPUT:
  { "recommended": { "card": 28 } }
```

The agent tries to play card 28 but it's not in the hand (was already played turn 1):

```
AGENT → BGA SKILL:
  playCard({ pageId: "pg-1", card: 28 })

BGA SKILL OUTPUT:
  { "error": true, "code": "CARD_NOT_FOUND", "message": "Card 28 not in hand." }

AGENT DECIDES: Engine received stale state. The bug is in DOM reading — the BGA skill
returned a hand that included a card already played. Must re-read.
```

**🔴 FINDING: No state validation step.** The agent has no way to validate that the state read from the DOM is internally consistent before sending it to the engine. Possible validations:
- Cards in hand should not include cards visible on the board
- Cards in hand should not include cards in `resolvedCardsThisRound`
- Hand size should equal `10 - turn + 1`

This validation should live in the BGA skill or in a shared utility.

---

### Scenario C: Pre-Game Benchmark

#### C.1 List Available Strategies

```
AGENT → CLI:
$ 6nimmt strategies --format json

CLI OUTPUT:
{
  "meta": { "command": "strategies", "version": "1.0.0", "timestamp": "2025-07-01T13:55:00Z", "durationMs": 3 },
  "strategies": [
    { "name": "random", "description": "Picks a card uniformly at random. Baseline strategy." },
    { "name": "bayesian", "description": "Maintains probability distributions over opponent hands." }
  ],
  "usage": {
    "simulateExample": "6nimmt simulate --strategies random,random,random,random --games 100",
    "playerCountRange": { "min": 2, "max": 10 },
    "strategyNamesCaseSensitive": true
  }
}

AGENT DECIDES: 2 strategies available. Will benchmark bayesian against random.
```

#### C.2 Run Simulation Benchmark

```
AGENT → CLI:
$ 6nimmt simulate \
  --strategies "bayesian,random,random,random" \
  --games 1000 \
  --seed "pre-bga-bench-001" \
  --format json

CLI OUTPUT:
{
  "meta": { "command": "simulate", "version": "1.0.0", "timestamp": "2025-07-01T13:56:00Z", "durationMs": 4521 },
  "gamesPlayed": 1000,
  "strategies": ["bayesian", "random", "random", "random"],
  "seed": "pre-bga-bench-001",
  "results": [
    {
      "strategy": "bayesian",
      "seatIndices": [0],
      "playerCount": 1,
      "wins": 583,
      "winRate": 0.583,
      "avgScore": 19.2,
      "medianScore": 16,
      "minScore": 2,
      "maxScore": 68,
      "scoreStdDev": 11.8
    },
    {
      "strategy": "random",
      "seatIndices": [1, 2, 3],
      "playerCount": 3,
      "wins": 417,
      "winRate": 0.139,
      "avgScore": 33.1,
      "medianScore": 30,
      "minScore": 3,
      "maxScore": 92,
      "scoreStdDev": 17.6
    }
  ]
}

AGENT DECIDES: Bayesian wins 58.3% of games. Avg score 19.2 vs 33.1 random. Good edge.
```

#### C.3 Preview a Single Game

```
AGENT → CLI:
$ 6nimmt play \
  --strategies "bayesian,random,random,random" \
  --seed "preview-game-42" \
  --format json

CLI OUTPUT (abbreviated):
{
  "meta": { "command": "play", "version": "1.0.0", "timestamp": "...", "durationMs": 42 },
  "seed": "preview-game-42",
  "strategies": ["bayesian", "random", "random", "random"],
  "rounds": [
    {
      "round": 1,
      "initialBoard": [[3], [17], [42], [88]],
      "turns": [
        {
          "turn": 1,
          "plays": [
            { "seatIndex": 0, "strategy": "bayesian", "card": 55 },
            { "seatIndex": 1, "strategy": "random", "card": 12 },
            { "seatIndex": 2, "strategy": "random", "card": 78 },
            { "seatIndex": 3, "strategy": "random", "card": 45 }
          ],
          "placements": [
            { "card": 12, "rowIndex": 0, "overflow": false },
            { "card": 45, "rowIndex": 2, "overflow": false },
            { "card": 55, "rowIndex": 2, "overflow": false },
            { "card": 78, "rowIndex": 3, "overflow": false }
          ],
          "rowPicks": []
        }
      ],
      "scores": [
        { "seatIndex": 0, "strategy": "bayesian", "roundPenalty": 5, "totalScore": 5 },
        { "seatIndex": 1, "strategy": "random", "roundPenalty": 12, "totalScore": 12 },
        { "seatIndex": 2, "strategy": "random", "roundPenalty": 8, "totalScore": 8 },
        { "seatIndex": 3, "strategy": "random", "roundPenalty": 22, "totalScore": 22 }
      ]
    }
  ],
  "finalResults": [
    { "seatIndex": 0, "strategy": "bayesian", "finalScore": 28, "rank": 1 },
    { "seatIndex": 1, "strategy": "random", "finalScore": 45, "rank": 2 },
    { "seatIndex": 2, "strategy": "random", "finalScore": 52, "rank": 3 },
    { "seatIndex": 3, "strategy": "random", "finalScore": 71, "rank": 4 }
  ]
}

AGENT DECIDES: Bayesian won with 28 points. Strategy looks solid. Ready for live play.
```

#### C.4 Transition to Live BGA Play

```
AGENT DECIDES:
  Benchmark complete. bayesian strategy performs well.
  Now transitioning to live BGA play.
  
  → Launch browser
  → Login to BGA
  → Join game
  → Use bayesian strategy for recommendations

  (Proceeds to Scenario A flow)
```

**🟡 FINDING: No strategy state persistence.** The bayesian strategy accumulates knowledge via `onGameStart()` and `onTurnResolved()` lifecycle hooks. In the CLI simulation, these are called automatically by the GameRunner. In live BGA play:
- `onGameStart()` is never called because there's no GameRunner
- `onTurnResolved()` is never called because the engine isn't tracking the game

The `recommend` command would need to either:
1. Be stateless (re-derive everything from `CardChoiceState` each call), or
2. Support a `--session-id` that maintains strategy state across calls

This is a **fundamental architecture gap** for strategies that learn during a game.

---

## Part 3: Consistency Findings

### 3.1 Blocking Issues

#### F1. Missing `recommend` CLI Command
**Severity: 🔴 BLOCKING**

The CLI spec (`spec/cli.md`) defines `simulate`, `strategies`, and `play` — all for offline use. There is **no command for the live BGA use case**: "given this visible state and a strategy, what move should I make?"

The agent needs:
```
6nimmt recommend \
  --state '<CardChoiceState or RowChoiceState JSON>' \
  --strategy bayesian \
  --decision card|row \
  --format json
```

**Impact:** Without this, the Copilot agent cannot use the engine for live gameplay at all.

**Proposed fix:** Add a `recommend` command to `spec/cli.md` that:
- Accepts a `CardChoiceState` or `RowChoiceState` JSON via `--state`
- Auto-detects the decision type from the state shape (presence of `triggeringCard` → row choice)
- Returns the recommended move plus alternatives with expected penalties
- Is stateless (no session tracking — see F7 for the stateful variant)

---

#### F2. No State Validation Utility
**Severity: 🔴 BLOCKING**

When the BGA skill reads the DOM and constructs a `CardChoiceState`, there's no validation that the state is internally consistent. Bugs in DOM reading (stale data, partial load, race conditions) would produce invalid states that the engine accepts and produces nonsensical recommendations for.

Needed validations:
- `hand.length === 10 - turn + 1`
- No card appears in both `hand` and board rows
- No card appears in both `hand` and `resolvedCardsThisRound`
- All cards are in range 1–104
- Board has exactly 4 rows, each with 1–5 cards
- Row cards are in strictly ascending order

**Proposed fix:** Add a `validate` command or `--validate` flag:
```
6nimmt validate --state '<JSON>' --format json
```
Returns `{ valid: true }` or `{ valid: false, errors: [...] }`.

---

### 3.2 Important Issues

#### F3. Strategy State Not Preserved Across `recommend` Calls
**Severity: 🟡 IMPORTANT**

The `Strategy` interface includes lifecycle hooks (`onGameStart`, `onTurnResolved`, `onRoundEnd`) that accumulate game knowledge. The bayesian strategy specifically "maintains probability distributions over opponent hands."

In the `recommend` command (stateless), these hooks are never called. The strategy would need to:
- Re-derive all opponent hand probability distributions from `resolvedCardsThisRound` + board + hand on every call
- Lose any inter-turn learning

This may be acceptable for some strategies but fundamentally limits the bayesian strategy's effectiveness.

**Proposed fix:** Either:
1. Design the bayesian strategy to be fully reconstructible from `CardChoiceState` (recommended — simpler, more robust)
2. Add session-based state: `6nimmt session start` → returns session ID, `6nimmt recommend --session <id>` → uses accumulated state
3. Accept the limitation and document it

---

#### F4. `resolvedCardsThisRound` Lacks Turn Boundaries
**Severity: 🟡 IMPORTANT**

`CardChoiceState.resolvedCardsThisRound` is a flat array of `{ playerId, card }`. The spec says it's "ordered ascending by card number within each turn" but doesn't include turn numbers. The BGA skill — and the strategy — cannot determine which cards were played together in the same turn.

This matters for the bayesian strategy: knowing that alice played card 33 *in the same turn* as bob played card 12 constrains opponent hand distributions differently than if they were in separate turns.

**Proposed fix:** Add turn index:
```typescript
readonly resolvedCardsThisRound: readonly {
  playerId: string;
  card: CardNumber;
  turn: number;       // ← NEW
}[];
```

---

#### F5. BGA Skill Must Handle Non-Turn Events
**Severity: 🟡 IMPORTANT**

The interaction flow assumes a clean turn cycle: wait → read → recommend → play → wait. In practice, BGA fires many events:
- Player disconnects / reconnects
- Chat messages
- Timer warnings (30s, 10s remaining)
- Game cancelled by admin
- BGA server maintenance notification

The BGA skill's `waitForMyTurn()` needs to return structured events, not just "it's your turn":

```typescript
type WaitResult =
  | { kind: "my-turn"; phase: "card-choice" | "row-pick" }
  | { kind: "player-event"; event: "disconnect" | "reconnect"; playerId: string }
  | { kind: "game-over"; reason: "normal" | "cancelled" | "timeout" }
  | { kind: "timer-warning"; secondsRemaining: number };
```

---

#### F6. BGA DOM → `RowChoiceState` Translation is Non-Trivial
**Severity: 🟡 IMPORTANT**

`RowChoiceState` requires:
- `triggeringCard` — the card that triggered the row pick
- `revealedThisTurn` — all cards revealed this turn with player attribution
- `resolutionIndex` — how many cards have been resolved before this one

These are engine-internal concepts. On BGA:
- The triggering card is shown in the UI (likely highlighted)
- All revealed cards are visible (BGA shows them simultaneously)
- Resolution index is implicit (BGA resolves cards visually one at a time)

The BGA skill must infer `resolutionIndex` from the DOM state (e.g., which cards have been placed on rows already). This is fragile.

**Proposed fix:** Consider whether `resolutionIndex` is truly needed for the strategy's decision. For `chooseRow()`, the key info is the current board state and which card triggered the pick. If `resolutionIndex` is only informational, make it optional. If strategies need it, document how the BGA skill should derive it.

---

#### F7. `recommend` Input Could Be Passed via File
**Severity: 🟡 IMPORTANT**

The `--state` argument for `recommend` would contain a full `CardChoiceState` JSON, which can be 1–2KB. This may hit shell argument length limits on some platforms. Consider supporting:

```
6nimmt recommend --state-file state.json --strategy bayesian
# or
cat state.json | 6nimmt recommend --strategy bayesian
```

---

#### F8. `play` Command Output Uses `seatIndex`, CLI Input Uses Strategy Names
**Severity: 🟡 IMPORTANT**

The `play` command output references players by `seatIndex` (0-based integer):
```json
{ "seatIndex": 0, "strategy": "bayesian", "card": 55 }
```

But `CardChoiceState` uses `id` (string):
```json
{ "id": "agent-player", "score": 0 }
```

In the `recommend` command, the agent would need to use string IDs (matching BGA player names). But the offline `play` command uses seat indices. This naming inconsistency between offline and online modes could cause confusion.

**Proposed fix:** Use string `id` consistently everywhere. The `play` command could auto-generate IDs like `"player-0"`, `"player-1"`, etc. Or accept `--player-ids` for custom names.

---

#### F9. No Way to Feed Turn Resolution Back to Engine
**Severity: 🟡 IMPORTANT**

After the agent plays a card and BGA resolves the turn, the agent sees what cards other players played. The bayesian strategy needs this information via `onTurnResolved()`. But in the stateless `recommend` flow, there's nowhere to send it.

If the agent tracks `resolvedCardsThisRound` in the `CardChoiceState` (which is read from DOM each turn), the information is implicitly available. But the strategy must be able to reconstruct its internal models from this flat history — it cannot rely on incremental updates.

This reinforces F3: the strategy must be reconstructible from the visible state alone.

---

### 3.3 Minor Issues

#### F10. `play` Output Schema Inconsistency: `initialBoard` vs `Board`
**Severity: 🟢 MINOR**

The `play` command outputs:
```json
"initialBoard": [[3], [17], [42], [88]]
```

This is a `number[][]` — an array of arrays of numbers. But the engine's `Board` type uses:
```json
{ "rows": [{ "cards": [3] }, { "cards": [17] }, ...] }
```

Two different representations of the same data. The `recommend` command would need to use the `Board` format (matching `CardChoiceState`), but the `play` command uses the flat format. Inconsistent.

**Proposed fix:** Use the `{ rows: [{ cards: [...] }] }` format everywhere in JSON output, or at minimum document both formats clearly.

---

#### F11. No BGA-Specific Error Codes in CLI
**Severity: 🟢 MINOR**

The CLI error codes (`INVALID_STRATEGY`, `INVALID_PLAYER_COUNT`, etc.) cover offline usage. For the `recommend` command, additional error codes are needed:
- `INVALID_STATE` — the provided state JSON is malformed or fails validation
- `MISSING_STATE` — `--state` not provided
- `INCOMPATIBLE_DECISION` — strategy was asked for a row pick but state is a card-choice state

---

#### F12. No `--timeout` Flag on `recommend`
**Severity: 🟢 MINOR**

BGA has turn timers (typically 90 seconds). The agent needs the `recommend` command to finish quickly. If the bayesian strategy gets stuck in computation, the agent should be able to bail out:

```
6nimmt recommend --state '<json>' --strategy bayesian --timeout 5000 --format json
```

If computation exceeds timeout, fall back to a simpler recommendation (e.g., random).

---

#### F13. `CardChoiceState.initialBoardCards` Requires Memory
**Severity: 🟢 MINOR**

`CardChoiceState` includes `initialBoardCards` — the 4 cards that started the board at the beginning of the round. This information is NOT typically shown on the BGA DOM after the first turn. The BGA skill would need to:
1. Read and cache the initial board cards at the start of each round, or
2. Derive them by tracking which cards were placed on empty rows

This is doable but adds complexity to the BGA skill's state management.

---

#### F14. No `--state` Input via Stdin Support Specified
**Severity: 🟢 MINOR**

Related to F7. The CLI spec doesn't mention stdin support for any command. For an AI agent calling the CLI, piping JSON through stdin is more natural and avoids shell escaping issues:

```
echo '{ ... }' | 6nimmt recommend --strategy bayesian --format json
```

---

#### F15. Credential Handling for BGA Not Specified
**Severity: 🟢 MINOR**

The BGA skill needs login credentials. The interaction diagram shows `login(user, pass)` but doesn't specify:
- Where credentials are stored (environment variables? config file? secrets manager?)
- Whether OAuth/SSO is supported (BGA uses email/password)
- Token refresh for long sessions
- This is BGA skill concern, not engine concern, but should be documented

---

## Appendix: State Translation Reference

### BGA DOM → CardChoiceState Mapping

| CardChoiceState field       | BGA DOM source                              | Complexity |
|-----------------------------|---------------------------------------------|------------|
| `board.rows[].cards`        | `.row_container .card` elements             | Medium     |
| `hand`                      | `#my_hand .card` elements                   | Low        |
| `playerScores[].id`         | `.player_board .player_name`                | Low        |
| `playerScores[].score`      | `.player_score_value`                       | Low        |
| `playerScores[].penaltyThisRound` | `.player_penalty` or derived          | Medium     |
| `playerCount`               | Count of `.player_board` elements           | Low        |
| `round`                     | `.round_indicator` or derived               | Medium     |
| `turn`                      | `.turn_indicator` or derived                | Medium     |
| `resolvedCardsThisRound`    | Game log or DOM card animations             | High       |
| `initialBoardCards`         | Must be cached from round start             | High       |

### BGA DOM → RowChoiceState Additional Fields

| RowChoiceState field        | BGA DOM source                              | Complexity |
|-----------------------------|---------------------------------------------|------------|
| `triggeringCard`            | Highlighted card in resolution area         | Medium     |
| `revealedThisTurn`          | Cards in the reveal area with player labels | Medium     |
| `resolutionIndex`           | Count of already-placed revealed cards      | High       |

---

## Appendix: Proposed `recommend` Command Specification

```
6nimmt recommend \
  --state '<JSON>'          # CardChoiceState or RowChoiceState
  --state-file <path>       # Alternative: read state from file
  --strategy <name>         # Which strategy to use
  --format json|table       # Output format
  --timeout <ms>            # Max computation time (default: 5000)
```

### Output Schema (card choice):
```json
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 12 },
  "stateType": "card-choice",
  "move": {
    "kind": "play-card",
    "card": 28
  },
  "analysis": {
    "expectedPenalty": 0.8,
    "confidence": 0.82
  },
  "alternatives": [
    { "card": 42, "expectedPenalty": 1.2 },
    { "card": 56, "expectedPenalty": 2.8 }
  ]
}
```

### Output Schema (row choice):
```json
{
  "meta": { "command": "recommend", "version": "1.0.0", "timestamp": "...", "durationMs": 5 },
  "stateType": "row-choice",
  "move": {
    "kind": "pick-row",
    "rowIndex": 0
  },
  "analysis": {
    "rowPenalties": [2, 4, 5, 14],
    "reasoning": "Row 0 has lowest penalty (2 cattle heads)"
  }
}
```

### State Type Auto-Detection:
- If JSON contains `triggeringCard` → `RowChoiceState` → row recommendation
- Otherwise → `CardChoiceState` → card recommendation

### Error Codes:
- `INVALID_STATE` — JSON parse failure or schema validation failure
- `STATE_VALIDATION_FAILED` — state is parseable but internally inconsistent (see F2)
- `UNKNOWN_STRATEGY` — strategy name not in registry
- `TIMEOUT` — computation exceeded `--timeout`
