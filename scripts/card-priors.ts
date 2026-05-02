/**
 * Card Priors Analysis: Run games of MCS-vs-MCS and collect per-card statistics.
 *
 * Runs continuously (or for a fixed --games count), checkpointing to disk every
 * N games (default 10). Safe to Ctrl+C at any time — progress is never lost.
 *
 * Usage:
 *   npx tsx scripts/card-priors.ts --mcPerCard 100                  # run forever, checkpoint every 10
 *   npx tsx scripts/card-priors.ts --games 200 --mcPerCard 100      # run exactly 200, then stop
 *   npx tsx scripts/card-priors.ts --mcPerCard 50 --checkpoint 5    # checkpoint every 5 games
 *
 * Data is saved incrementally to data/training/card-priors/prior-p{N}-mc{N}.json.
 * Each run accumulates into the existing prior.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createGame,
  dealRound,
  resolveTurn,
  scoreRound,
  isGameOver,
  toCardChoiceState,
  strategies,
  cattleHeads,
  deriveSeedState,
  xoshiro256ss,
} from '../src/engine/index.js';
import type { CardNumber, GameState, RowChoiceState } from '../src/engine/types.js';
import type { Strategy } from '../src/engine/strategies/types.js';

// ── CLI args ───────────────────────────────────────────────────────────

import { parseStrategySpec } from '../src/engine/strategies/index.js';

const STRATEGY_SPEC = process.argv.find((_, i, a) => a[i - 1] === '--strategy') ?? 'mcs:mcPerCard=50,scoring=relative';
const GAMES = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') ?? '0', 10); // 0 = infinite
const PLAYERS = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--players') ?? '5', 10);
const SEED = process.argv.find((_, i, a) => a[i - 1] === '--seed') ?? 'priors-2026';
const DATA_DIR = process.argv.find((_, i, a) => a[i - 1] === '--dataDir') ?? 'data/training/card-priors';
const CHECKPOINT_EVERY = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--checkpoint') ?? '10', 10);

const { name: STRATEGY_NAME, options: STRATEGY_OPTIONS } = parseStrategySpec(STRATEGY_SPEC);

if (!strategies.has(STRATEGY_NAME)) {
  console.error(`Unknown strategy "${STRATEGY_NAME}". Available: ${[...strategies.keys()].join(', ')}`);
  process.exit(1);
}

// ── Per-card stats ─────────────────────────────────────────────────────

interface CardStats {
  card: number;
  timesPlayed: number;
  timesOverflow: number;      // playing this card caused a 6-nimmt (6th card on row)
  timesRowPick: number;       // playing this card forced a row pick (below all tops)
  overflowPenalty: number;    // total cattle heads from overflow events
  rowPickPenalty: number;     // total cattle heads from row pick events
  overflowGapSum: number;     // sum of (card - rowTop) when overflow occurs
  turnSum: number;            // sum of turn numbers (1-indexed) for avg calculation
  heldLateCount: number;      // times card was in hand at turn >= 7
  heldLatePenalty: number;    // sum of final game scores for holders
}

interface PriorData {
  totalGames: number;
  playerCount: number;
  strategy: { name: string; options?: Record<string, unknown> };
  cards: CardStats[];         // 104 entries, one per card value (1–104)
  turnStats: TurnStats[];     // 10 entries, one per turn (1-indexed in data)
}

/** Per-turn board state distribution. */
interface TurnStats {
  turn: number;
  /** Histogram of min_row_top values (index = card value 1–104, value = count of occurrences). */
  minRowTopHist: number[];
  /** Histogram of max_row_top values. */
  maxRowTopHist: number[];
  /** Sum of min_row_top values (for computing mean). */
  minRowTopSum: number;
  /** Sum of max_row_top values. */
  maxRowTopSum: number;
  /** Histogram of max row length (index 0–5, value = count). How full is the fullest row? */
  maxRowLenHist: number[];
  /** Histogram of rows-with-5-cards count (index 0–4, value = count). How many rows are primed? */
  primedRowsHist: number[];
  /** Histogram of top values of primed (5-card) rows (index = value-1, 0–103). */
  primedRowTopHist: number[];
  /** Number of observations. */
  observations: number;
}

