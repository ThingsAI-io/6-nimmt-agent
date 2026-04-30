/**
 * Game loop — the core play cycle.
 *
 * Architecture: poll for action → read state → get recommendation → execute → collect data.
 *
 * KEY DESIGN DECISIONS:
 * - Turn number is DERIVED from hand size (11 - cards), not incremented.
 *   This ensures correctness even when reconnecting mid-game (counter would reset to 0).
 * - Round transitions are detected by hand size jumping to ≥9 from <9.
 *   After the last turn, hand goes to 0; when BGA deals new round, it jumps to 10.
 * - After playing a card, we poll until hand size actually decreases.
 *   BGA animations can take 1-5s — without this wait, we'd re-read stale state
 *   and try to play the same card again.
 * - When hand empties (all 10 cards played), we enter a wait loop for either
 *   new round deal (hand > 0) or game end (gamestate name check).
 */
import type { Page } from 'playwright';
import type { Strategy } from '../engine/strategies/types.js';
import type { CardChoiceState, RowChoiceState, CardNumber } from '../engine/types.js';
import { readGameState, detectAction, getFinalScores, findCheapestRow, type GameStateFromDOM } from './state-reader.js';
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
 * Polls every 500ms — BGA has no reliable event we can hook into from CDP.
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
 * Can be started mid-game (e.g. after reconnecting) — state is inferred from DOM.
 */
export async function playGame(page: Page, opts: PlayOptions): Promise<GameResult> {
  const { strategy, delay = 0, timeout = 180_000, verbose = false, collect = true } = opts;
  let currentRound = 1;
  let lastHandSize = 0;

  // Initialize strategy with game metadata
  const initialState = await readGameState(page);
  const playerCount = opts.playerCount ?? initialState.playerCount;
  strategy.onGameStart?.({
    playerId: initialState.myPlayerId,
    playerCount,
    rng: Math.random,
  });

  // Turn inference: in 6 Nimmt, each player gets 10 cards per round and plays
  // one per turn. So turn number = 11 - current hand size.
  // This works even on reconnect (no counter to reset).
  const inferTurn = (handSize: number) => 11 - handSize;
  let turnsPlayed = inferTurn(initialState.hand.length) - 1; // turns already played

  // Initialize data collector
  const collector = collect ? new GameCollector({
    playerCount,
    strategy: opts.strategyName ?? strategy.name,
  }) : null;

  // Start first round — track initial board for strategy context
  const initialHand = initialState.hand.map(h => h.cardValue as number);
  const initialBoard = initialState.board.rows.map(r => [...r]);
  let roundStartBoard = initialBoard; // snapshot of board at round start (for initialBoardCards)
  let lastPlayedCard: CardNumber | undefined; // track last card we played (needed for row pick context)
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

    // 2. Read state — handle empty hand (round just ended)
    // After playing 10 cards, hand is empty. We need to wait for BGA to deal
    // the next round (hand refills to 10) or end the game.
    let state = await readGameState(page);
    if (state.hand.length === 0 && action === 'playCard') {
      log({ event: 'roundComplete', message: 'Hand empty — waiting for next round or game end', round: currentRound }, verbose);
      let foundNewState = false;
      for (let retry = 0; retry < 20; retry++) {
        await page.waitForTimeout(1500);
        // Check gamestate for game end (most reliable end-of-game signal)
        const gameOver = await page.evaluate(() => {
          const gs = (window as any).gameui?.gamedatas?.gamestate;
          return gs?.name === 'gameEnd' || gs?.name === 'endGame';
        });
        if (gameOver) {
          log({ event: 'gameEnd', round: currentRound }, verbose);
          const scores = await getFinalScores(page);
          let dataFile: string | undefined;
          if (collector) {
            collector.endRound(scores);
            dataFile = collector.finalize(scores);
          }
          return { scores, turnsPlayed, rounds: currentRound, dataFile };
        }
        state = await readGameState(page);
        if (state.hand.length > 0) {
          foundNewState = true;
          break;
        }
      }
      if (!foundNewState) {
        throw new Error('Timed out waiting for new round after hand emptied.');
      }
    }

    const currentTurn = inferTurn(state.hand.length);

    // Detect new round: hand jumped from <9 to ≥9 cards.
    // Normal flow: last turn hand=1 → play → hand=0 → BGA deals → hand=10.
    // We use ≥9 (not ==10) because getAllItems() can briefly return 9 during animation.
    // The turnsPlayed>0 guard prevents false-triggering on initial game join.
    if (state.hand.length >= 9 && lastHandSize < 9 && lastHandSize >= 0 && turnsPlayed > 0) {
      currentRound++;
      log({ event: 'newRound', round: currentRound }, verbose);
      const hand = state.hand.map(h => h.cardValue as number);
      const board = state.board.rows.map(r => [...r]);
      roundStartBoard = board; // save for initialBoardCards in strategy state
      collector?.startRound(currentRound, board, hand);
    }
    lastHandSize = state.hand.length;

    // 3. Execute action
    if (action === 'playCard') {
      const boardBefore = state.board.rows.map(r => [...r]);
      const cardState = buildCardChoiceState(state, playerCount, currentRound, currentTurn, roundStartBoard);
      
      const t0 = Date.now();
      const card = strategy.chooseCard(cardState);
      const decisionTime = Date.now() - t0;
      
      if (delay) await page.waitForTimeout(delay);
      await playCard(page, state.hand, card);
      lastPlayedCard = card; // track for potential row pick that follows
      turnsPlayed++;

      // CRITICAL: Wait for card to actually leave hand before continuing.
      // Without this, the next loop iteration would read the same hand state
      // (card still animating out) and try to play the same card again.
      // BGA card animations take 1-3s depending on resolution speed.
      const expectedSize = state.hand.length - 1;
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(500);
        const check = await page.evaluate(() => {
          return (window as any).gameui?.playerHand?.getAllItems?.()?.length ?? -1;
        });
        if (check <= expectedSize) break;
      }

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
      // Row pick: our played card was lower than all row tails, so we must
      // pick a row to take (absorb its penalty points). Strategy decides which;
      // fallback to cheapest row (fewest cattle heads) if strategy throws.
      let rowIdx: 0 | 1 | 2 | 3;
      try {
        const rowState = buildRowChoiceState(state, playerCount, currentRound, turnsPlayed, lastPlayedCard);
        rowIdx = strategy.chooseRow(rowState);
      } catch {
        rowIdx = findCheapestRow(state.board);
      }

      if (delay) await page.waitForTimeout(delay);
      await pickRow(page, rowIdx);

      // Record row pick in data collection
      collector?.recordRowPick(rowIdx, state.board.rows.map(r => [...r]));

      log({
        event: 'pickRow',
        row: rowIdx,
        round: currentRound,
        turn: turnsPlayed,
      }, verbose);
    }

    // Wait for BGA animations to resolve (card placement, row clearing, etc.)
    // then snapshot the board for data collection.
    await page.waitForTimeout(1500);
    try {
      const postState = await readGameState(page);
      collector?.recordBoardAfter(postState.board.rows.map(r => [...r]));
    } catch { /* non-critical — don't crash if post-read fails */ }
  }
}

