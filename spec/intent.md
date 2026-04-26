# 6 Nimmt! Agent — Project Intent

## What This Repo Is

This repository builds an **AI agent** that plays the card game [6 Nimmt!](spec/rules/6-nimmt.md) online — initially on [Board Game Arena (BGA)](https://boardgamearena.com/gamepanel?game=sechsnimmt) — and a **game engine** that powers its decision-making.

The game's card-placement rules are entirely deterministic; the only decision point each turn is **which card to play** (and, in edge cases, **which row to pick up**). The advisory logic therefore lives in a TypeScript game engine, not in an LLM. The agent's role is minimal: connect to the web implementation, read the game state, call the engine, and execute the recommended move.

## Architecture Overview

```
┌──────────────────────────────────────────────┐
│                   Agent                       │
│  (headless browser via Puppeteer/Playwright)  │
│  • Reads game state from BGA DOM              │
│  • Calls Engine for recommendation            │
│  • Executes the move on the page              │
└────────────────┬─────────────────────────────┘
                 │  GameState → RecommendedMove
                 ▼
┌──────────────────────────────────────────────┐
│              Game Engine (TypeScript)          │
│  • Models the full game state                 │
│  • Implements pluggable strategies:           │
│    – Random (baseline)                        │
│    – Heuristic / greedy                       │
│    – Bayesian inference                       │
│    – Neural net (future)                      │
│  • Deterministic card-placement rules         │
│  • Row-pickup decision logic                  │
└──────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│            Simulator / Benchmark CLI           │
│  • Runs N games with configurable players     │
│  • e.g. 1 bayesian vs 4 random               │
│  • Outputs win rates, avg scores, etc.        │
└──────────────────────────────────────────────┘
```

## Components

### 1. Game Engine (`src/engine/`)

A pure TypeScript library that:

- Models the deck, hands, rows, scores, and full game state.
- Enforces the deterministic placement and pickup rules (see [rules](spec/rules/6-nimmt.md)).
- Exposes a `recommend(state, hand, strategy): Move` function.
- Supports pluggable **strategies** behind a common interface:
  - **Random** — picks a card uniformly at random. The baseline.
  - **Heuristic / Greedy** — minimises expected penalty using simple rules (e.g. avoid rows near 5, prefer cards close to row ends).
  - **Bayesian** — maintains a probability distribution over unseen cards and evaluates expected penalty for each candidate play.
  - **Neural Net** (future) — trained on game logs to predict optimal play.
- When the played card is lower than all row ends, the engine also recommends **which row to pick up** (strategy-dependent).

### 2. Headless Agent (`src/agent/`) — P0

A headless browser automation layer (Puppeteer or Playwright) that:

- Logs in to BGA and joins / creates a 6 Nimmt! game.
- Reads the current game state from the DOM (rows, own hand, scores).
- Translates DOM state → engine `GameState`.
- Calls the engine for a recommendation.
- Clicks the recommended card (and row, if needed).
- Loops until the game ends.

### 3. Browser Extension (`src/extension/`) — Post-MVP

A Chrome extension overlay that:

- Reads the BGA page DOM passively.
- Displays engine recommendations as an overlay (no auto-play).
- Useful for human-assisted play and testing strategies live.

### 4. Simulator / Benchmark CLI (`src/sim/`)

A CLI tool that:

- Runs N complete games with configurable player compositions (e.g. `--players bayesian,random,random,random,random`).
- Outputs per-strategy statistics: win rate, average score, score distribution.
- Enables rapid iteration on strategies without needing a live BGA session.

## Tech Stack

- **Language:** TypeScript (Node.js)
- **Browser Automation:** Puppeteer or Playwright
- **Testing:** Vitest or Jest
- **CLI:** Node.js script (possibly with `commander` or similar)

## What This Repo Is *Not*

- Not an LLM-based agent — the game logic is fully deterministic and computable.
- Not a game server — it connects to existing online implementations (BGA).
- Not a cheat tool — it's a research project for exploring and benchmarking game-playing strategies.