// Deterministic filename from strategy spec
const safeSpec = STRATEGY_SPEC.replace(/[^a-zA-Z0-9_=-]/g, '_');
const DATA_FILE = join(DATA_DIR, `prior-p${PLAYERS}-${safeSpec}.json`);

function emptyStats(card: number): CardStats {
  return { card, timesPlayed: 0, timesOverflow: 0, timesRowPick: 0, overflowPenalty: 0, rowPickPenalty: 0, overflowGapSum: 0, turnSum: 0, heldLateCount: 0, heldLatePenalty: 0 };
}

function emptyTurnStats(turn: number): TurnStats {
  return { turn, minRowTopHist: new Array(104).fill(0), maxRowTopHist: new Array(104).fill(0), minRowTopSum: 0, maxRowTopSum: 0, maxRowLenHist: new Array(6).fill(0), primedRowsHist: new Array(5).fill(0), primedRowTopHist: new Array(104).fill(0), observations: 0 };
}

function loadPrior(): PriorData {
  if (existsSync(DATA_FILE)) {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as PriorData;
    // Backfill turnStats if loading an older prior without it
    if (!raw.turnStats) {
      raw.turnStats = Array.from({ length: 10 }, (_, i) => emptyTurnStats(i + 1));
    } else {
      // Backfill new histogram fields on existing turnStats entries
      for (const ts of raw.turnStats) {
        if (!ts.maxRowLenHist) ts.maxRowLenHist = new Array(6).fill(0);
        if (!ts.primedRowsHist) ts.primedRowsHist = new Array(5).fill(0);
        if (!ts.primedRowTopHist) ts.primedRowTopHist = new Array(104).fill(0);
      }
    }
    // Backfill overflowGapSum on card stats
    for (const cs of raw.cards) {
      if (cs.overflowGapSum === undefined) cs.overflowGapSum = 0;
    }
    console.log(`Loaded existing prior: ${raw.totalGames} games accumulated`);
    return raw;
  }
  return {
    totalGames: 0,
    playerCount: PLAYERS,
    strategy: { name: STRATEGY_NAME, options: STRATEGY_OPTIONS },
    cards: Array.from({ length: 104 }, (_, i) => emptyStats(i + 1)),
    turnStats: Array.from({ length: 10 }, (_, i) => emptyTurnStats(i + 1)),
  };
}

function savePrior(data: PriorData): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`\nSaved prior to ${DATA_FILE} (${data.totalGames} total games)`);
}

// Load accumulated data
const prior = loadPrior();
const cardStats = prior.cards;

// ── Helpers ────────────────────────────────────────────────────────────

function createPlayerRng(seed: string, playerId: string): () => number {
  const state = deriveSeedState(seed + '/' + playerId);
  return () => Number(xoshiro256ss(state) >> 11n) / 2 ** 53;
}

function fewestHeadsRow(gameState: GameState): 0 | 1 | 2 | 3 {
  let bestIndex = 0;
  let bestPenalty = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = gameState.board.rows[i].reduce((sum, c) => sum + cattleHeads(c), 0);
    if (p < bestPenalty) { bestPenalty = p; bestIndex = i; }
  }
  return bestIndex as 0 | 1 | 2 | 3;
}

