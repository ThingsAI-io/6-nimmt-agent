# 6-nimmt-agent

> A TypeScript engine and autonomous player for the card game [6 Nimmt!](https://en.wikipedia.org/wiki/6_nimmt!) — built to play live on [Board Game Arena](https://boardgamearena.com/gamepanel?game=sechsnimmt) and benchmark AI strategies against real humans.

---

## What is this?

6 Nimmt! is a deceptively simple card game: 104 cards, 4 rows on the table, everyone plays simultaneously. Your card goes to the nearest row tail lower than it — but if you land in the 6th slot, you take the whole row as penalty points. The lowest score wins.

The rules are fully deterministic. The interesting problem is **predicting where opponents will play** and avoiding the chaos.

This repo is a research project exploring that problem:

- 🎮 **Play autonomously** on BGA using Monte Carlo simulation in ~2ms per decision
- 📊 **Benchmark strategies** — random baseline, heuristic, Bayesian, MCS — against each other
- 📁 **Collect game data** in streaming JSONL for post-game analysis
- 🔬 **Iterate fast** — simulate 1000 games in seconds without touching a browser

---

## Quick start

```bash
npm install

# Simulate 1000 games: MCS vs 4 random players
npx tsx src/cli/index.ts simulate --strategies mcs,random,random,random,random --games 1000

# Play live on BGA (Chrome/Edge required)
export BGA_USERNAME=you
export BGA_PASSWORD=secret
npm run play -- --strategy mcs --verbose
```

---

## Architecture

```
src/
├── engine/       Pure TypeScript game engine — rules, state, strategies
├── cli/          Simulate and benchmark strategies offline
├── sim/          Game runner for batch simulations
├── player/       Headless Playwright player for live BGA games
└── mcp/          MCP server for Copilot agent integration
```

The game loop is 100% deterministic — no LLM in the play path. The engine calls a strategy directly in-process. The Playwright player polls BGA's DOM every 500ms, reads card values from CSS sprites, and clicks via `el.click()` (Playwright's visibility checks don't work on BGA's animated elements).

---

## Strategies

| Strategy | Description |
|---|---|
| `random` | Uniform random — the baseline |
| `dummy-min` | Always plays the lowest card in hand |
| `dummy-max` | Always plays the highest card in hand |
| `bayesian-simple` | Expected-penalty minimisation over unseen card distribution |
| `mcs` | Monte Carlo Simulation — strongest; simulates random game completions |

```bash
# Tune MCS iterations
npm run play -- --strategy mcs:mcMax=2000,mcPerCard=200
```

---

## Documentation

| Doc | Description |
|---|---|
| [Getting Started](docs/getting-started.md) | Install, CLI, first live game |
| [Strategies](docs/strategies.md) | All strategies, options, benchmarking |
| [Headless Player](docs/headless-player.md) | Live BGA player in depth |
| [Simulator](docs/simulator.md) | Batch simulation and benchmarking |
| [Data Capture](docs/data-capture.md) | JSONL game log format |
| [Game Rules](spec/rules/6-nimmt.md) | 6 Nimmt! rules reference |

---

## Development

```bash
npm test          # 413 tests
npm run lint      # ESLint
npm run build     # tsc
```

---

## License

MIT
