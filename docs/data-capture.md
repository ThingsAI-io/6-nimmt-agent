# Data Capture

During live play, the headless player streams game events to a JSONL file in `data/games/`. Every event is written immediately — no data is lost if the script crashes mid-game.

## File format

One JSON object per line. File name: `data/games/YYYY-MM-DD_bga_XXXXXXXX.jsonl`

## Event types

### `gameStart`
```json
{"event":"gameStart","gameId":"bga_a1b2c3d4","playerCount":5,"strategy":"mcs","timestamp":"..."}
```

### `roundStart`
```json
{"event":"roundStart","round":1,"initialBoard":[[5],[22],[47],[81]],"dealtHand":[3,18,35,62,70,77,88,91,98,103],"timestamp":"..."}
```

### `turn`
```json
{"event":"turn","round":1,"turn":3,"ourCard":35,"recommendation":35,"boardBefore":[[5,12],[22],[47,51],[81,88]],"decision":{"hand":[3,35,62,70,77,88,91,98,103],"strategyUsed":"mcs","timeToDecide":8},"timestamp":"..."}
```

### `boardAfter`
```json
{"event":"boardAfter","round":1,"boardAfter":[[5,12,35],[22],[47,51],[81,88]],"timestamp":"..."}
```

### `rowPick`
```json
{"event":"rowPick","round":1,"row":2,"boardBefore":[[5,12,35],[22],[47,51,55,60,65],[81,88]],"timestamp":"..."}
```

### `roundEnd`
```json
{"event":"roundEnd","round":1,"scores":{"seat0":3,"seat1":7,"seat2":0,"seat3":12,"seat4":5},"timestamp":"..."}
```

### `gameEnd`
```json
{"event":"gameEnd","finalScores":{"seat0":18,"seat1":34,"seat2":11,"seat3":42,"seat4":27},"rounds":8,"timestamp":"..."}
```

### `error`
```json
{"event":"error","message":"Failed to play card 62: Card 62 not found","timestamp":"..."}
```

## Privacy

- No player names or BGA user IDs are stored — only seat indices (seat0–seatN)
- No chat or spectator data
- No credentials or session tokens

## Index

A lightweight index is maintained at `data/index.json`:
```json
[
  {"gameId":"bga_a1b2c3d4","file":"data/games/2026-04-29_bga_a1b2c3d4.jsonl","playerCount":5,"strategy":"mcs","rounds":8,"timestamp":"..."}
]
```

## Analysis ideas

The JSONL format is easy to analyse:

```bash
# Count games played
wc -l data/index.json

# Extract all cards we played
grep '"event":"turn"' data/games/*.jsonl | jq '.ourCard'

# Find turns where we picked a row
grep '"event":"rowPick"' data/games/*.jsonl
```