function isValidRowIndex(v: unknown): v is 0 | 1 | 2 | 3 {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

function buildRowChoiceState(
  playerId: string,
  triggeringCard: CardNumber,
  sortedPlays: readonly { playerId: string; card: CardNumber }[],
  gameState: GameState,
): RowChoiceState {
  const player = gameState.players.find(p => p.id === playerId)!;
  const playerScores: Record<string, number> = {};
  for (const p of gameState.players) playerScores[p.id] = p.score;
  return {
    board: gameState.board,
    triggeringCard,
    revealedThisTurn: sortedPlays.map(p => ({ playerId: p.playerId, card: p.card })),
    resolutionIndex: 0,
    hand: player.hand,
    playerScores,
    playerCount: gameState.players.length,
    round: gameState.round,
    turn: gameState.turn,
    turnHistory: gameState.turnHistory,
  };
}

// ── Main simulation loop ───────────────────────────────────────────────

const target = GAMES > 0 ? GAMES : Infinity;
const targetTotal = GAMES > 0 ? prior.totalGames + GAMES : 1000;
console.log(GAMES > 0
  ? `Running ${GAMES} games, ${PLAYERS} players (${STRATEGY_SPEC}), checkpoint every ${CHECKPOINT_EVERY}...`
  : `Running indefinitely, ${PLAYERS} players (${STRATEGY_SPEC}), checkpoint every ${CHECKPOINT_EVERY}. Ctrl+C to stop.`
);
console.log(`Prior has ${prior.totalGames} games accumulated.\n`);

const t0 = Date.now();
let gamesThisRun = 0;
const startingGames = prior.totalGames;

function statusLine(): void {
  const elapsed = Date.now() - t0;
  const msPerGame = gamesThisRun > 0 ? elapsed / gamesThisRun : 0;
  const total = startingGames + gamesThisRun;
  const remaining = Math.max(0, targetTotal - total);
  const etaStr = msPerGame > 0
    ? remaining === Infinity ? '∞' : formatTime(remaining * msPerGame)
    : '?';
  process.stdout.write(
    `\r  game ${gamesThisRun} this run | ${total} total | ${msPerGame.toFixed(0)}ms/game | ETA to ${targetTotal}: ${etaStr}   `,
  );
}

function formatTime(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

// Graceful shutdown on Ctrl+C
let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1); // double Ctrl+C = force
  stopping = true;
  console.log('\n\nStopping gracefully, saving checkpoint...');
});

