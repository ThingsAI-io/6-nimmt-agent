# Headless Player

A standalone TypeScript Playwright script that autonomously plays 6 Nimmt! on Board Game Arena using the strategy engine directly — no LLM in the loop.

**Performance:** ~2ms per decision, ~2s per full turn (dominated by BGA animations).

## How it works

```
Browser (Chrome/Edge)
  └─ CDP (port 9222)
       └─ play.ts
            ├─ state-reader.ts  → reads hand/board from live DOM
            ├─ loop.ts          → poll → decide → act
            ├─ actor.ts         → clicks card / row arrow
            ├─ collector.ts     → streams events to JSONL
            └─ strategy engine  → in-process, no MCP
```

The player polls BGA's page title and gamestate every 500ms to detect when it's our turn. It reads card values by decoding CSS sprite background-positions (the BGA DOM doesn't expose card values directly).

## Setup

### 1. Join a table on BGA

Open Chrome or Edge, log in to [Board Game Arena](https://boardgamearena.com), and join a 6 Nimmt! table. Get to the game page.

### 2. Start the player

```bash
npm run play -- --strategy mcs
```

The script connects to your browser via CDP on port 9222.

## Command reference

```
npm run play -- [options]
```

| Option | Default | Description |
|---|---|---|
| `--strategy` | (required) | Strategy name, optionally with options: `mcs:mcMax=1000` |
| `--browser` | `msedge` | Browser to launch if needed: `chrome`, `msedge`, `chromium` |
| `--port` | `9222` | CDP remote debugging port |
| `--delay` | `0` | Milliseconds to wait before each play (simulates human timing) |
| `--verbose` / `-v` | `false` | Log every action to stdout |
| `--no-collect` | `false` | Disable JSONL data collection |
| `--player-count` | (auto) | Override detected player count |
| `--timeout` | `180000` | Max ms to wait for our turn before giving up |

## Data collection

Every game is saved to `data/games/YYYY-MM-DD_bga_XXXXXXXX.jsonl`. Each line is a JSON event:

| Event | Description |
|---|---|
| `gameStart` | Player count, strategy, game ID |
| `roundStart` | Initial board and dealt hand |
| `turn` | Card played, board before, strategy decision |
| `boardAfter` | Board state after all cards resolved |
| `rowPick` | Which row we picked up and why |
| `roundEnd` | Scores after round |
| `gameEnd` | Final scores |

Events are written immediately — no data is lost if the script crashes.

## DOM quirks

BGA's DOM has several gotchas that the player works around:

- **Stale `gamedatas`**: `gameui.gamedatas.hand` is frozen at page load. We read the live `playerHand` Stock component instead.
- **Sprite decoding**: Card values aren't in the DOM — they're encoded as CSS `background-position` on sprite elements. Formula: `value = (|Y%|/100)*10 + (|X%|/100) + 1`
- **JS clicks**: Playwright's built-in click() fails on BGA elements due to animation states. We use `el.click()` via `page.evaluate()` instead.
- **Row pick detection**: The "must take a row" title appears for both our turn and opponents'. We check arrow visibility to confirm it's actually our turn.

See `src/player/state-reader.ts` and `src/player/actor.ts` for full details.
