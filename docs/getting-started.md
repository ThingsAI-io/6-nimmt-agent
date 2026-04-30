# Getting Started

## Prerequisites

- Node.js 20+
- npm
- A [Board Game Arena](https://boardgamearena.com) account (for live play)
- Chrome or Microsoft Edge (for the headless player)

## Install

```bash
git clone https://github.com/ThingsAI-io/6-nimmt-agent
cd 6-nimmt-agent
npm install
```

## Run the CLI

The CLI simulates games between strategies — no browser needed.

```bash
# Run 1000 games: MCS vs 4 random players
npx tsx src/cli/index.ts simulate --strategies mcs,random,random,random,random --games 1000

# List all available strategies
npx tsx src/cli/index.ts strategies

# Output as JSON
npx tsx src/cli/index.ts simulate --strategies bayesian,random --games 500 --format json
```

## Play live on Board Game Arena

The headless player attaches to your browser and plays autonomously.

### 1. Set credentials

```bash
export BGA_USERNAME=your_username
export BGA_PASSWORD=your_password
```

### 2. Join a table on BGA

Open BGA in Chrome or Edge, log in, and join (or create) a 6 Nimmt! table.

### 3. Run the player

```bash
# Connect to your running browser (Chrome/Edge must already be open)
npm run play -- --strategy mcs

# With strategy tuning
npm run play -- --strategy mcs:mcMax=1000,mcPerCard=100 --verbose

# Add a delay before each play (looks more human)
npm run play -- --strategy mcs --delay 2000
```

The script connects to your browser via Chrome DevTools Protocol (CDP). If no browser is found running on port 9222, it launches one automatically and prompts you to log in and join a table.

## Run tests

```bash
npm test
```

## Next steps

- [Strategies](strategies.md) — available strategies and how to tune them
- [Headless Player](headless-player.md) — full live player documentation
- [Simulator](simulator.md) — benchmark strategies against each other
- [Data Capture](data-capture.md) — game data collected during live play
