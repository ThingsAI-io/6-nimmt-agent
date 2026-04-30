/**
 * Game loop — the core play cycle.
 * Polls for action state, reads game state, gets recommendation, executes.
 */
import type { Page } from 'playwright';
import type { Strategy } from '../engine/strategies/types.js';
import type { CardChoiceState, RowChoiceState, CardNumber } from '../engine/types.js';
import { readGameState, detectAction, getFinalScores, findCheapestRow, diagnoseDom, type GameStateFromDOM } from './state-reader.js';
import { playCard, pickRow } from './actor.js';
import { log } from './logger.js';
import { GameCollector } from './collector.js';

export interface PlayOptions {
  strategy: Strategy;
  strategyName?: string;
  playerCount?: number;
  delay?: number;
  timeout?: number;
  verbose?: boolean;
  collect?: boolean; // enable data collection (default: true)
}

export interface GameResult {
  scores: Record<string, number>;
  turnsPlayed: number;
  rounds: number;
  dataFile?: string; // path to saved game log
}

/**
 * Wait for our turn or game end. Returns the detected action.
 */
async function waitForAction(
  page: Page,
  timeout: number
): Promise<'playCard' | 'pickRow' | 'gameEnd'> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeout) {
    const action = await detectAction(page);
    if (action !== 'waiting') return action;
    await page.waitForTimeout(pollInterval);
  }

  throw new Error(`Timed out waiting for action after ${timeout}ms`);
}

/**
 * Play a full game from current page state until game ends.
 */
export async function playGame(page: Page, opts: PlayOptions): Promise<GameResult> {
  const { strategy, delay = 0, timeout = 180_000, verbose = false, collect = true } = opts;
  let currentRound = 1;
  let lastHandSize = 0;

  // Initialize strategy
  const initialState = await readGameState(page);
  const playerCount = opts.playerCount ?? initialState.playerCount;
  strategy.onGameStart?.({
    playerId: initialState.myPlayerId,
    playerCount,
    rng: Math.random,
  });

  // Derive current turn from hand size (10 cards = turn 1, 9 = turn 2, etc.)
  const inferTurn = (handSize: number) => 11 - handSize;
  let turnsPlayed = inferTurn(initialState.hand.length) - 1; // turns already played

  // Initialize data collector
  const collector = collect ? new GameCollector({
    playerCount,
    strategy: opts.strategyName ?? strategy.name,
  }) : null;

  // Start first round
  const initialHand = initialState.hand.map(h => h.cardValue as number);
  const initialBoard = initialState.board.rows.map(r => [...r]);
  collector?.startRound(1, initialBoard, initialHand);

  while (true) {
    // 1. Wait for our turn or game end
    const action = await waitForAction(page, timeout);

    if (action === 'gameEnd') {
      const scores = await getFinalScores(page);
      log({ event: 'gameEnd', scores, turnsPlayed, rounds: currentRound }, verbose);
      
      // Save collected data
      let dataFile: string | undefined;
      if (collector) {
        collector.endRound(scores);
        dataFile = collector.finalize(scores);
        log({ event: 'dataSaved', file: dataFile }, verbose);
      }
      
      return { scores, turnsPlayed, rounds: currentRound, dataFile };
    }

    // 2. Read current state (retry if hand is empty)
    let state = await readGameState(page);
    if (state.hand.length === 0 && action === 'playCard') {
      log({ event: 'emptyHand', message: 'Hand empty, retrying...' }, verbose);
      const diag = await diagnoseDom(page);
      log({ event: 'diagnostic', ...diag as Record<string, unknown> }, verbose);
      for (let retry = 0; retry < 5; retry++) {
        await page.waitForTimeout(1000);
        state = await readGameState(page);
        if (state.hand.length > 0) break;
      }
      if (state.hand.length === 0) {
        throw new Error('Hand is empty after retries. DOM may have changed structure.');
      }
    }

    // Derive turn from hand size (more reliable than counter on resume)
    const currentTurn = inferTurn(state.hand.length);

    // Detect new round (hand size jumped back up to 10)
    if (state.hand.length > lastHandSize && lastHandSize > 0) {
      currentRound++;
      log({ event: 'newRound', round: currentRound }, verbose);
      const hand = state.hand.map(h => h.cardValue as number);
      const board = state.board.rows.map(r => [...r]);
      collector?.startRound(currentRound, board, hand);
    }
    lastHandSize = state.hand.length;

    // 3. Execute action
    if (action === 'playCard') {
      const boardBefore = state.board.rows.map(r => [...r]);
      const cardState = buildCardChoiceState(state, playerCount, currentRound, currentTurn);
      
      const t0 = Date.now();
      const card = strategy.chooseCard(cardState);
      const decisionTime = Date.now() - t0;
      
      if (delay) await page.waitForTimeout(delay);
      await playCard(page, state.hand, card);
      turnsPlayed++;

      // Record turn data
      collector?.recordTurn({
        turn: currentTurn,
        ourCard: card as number,
        ourRecommendation: card as number,
        boardBefore,
        decision: {
          hand: state.hand.map(h => h.cardValue as number),
          board: boardBefore,
          strategyUsed: opts.strategyName ?? strategy.name,
          timeToDecide: decisionTime,
        },
      });

      log({
        event: 'playCard',
        card,
        round: currentRound,
        turn: currentTurn,
        handSize: state.hand.length - 1,
        decisionTime,
      }, verbose);

    } else if (action === 'pickRow') {
      let rowIdx: 0 | 1 | 2 | 3;
      try {
        const rowState = buildRowChoiceState(state, playerCount, currentRound, turnsPlayed);
        rowIdx = strategy.chooseRow(rowState);
      } catch {
        rowIdx = findCheapestRow(state.board);
      }

      if (delay) await page.waitForTimeout(delay);
      await pickRow(page, rowIdx);

      log({
        event: 'pickRow',
        row: rowIdx,
        round: currentRound,
        turn: turnsPlayed,
      }, verbose);
    }

    // Capture board state after resolution
    await page.waitForTimeout(1500);
    try {
      const postState = await readGameState(page);
      collector?.recordBoardAfter(postState.board.rows.map(r => [...r]));
    } catch { /* non-critical */ }
  }
}

function buildCardChoiceState(
  state: GameStateFromDOM,
  playerCount: number,
  round: number,
  turn: number
): CardChoiceState {
  const board = { rows: state.board.rows as unknown as readonly [readonly CardNumber[], readonly CardNumber[], readonly CardNumber[], readonly CardNumber[]] };
  return {
    hand: state.hand.map(h => h.cardValue),
    board,
    playerScores: state.scores,
    playerCount,
    round,
    turn: turn + 1,
    turnHistory: [],
    initialBoardCards: board,
  };
}

function buildRowChoiceState(
  state: GameStateFromDOM,
  playerCount: number,
  round: number,
  turn: number
): RowChoiceState {
  const board = { rows: state.board.rows as unknown as readonly [readonly CardNumber[], readonly CardNumber[], readonly CardNumber[], readonly CardNumber[]] };
  return {
    board,
    triggeringCard: state.hand[0]?.cardValue ?? (1 as CardNumber),
    revealedThisTurn: [],
    resolutionIndex: 0,
    hand: state.hand.map(h => h.cardValue),
    playerScores: state.scores,
    playerCount,
    round,
    turn: turn + 1,
    turnHistory: [],
  };
}
