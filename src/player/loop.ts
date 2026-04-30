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

export interface PlayOptions {
  strategy: Strategy;
  playerCount?: number; // override if known; otherwise read from DOM
  delay?: number;       // ms delay before each play (appear human)
  timeout?: number;     // max ms to wait for opponent (default 180s)
  verbose?: boolean;
}

export interface GameResult {
  scores: Record<string, number>;
  turnsPlayed: number;
  rounds: number;
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
  const { strategy, delay = 0, timeout = 180_000, verbose = false } = opts;
  let turnsPlayed = 0;
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

  while (true) {
    // 1. Wait for our turn or game end
    const action = await waitForAction(page, timeout);

    if (action === 'gameEnd') {
      const scores = await getFinalScores(page);
      log({ event: 'gameEnd', scores, turnsPlayed, rounds: currentRound }, verbose);
      return { scores, turnsPlayed, rounds: currentRound };
    }

    // 2. Read current state (retry if hand is empty — DOM might still be loading)
    let state = await readGameState(page);
    if (state.hand.length === 0 && action === 'playCard') {
      log({ event: 'emptyHand', message: 'Hand empty, retrying...' }, verbose);
      // Diagnostic dump on first failure
      const diag = await diagnoseDom(page);
      log({ event: 'diagnostic', ...diag as Record<string, unknown> }, verbose);
      // Retry a few times
      for (let retry = 0; retry < 5; retry++) {
        await page.waitForTimeout(1000);
        state = await readGameState(page);
        if (state.hand.length > 0) break;
      }
      if (state.hand.length === 0) {
        throw new Error('Hand is empty after retries. DOM may have changed structure.');
      }
    }

    // Detect new round (hand size jumped back up)
    if (state.hand.length > lastHandSize && turnsPlayed > 0) {
      currentRound++;
      log({ event: 'newRound', round: currentRound }, verbose);
    }
    lastHandSize = state.hand.length;

    // 3. Execute action
    if (action === 'playCard') {
      const cardState = buildCardChoiceState(state, playerCount, currentRound, turnsPlayed);
      const card = strategy.chooseCard(cardState);
      
      if (delay) await page.waitForTimeout(delay);
      await playCard(page, state.hand, card);
      turnsPlayed++;

      log({
        event: 'playCard',
        card,
        round: currentRound,
        turn: turnsPlayed,
        handSize: state.hand.length - 1,
      }, verbose);

    } else if (action === 'pickRow') {
      // Try strategy's row choice, fall back to cheapest
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

    // Small breathing room for animations
    await page.waitForTimeout(1500);
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