while (gamesThisRun < target && !stopping) {

  const gameIndex = startingGames + gamesThisRun;
  const gameSeed = `${SEED}-${gameIndex}`;
  const playerIds = Array.from({ length: PLAYERS }, (_, i) => `p${i}`);
  let state = createGame(playerIds, gameSeed);

  // Create strategies
  const factory = strategies.get(STRATEGY_NAME)!;
  const stratMap = new Map<string, Strategy>();
  for (const pid of playerIds) {
    const strat = factory(STRATEGY_OPTIONS);
    strat.onGameStart?.({ playerId: pid, playerCount: PLAYERS, rng: createPlayerRng(gameSeed, pid) });
    stratMap.set(pid, strat);
  }

  // Track which cards each player holds at turn 7 for late-hold analysis
  const heldAtTurn7 = new Map<string, CardNumber[]>();

  while (true) {
    state = dealRound(state);

    for (const pid of playerIds) {
      const player = state.players.find(p => p.id === pid)!;
      stratMap.get(pid)!.onRoundStart?.({ round: state.round, hand: player.hand, board: state.board });
    }

    for (let t = 0; t < 10; t++) {
      // Snapshot hands at turn 7 (0-indexed: t === 6)
      if (t === 6) {
        for (const pid of playerIds) {
          const player = state.players.find(p => p.id === pid)!;
          heldAtTurn7.set(pid, [...player.hand]);
        }
      }

      // Record board state distribution BEFORE plays are made
      const rowTops = state.board.rows.map(r => r[r.length - 1] as number);
      const minTop = Math.min(...rowTops);
      const maxTop = Math.max(...rowTops);
      const rowLens = state.board.rows.map(r => r.length);
      const maxLen = Math.max(...rowLens);
      const primedCount = rowLens.filter(l => l >= 5).length;
      const ts = prior.turnStats[t];
      ts.minRowTopHist[minTop - 1]++;
      ts.maxRowTopHist[maxTop - 1]++;
      ts.minRowTopSum += minTop;
      ts.maxRowTopSum += maxTop;
      ts.maxRowLenHist[maxLen]++;
      ts.primedRowsHist[primedCount]++;
      // Record top values of primed (5-card) rows
      for (const row of state.board.rows) {
        if (row.length >= 5) {
          ts.primedRowTopHist[row[row.length - 1] - 1]++;
        }
      }
      ts.observations++;

      // Collect plays
      const plays: { playerId: string; card: CardNumber }[] = [];
      for (const pid of playerIds) {
        const strat = stratMap.get(pid)!;
        const player = state.players.find(p => p.id === pid)!;
        const choiceState = toCardChoiceState(state, pid);
        let card: CardNumber;
        try {
          const chosen = strat.chooseCard(choiceState);
          card = player.hand.includes(chosen) ? chosen : player.hand[0];
        } catch {
          card = player.hand[0];
        }
        plays.push({ playerId: pid, card });

        // Record card play stats
        cardStats[card - 1].timesPlayed++;
        cardStats[card - 1].turnSum += (t + 1); // 1-indexed turn
      }

      const sortedPlays = [...plays].sort((a, b) => a.card - b.card);

      // Resolve turn
      state = resolveTurn(state, plays, (playerId, tempState) => {
        const strat = stratMap.get(playerId)!;
        const play = sortedPlays.find(sp => sp.playerId === playerId)!;
        try {
          const rowChoice = buildRowChoiceState(playerId, play.card, sortedPlays, tempState);
          const chosen = strat.chooseRow(rowChoice);
          return isValidRowIndex(chosen) ? chosen : fewestHeadsRow(tempState);
        } catch {
          return fewestHeadsRow(tempState);
        }
      });

      // Analyze turn resolution: separate overflow (6-nimmt) from row picks
      const lastEntry = state.turnHistory[state.turnHistory.length - 1];
      for (const res of lastEntry.resolutions) {
        if (res.causedOverflow && res.collectedCards) {
          const penalty = res.collectedCards.reduce((s, c) => s + cattleHeads(c), 0);
          cardStats[res.card - 1].timesOverflow++;
          cardStats[res.card - 1].overflowPenalty += penalty;
          // Overflow gap: approximate using pre-turn row top
          const gap = res.card - rowTops[res.rowIndex];
          cardStats[res.card - 1].overflowGapSum += gap;
        }
      }
      // Row picks (card below all row tops → player chose a row)
      for (const rp of lastEntry.rowPicks) {
        const penalty = rp.collectedCards.reduce((s, c) => s + cattleHeads(c), 0);
        const play = plays.find(p => p.playerId === rp.playerId)!;
        cardStats[play.card - 1].timesRowPick++;
        cardStats[play.card - 1].rowPickPenalty += penalty;
      }

      // Notify strategies
      const resolution = {
        turn: lastEntry.turn,
        plays: lastEntry.plays,
        resolutions: lastEntry.resolutions,
        rowPicks: lastEntry.rowPicks.map(rp => ({
          playerId: rp.playerId,
          rowIndex: rp.rowIndex,
          collectedCards: [...rp.collectedCards],
        })),
        boardAfter: lastEntry.boardAfter.rows.map(row => [...row]),
      };
      for (const pid of playerIds) {
        try { stratMap.get(pid)!.onTurnResolved?.(resolution); } catch { /* */ }
      }
    }

    state = scoreRound(state);

    const scores = state.players.map(p => ({ id: p.id, score: p.score }));
    for (const pid of playerIds) {
      try { stratMap.get(pid)!.onRoundEnd?.(scores); } catch { /* */ }
    }

    if (isGameOver(state)) break;
  }

  // Record held-late stats using final scores
  for (const pid of playerIds) {
    const finalScore = state.players.find(p => p.id === pid)!.score;
    const held = heldAtTurn7.get(pid) ?? [];
    for (const card of held) {
      cardStats[card - 1].heldLateCount++;
      cardStats[card - 1].heldLatePenalty += finalScore;
    }
  }

  gamesThisRun++;
  statusLine();

  // Checkpoint: save every N games
  if (gamesThisRun % CHECKPOINT_EVERY === 0) {
    prior.totalGames += CHECKPOINT_EVERY;
    savePrior(prior);
  }
}