function buildCardChoiceState(
  state: GameStateFromDOM,
  playerCount: number,
  round: number,
  turn: number,
  roundStartBoard: number[][],
): CardChoiceState {
  const board = { rows: state.board.rows as unknown as readonly [readonly CardNumber[], readonly CardNumber[], readonly CardNumber[], readonly CardNumber[]] };
  const initialBoard = { rows: roundStartBoard as unknown as readonly [readonly CardNumber[], readonly CardNumber[], readonly CardNumber[], readonly CardNumber[]] };
  return {
    hand: state.hand.map(h => h.cardValue),
    board,
    playerScores: state.scores,
    playerCount,
    round,
    turn, // already 1-based from inferTurn (11 - handSize)
    turnHistory: [],
    initialBoardCards: initialBoard,
  };
}

function buildRowChoiceState(
  state: GameStateFromDOM,
  playerCount: number,
  round: number,
  turn: number,
  lastPlayedCard?: CardNumber,
): RowChoiceState {
  const board = { rows: state.board.rows as unknown as readonly [readonly CardNumber[], readonly CardNumber[], readonly CardNumber[], readonly CardNumber[]] };
  return {
    board,
    // triggeringCard is the card we played that forced the row pick.
    // We track it from the previous play action; fallback to 1 if unknown.
    triggeringCard: lastPlayedCard ?? (1 as CardNumber),
    revealedThisTurn: [],
    resolutionIndex: 0,
    hand: state.hand.map(h => h.cardValue),
    playerScores: state.scores,
    playerCount,
    round,
    turn, // already 1-based from inferTurn
    turnHistory: [],
  };
}
