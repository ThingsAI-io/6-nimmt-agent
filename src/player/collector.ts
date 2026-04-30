/**
 * Game data collector — streams game events to JSONL during live play.
 * Each line is a self-contained event. No data loss on crash.
 * Follows spec/data-capture.md format. No player identity data stored.
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────

export interface DecisionContext {
  hand: number[];
  board: number[][];
  strategyUsed: string;
  timeToDecide: number;
}

// ── Collector ──────────────────────────────────────────────────────────

export class GameCollector {
  private gameId: string;
  private filepath: string;
  private dataDir: string;
  private strategyName: string;
  private playerCount: number;
  private currentRound = 0;

  constructor(opts: {
    source?: string;
    playerCount: number;
    strategy: string;
    dataDir?: string;
  }) {
    this.dataDir = opts.dataDir ?? join(process.cwd(), 'data', 'games');
    mkdirSync(this.dataDir, { recursive: true });

    this.gameId = randomUUID().slice(0, 8);
    this.strategyName = opts.strategy;
    this.playerCount = opts.playerCount;

    const date = new Date().toISOString().split('T')[0];
    const source = opts.source ?? 'bga';
    this.filepath = join(this.dataDir, `${date}_${source}_${this.gameId}.jsonl`);

    // Write game header as first line
    this.append({
      event: 'gameStart',
      gameId: this.gameId,
      source,
      date,
      playerCount: opts.playerCount,
      strategy: opts.strategy,
    });
  }

  /** Record start of a new round. */
  startRound(round: number, board: number[][], hand: number[]): void {
    this.currentRound = round;
    this.append({
      event: 'roundStart',
      round,
      initialBoard: board,
      dealtHand: hand,
    });
  }

  /** Record a card play. */
  recordTurn(data: {
    turn: number;
    ourCard: number;
    ourRecommendation: number | null;
    boardBefore: number[][];
    decision?: DecisionContext;
  }): void {
    this.append({
      event: 'turn',
      round: this.currentRound,
      turn: data.turn,
      ourCard: data.ourCard,
      recommendation: data.ourRecommendation,
      boardBefore: data.boardBefore,
      decision: data.decision ?? null,
    });
  }

  /** Record board state after resolution. */
  recordBoardAfter(boardAfter: number[][]): void {
    this.append({
      event: 'boardAfter',
      round: this.currentRound,
      boardAfter,
    });
  }

  /** Record a row pick. */
  recordRowPick(row: number, board: number[][]): void {
    this.append({
      event: 'rowPick',
      round: this.currentRound,
      row,
      board,
    });
  }

  /** Record round-end scores. */
  endRound(scores: Record<string, number>): void {
    this.append({
      event: 'roundEnd',
      round: this.currentRound,
      scores,
    });
  }

  /** Finalize the game with final scores. */
  finalize(finalScores: Record<string, number>): string {
    this.append({
      event: 'gameEnd',
      finalScores,
    });
    this.updateIndex(finalScores);
    return this.filepath;
  }

  /** Get the file path. */
  getFilePath(): string {
    return this.filepath;
  }

  /** Append a line to the JSONL file. */
  private append(data: Record<string, unknown>): void {
    const line = JSON.stringify({ ...data, ts: new Date().toISOString() });
    appendFileSync(this.filepath, line + '\n');
  }

  /** Update the index file. */
  private updateIndex(finalScores: Record<string, number>): void {
    const indexPath = join(this.dataDir, '..', 'index.json');
    let index: { games: any[] } = { games: [] };

    if (existsSync(indexPath)) {
      try {
        index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      } catch { /* start fresh */ }
    }

    index.games.push({
      file: `games/${this.filepath.split(/[/\\]/).pop()}`,
      gameId: this.gameId,
      date: new Date().toISOString().split('T')[0],
      playerCount: this.playerCount,
      strategy: this.strategyName,
      finalScores,
    });

    mkdirSync(join(this.dataDir, '..'), { recursive: true });
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }
}