// Final save for any remaining games since last checkpoint
const remainder = gamesThisRun % CHECKPOINT_EVERY;
if (remainder > 0) {
  prior.totalGames += remainder;
  savePrior(prior);
}

// ── Output ─────────────────────────────────────────────────────────────

const elapsed = Date.now() - t0;
console.log(`\nCompleted ${gamesThisRun} games in ${formatTime(elapsed)} (${prior.totalGames} total accumulated)\n`);

// Build summary rows
interface SummaryRow {
  card: number;
  heads: number;
  played: number;
  overflowRate: number;   // timesOverflow / timesPlayed (6-nimmt events)
  rowPickRate: number;    // timesRowPick / timesPlayed (below-all-rows events)
  totalPenaltyRate: number; // combined penalty per play
  avgOverflowPenalty: number;
  avgRowPickPenalty: number;
  avgOverflowGap: number; // avg distance to row top when overflow happens
  avgTurn: number;
  heldLate: number;
  avgLateScore: number;
}

const rows: SummaryRow[] = [];
for (let c = 1; c <= 104; c++) {
  const s = cardStats[c - 1];
  if (s.timesPlayed === 0) continue;
  const totalPenalty = s.overflowPenalty + s.rowPickPenalty;
  rows.push({
    card: c,
    heads: cattleHeads(c),
    played: s.timesPlayed,
    overflowRate: s.timesOverflow / s.timesPlayed,
    rowPickRate: s.timesRowPick / s.timesPlayed,
    totalPenaltyRate: totalPenalty / s.timesPlayed,
    avgOverflowPenalty: s.timesOverflow > 0 ? s.overflowPenalty / s.timesOverflow : 0,
    avgRowPickPenalty: s.timesRowPick > 0 ? s.rowPickPenalty / s.timesRowPick : 0,
    avgOverflowGap: s.timesOverflow > 0 ? s.overflowGapSum / s.timesOverflow : 0,
    avgTurn: s.turnSum / s.timesPlayed,
    heldLate: s.heldLateCount,
    avgLateScore: s.heldLateCount > 0 ? s.heldLatePenalty / s.heldLateCount : 0,
  });
}

// Table: Most dangerous cards (highest combined penalty per play)
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' TOP 20 MOST DANGEROUS CARDS (highest expected penalty per play)');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Card │ Heads │ Played │ 6nimmt% │ RowPick% │ E[penalty] │ AvgTurn');
console.log('──────┼───────┼────────┼─────────┼──────────┼────────────┼────────');
const byDanger = [...rows].sort((a, b) => b.totalPenaltyRate - a.totalPenaltyRate).slice(0, 20);
for (const r of byDanger) {
  console.log(
    ` ${String(r.card).padStart(3)} │   ${r.heads}   │ ${String(r.played).padStart(6)} │ ${(r.overflowRate * 100).toFixed(1).padStart(6)}% │ ${(r.rowPickRate * 100).toFixed(1).padStart(7)}% │ ${r.totalPenaltyRate.toFixed(2).padStart(10)} │ ${r.avgTurn.toFixed(1).padStart(5)}`,
  );
}

// Table: Highest 6-nimmt rate (overflow — the card that fills rows)
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(' TOP 20 OVERFLOW CARDS (highest 6-nimmt trigger rate)');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Card │ Heads │ Played │ 6nimmt% │ AvgPenalty │ AvgTurn');
console.log('──────┼───────┼────────┼─────────┼────────────┼────────');
const byOverflow = [...rows].filter(r => r.played >= 50).sort((a, b) => b.overflowRate - a.overflowRate).slice(0, 20);
for (const r of byOverflow) {
  console.log(
    ` ${String(r.card).padStart(3)} │   ${r.heads}   │ ${String(r.played).padStart(6)} │ ${(r.overflowRate * 100).toFixed(1).padStart(6)}% │ ${r.avgOverflowPenalty.toFixed(1).padStart(10)} │ ${r.avgTurn.toFixed(1).padStart(5)}`,
  );
}

