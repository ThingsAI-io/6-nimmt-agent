/**
 * Game data collector — captures game logs during live play for post-analysis.
 * Follows spec/data-capture.md format. No player identity data stored.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ── Types (from spec/data-capture.md) ──────────────────────────────────

export interface GameLog {
  version: 1;
  metadata: GameMetadata;
  rounds: RoundLog[];
}

export interface GameMetadata {
  gameId: string;
  source: string;
  date: string; // date only, no time (privacy)
  playerCount: number;
  ourStrategy: string | null;
  ourSeatIndex: number;
  finalScores: Record<string, number> | null;
  totalRounds: number;
}

export interface RoundLog {
  round: number;
  initialBoard: number[][];
  dealtHand: number[];
  turns: TurnLog[];
  roundScores: Record<string, number> | null;
}

export interface TurnLog {
  turn: number;
  ourCard: number;
  ourRecommendation: number | null;
  boardBefore: number[][];
  boardAfter: number[][] | null;
  plays: { seat: string; card: number }[] | null; // null if we can't observe
  resolutions: Resolution[] | null;
  rowPicks: RowPickLog[] | null;
  decision: DecisionContext | null;
}

export interface Resolution {
  seat: string;
  card: number;
  rowIndex: number;
  causedOverflow: boolean;
  collectedCards?: number[];
}

export interface RowPickLog {
  seat: string;
  rowIndex: number;
  collectedCards: number[];
}

export interface DecisionContext {
  hand: number[];
  board: number[][];
  strategyUsed: string;
  timeToDecide: number; // ms
}

// ── Collector ──────────────────────────────────────────────────────────

export class GameCollector {
  private log: GameLog;
  private currentRound: RoundLog | null = null;
  private dataDir: string;

  constructor(opts: {
    source?: string;
    playerCount: number;
    strategy: string;
    dataDir?: string;
  }) {
    this.dataDir = opts.dataDir ?? join(process.cwd(), 'data', 'games');
    mkdirSync(this.dataDir, { recursive: true });

    this.log = {
      version: 1,
      metadata: {
        gameId: randomUUID(),
        source: opts.source ?? 'bga',
        date: new Date().toISOString().split('T')[0],
        playerCount: opts.playerCount,
        ourStrategy: opts.strategy,
        ourSeatIndex: 0,
        finalScores: null,
        totalRounds: 0,
      },
      rounds: [],
    };
  }

  /** Start a new round. */
  startRound(round: number, board: number[][], hand: number[]): void {
    this.currentRound = {
      round,
      initialBoard: board,
      dealtHand: [...hand],
      turns: [],
      roundScores: null,
    };
    this.log.rounds.push(this.currentRound);
    this.log.metadata.totalRounds = round;
  }

  /** Record a turn where we played a card. */
  recordTurn(data: {
    turn: number;
    ourCard: number;
    ourRecommendation: number | null;
    boardBefore: number[][];
    boardAfter?: number[][];
    decision?: DecisionContext;
  }): void {
    if (!this.currentRound) {
      // Auto-create round if not started explicitly
      this.startRound(this.log.rounds.length + 1, data.boardBefore, []);
    }

    this.currentRound!.turns.push({
      turn: data.turn,
      ourCard: data.ourCard,
      ourRecommendation: data.ourRecommendation,
      boardBefore: data.boardBefore,
      boardAfter: data.boardAfter ?? null,
      plays: null, // we can't always observe opponent plays from DOM
      resolutions: null,
      rowPicks: null,
      decision: data.decision ?? null,
    });
  }

  /** Record observed board state after a turn resolves. */
  recordBoardAfter(boardAfter: number[][]): void {
    if (!this.currentRound) return;
    const lastTurn = this.currentRound.turns[this.currentRound.turns.length - 1];
    if (lastTurn) {
      lastTurn.boardAfter = boardAfter;
    }
  }

  /** Record round-end scores. */
  endRound(scores: Record<string, number>): void {
    if (this.currentRound) {
      this.currentRound.roundScores = scores;
    }
  }

  /** Finalize the game and write to disk. */
  finalize(finalScores: Record<string, number>): string {
    this.log.metadata.finalScores = finalScores;
    
    const filename = `${this.log.metadata.date}_${this.log.metadata.source}_${this.log.metadata.gameId.slice(0, 8)}.json`;
    const filepath = join(this.dataDir, filename);
    
    writeFileSync(filepath, JSON.stringify(this.log, null, 2));
    this.updateIndex(filename);
    
    return filepath;
  }

  /** Update the index file with this game's summary. */
  private updateIndex(filename: string): void {
    const indexPath = join(this.dataDir, '..', 'index.json');
    let index: { games: any[] } = { games: [] };
    
    if (existsSync(indexPath)) {
      try {
        index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      } catch { /* start fresh */ }
    }

    index.games.push({
      file: `games/${filename}`,
      gameId: this.log.metadata.gameId,
      source: this.log.metadata.source,
      date: this.log.metadata.date,
      playerCount: this.log.metadata.playerCount,
      ourStrategy: this.log.metadata.ourStrategy,
      totalRounds: this.log.metadata.totalRounds,
      finalScores: this.log.metadata.finalScores,
    });

    mkdirSync(join(this.dataDir, '..'), { recursive: true });
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  /** Get the current game log (for inspection). */
  getLog(): GameLog {
    return this.log;
  }
}
