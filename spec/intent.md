# 6 Nimmt! Agent — Project Intent

## What This Repo Is

This repository builds an **AI agent** that plays the card game [6 Nimmt!](spec/rules/6-nimmt.md) online — initially on [Board Game Arena (BGA)](https://boardgamearena.com/gamepanel?game=sechsnimmt) — and a **game engine** that powers its decision-making.

The game's card-placement rules are entirely deterministic; the only decision point each turn is **which card to play** (and, in edge cases, **which row to pick up**). The advisory logic therefore lives in a TypeScript game engine, not in an LLM. The agent is a **GitHub Copilot custom agent** (`.github/agents/`) whose skills provide browser automation and BGA-specific DOM navigation, while the engine handles all game logic.

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│        GitHub Copilot Custom Agent                    │
│        (.github/agents/)                              │
│                                                       │
│  ┌─────────────────────┐  ┌────────────────────────┐ │
│  │  Playwright Skill    │  │  BGA Navigation Skill  │ │
│  │  • Browser lifecycle │  │  • BGA login / lobby   │ │
│  │  • Page interactions │  │  • DOM → GameState     │ │
│  │  • Screenshots       │  │  • Click card / row    │ │
│  │  • Generic DOM ops   │  │  • Game-specific       │ │
│  └──────────┬───────────┘  └──────────┬─────────────┘ │
│             │                         │               │
│             └──────────┬──────────────┘               │
│                        │                              │
└────────────────────────┼──────────────────────────────┘
                         │  GameState → RecommendedMove
                         ▼
┌──────────────────────────────────────────────────────┐
│              Game Engine (TypeScript)                  │
│              src/engine/                               │
│  • Models the full game state                         │
│  • Implements pluggable strategies:                   │
│    – Random (baseline)                                │
│    – Heuristic / greedy                               │
│    – Bayesian inference                               │
│    – Neural net (future)                              │
│  • Deterministic card-placement rules                 │
│  • Row-pickup decision logic                          │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│            Simulator / Benchmark CLI                   │
│            src/sim/                                    │
│  • Runs N games with configurable players             │
│  • e.g. 1 bayesian vs 4 random                       │
│  • Outputs win rates, avg scores, etc.                │
└──────────────────────────────────────────────────────┘
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

### 2. Copilot Custom Agent (`.github/agents/`)

A GitHub Copilot custom agent that orchestrates gameplay via two skills:

#### Playwright Skill

A general-purpose browser automation skill that:

- Manages browser/page lifecycle (launch, navigate, close).
- Provides generic DOM interaction primitives (click, type, wait, screenshot).
- Is reusable beyond BGA — any web automation task.

#### BGA Navigation Skill

A BGA-specific skill that:

- Handles BGA login, lobby navigation, and game join/creation.
- Reads the 6 Nimmt! game state from the BGA DOM (rows, own hand, scores, turn status).
- Translates DOM state → engine `GameState`.
- Executes moves by clicking the recommended card (and row, if needed).
- Understands BGA-specific DOM structure, CSS selectors, and page flow.

### 3. Browser Extension — Post-MVP

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
- **Agent Framework:** GitHub Copilot custom agents (`.github/agents/`)
- **Browser Automation:** Playwright (via Copilot skill)
- **Testing:** Vitest or Jest
- **CLI:** Node.js script (possibly with `commander` or similar)

## What This Repo Is *Not*

- Not an LLM-based agent — the game logic is fully deterministic and computable. The Copilot agent is the orchestration layer; all strategy lives in TypeScript.
- Not a game server — it connects to existing online implementations (BGA).
- Not a cheat tool — it's a research project for exploring and benchmarking game-playing strategies.