// Table: Highest row-pick rate (boulevard cards)
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(' TOP 20 BOULEVARD CARDS (highest row-pick rate, below all tops)');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Card │ Heads │ Played │ RowPick% │ AvgPenalty │ AvgTurn');
console.log('──────┼───────┼────────┼──────────┼────────────┼────────');
const byRowPick = [...rows].filter(r => r.played >= 50).sort((a, b) => b.rowPickRate - a.rowPickRate).slice(0, 20);
for (const r of byRowPick) {
  console.log(
    ` ${String(r.card).padStart(3)} │   ${r.heads}   │ ${String(r.played).padStart(6)} │ ${(r.rowPickRate * 100).toFixed(1).padStart(7)}% │ ${r.avgRowPickPenalty.toFixed(1).padStart(10)} │ ${r.avgTurn.toFixed(1).padStart(5)}`,
  );
}

// Table: Safest cards
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(' TOP 20 SAFEST CARDS (lowest combined penalty rate, min 50 plays)');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Card │ Heads │ Played │ 6nimmt% │ RowPick% │ E[penalty] │ AvgTurn');
console.log('──────┼───────┼────────┼─────────┼──────────┼────────────┼────────');
const bySafe = [...rows].filter(r => r.played >= 50).sort((a, b) => a.totalPenaltyRate - b.totalPenaltyRate).slice(0, 20);
for (const r of bySafe) {
  console.log(
    ` ${String(r.card).padStart(3)} │   ${r.heads}   │ ${String(r.played).padStart(6)} │ ${(r.overflowRate * 100).toFixed(1).padStart(6)}% │ ${(r.rowPickRate * 100).toFixed(1).padStart(7)}% │ ${r.totalPenaltyRate.toFixed(2).padStart(10)} │ ${r.avgTurn.toFixed(1).padStart(5)}`,
  );
}

// Table: Late-hold danger
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(' TOP 20 LATE-HOLD DANGER (held at turn 7+ → highest avg final score)');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Card │ Heads │ HeldLate │ AvgGameScore │ AvgTurn');
console.log('──────┼───────┼──────────┼──────────────┼────────');
const byLate = [...rows].filter(r => r.heldLate >= 20).sort((a, b) => b.avgLateScore - a.avgLateScore).slice(0, 20);
for (const r of byLate) {
  console.log(
    ` ${String(r.card).padStart(3)} │   ${r.heads}   │ ${String(r.heldLate).padStart(8)} │ ${r.avgLateScore.toFixed(1).padStart(12)} │ ${r.avgTurn.toFixed(1).padStart(5)}`,
  );
}

// Table: Average turn played by card range
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(' AVERAGE STATS BY CARD RANGE');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Range    │ AvgTurn │ 6nimmt% │ RowPick% │ E[penalty] │ AvgGap');
console.log('──────────┼─────────┼─────────┼──────────┼────────────┼───────');
const ranges = [
  [1, 10], [11, 20], [21, 30], [31, 40], [41, 50],
  [51, 60], [61, 70], [71, 80], [81, 90], [91, 104],
] as const;
for (const [lo, hi] of ranges) {
  const inRange = rows.filter(r => r.card >= lo && r.card <= hi);
  if (inRange.length === 0) continue;
  const avgTurn = inRange.reduce((s, r) => s + r.avgTurn, 0) / inRange.length;
  const avgOverflow = inRange.reduce((s, r) => s + r.overflowRate, 0) / inRange.length;
  const avgRowPick = inRange.reduce((s, r) => s + r.rowPickRate, 0) / inRange.length;
  const avgPenRate = inRange.reduce((s, r) => s + r.totalPenaltyRate, 0) / inRange.length;
  const overflowCards = inRange.filter(r => r.avgOverflowGap > 0);
  const avgGap = overflowCards.length > 0 ? overflowCards.reduce((s, r) => s + r.avgOverflowGap, 0) / overflowCards.length : 0;
  console.log(
    ` ${String(lo).padStart(3)}-${String(hi).padStart(3)} │ ${avgTurn.toFixed(2).padStart(7)} │ ${(avgOverflow * 100).toFixed(1).padStart(6)}% │ ${(avgRowPick * 100).toFixed(1).padStart(7)}% │ ${avgPenRate.toFixed(2).padStart(10)} │ ${avgGap.toFixed(1).padStart(5)}`,
  );
}

// Overall stats
const totalPlays = rows.reduce((s, r) => s + r.played, 0);
const totalOverflows = rows.reduce((s, r) => s + r.played * r.overflowRate, 0);
const totalRowPicks = rows.reduce((s, r) => s + r.played * r.rowPickRate, 0);
console.log(`\nOverall: ${totalPlays} card plays, ${totalOverflows.toFixed(0)} overflows (${(totalOverflows / totalPlays * 100).toFixed(1)}%), ${totalRowPicks.toFixed(0)} row picks (${(totalRowPicks / totalPlays * 100).toFixed(1)}%)`);
console.log(`Average game: ${(elapsed / gamesThisRun).toFixed(0)}ms`);

// Table: Min/Max row top distribution by turn
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(' ROW TOP DISTRIBUTION BY TURN');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Turn │ AvgMinTop │ AvgMaxTop │ P10 MinTop │ P50 MinTop │ P90 MinTop');
console.log('──────┼───────────┼───────────┼────────────┼────────────┼───────────');
for (const ts of prior.turnStats) {
  if (ts.observations === 0) continue;
  const avgMin = ts.minRowTopSum / ts.observations;
  const avgMax = ts.maxRowTopSum / ts.observations;
  // Compute percentiles from histogram
  const p10 = percentileFromHist(ts.minRowTopHist, ts.observations, 0.10);
  const p50 = percentileFromHist(ts.minRowTopHist, ts.observations, 0.50);
  const p90 = percentileFromHist(ts.minRowTopHist, ts.observations, 0.90);
  console.log(
    `   ${String(ts.turn).padStart(2)} │ ${avgMin.toFixed(1).padStart(9)} │ ${avgMax.toFixed(1).padStart(9)} │ ${String(p10).padStart(10)} │ ${String(p50).padStart(10)} │ ${String(p90).padStart(9)}`,
  );
}

// Table: Row fullness / overflow risk by turn
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(' OVERFLOW RISK BY TURN (row fullness before plays)');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(' Turn │ AvgMaxLen │ P(maxLen≥4) │ P(maxLen=5) │ P(≥1 primed) │ Avg primed');
console.log('──────┼───────────┼─────────────┼─────────────┼──────────────┼───────────');
for (const ts of prior.turnStats) {
  if (ts.observations === 0) continue;
  const hist = ts.maxRowLenHist ?? new Array(6).fill(0);
  const primed = ts.primedRowsHist ?? new Array(5).fill(0);
  const lenObs = hist.reduce((s, c) => s + c, 0) || 1; // observations that tracked row length
  const primedObs = primed.reduce((s, c) => s + c, 0) || 1;
  const avgMaxLen = hist.reduce((s, c, i) => s + c * i, 0) / lenObs;
  const pMaxLen4 = (hist[4] + hist[5]) / lenObs;
  const pMaxLen5 = hist[5] / lenObs;
  const pAnyPrimed = 1 - (primed[0] / primedObs);
  const avgPrimed = primed.reduce((s, c, i) => s + c * i, 0) / primedObs;
  console.log(
    `   ${String(ts.turn).padStart(2)} │ ${avgMaxLen.toFixed(2).padStart(9)} │ ${(pMaxLen4 * 100).toFixed(1).padStart(10)}% │ ${(pMaxLen5 * 100).toFixed(1).padStart(10)}% │ ${(pAnyPrimed * 100).toFixed(1).padStart(11)}% │ ${avgPrimed.toFixed(2).padStart(9)}`,
  );
}

function percentileFromHist(hist: number[], total: number, pct: number): number {
  const target = Math.ceil(total * pct);
  let cumulative = 0;
  for (let i = 0; i < hist.length; i++) {
    cumulative += hist[i];
    if (cumulative >= target) return i + 1; // card values are 1-indexed
  }
  return 104;
}
