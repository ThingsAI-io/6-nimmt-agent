import type { Strategy, TurnResolution } from './types';
import type { CardNumber, Board } from '../types';
import { cattleHeads } from '../card';

const DEFAULT_MC_MAX = 500;
const DEFAULT_MC_PER_CARD = 50;

export interface McsOptions {
  /** Maximum total simulations across all cards (default: 500) */
  mcMax?: number;
  /** Simulations per candidate card (default: 50, capped by mcMax) */
  mcPerCard?: number;
}

function fewestHeadsRowIndex(rows: readonly (readonly CardNumber[])[]): 0 | 1 | 2 | 3 {
  let best = 0;
  let bestP = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i].reduce((s, c) => s + cattleHeads(c), 0);
    if (p < bestP) {
      bestP = p;
      best = i;
    }
  }
  return best as 0 | 1 | 2 | 3;
}

/** Deep-copy board rows into mutable arrays. */
function cloneBoard(board: Board): CardNumber[][] {
  return board.rows.map((row) => [...row]);
}

/** Fisher-Yates shuffle (in-place) using provided rng. */
function fisherYates<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Simulate placing all plays onto the board, return penalty for player 0 (us).
 * Modifies board in-place.
 */
function simulateTurn(
  plays: CardNumber[],
  board: CardNumber[][],
  myIndex: number,
): number {
  const indexed = plays.map((card, i) => ({ card, idx: i }));
  indexed.sort((a, b) => a.card - b.card);
  let penalty = 0;

  for (const { card, idx } of indexed) {
    let bestRow = -1;
    let bestTail = -1;
    for (let i = 0; i < board.length; i++) {
      const tail = board[i][board[i].length - 1];
      if (tail < card && tail > bestTail) {
        bestTail = tail;
        bestRow = i;
      }
    }

    if (bestRow === -1) {
      // Card lower than all tails — pick row with fewest heads
      const rowIdx = fewestHeadsRowIndex(board);
      if (idx === myIndex) {
        penalty += board[rowIdx].reduce((s, c) => s + cattleHeads(c), 0);
      }
      board[rowIdx] = [card];
    } else if (board[bestRow].length >= 5) {
      // Overflow: 6th card
      if (idx === myIndex) {
        penalty += board[bestRow].reduce((s, c) => s + cattleHeads(c), 0);
      }
      board[bestRow] = [card];
    } else {
      board[bestRow].push(card);
    }
  }

  return penalty;
}

/**
 * Simulate the entire remaining round from a given state.
 * Returns total penalty accumulated by "us" (player index 0).
 *
 * hands[0] = our hand (with myCard already chosen for turn 1)
 * hands[1..N-1] = sampled opponent hands
 */
function simulateRound(
  board: CardNumber[][],
  hands: CardNumber[][],
  myFirstCard: CardNumber,
  rng: () => number,
): number {
  let totalPenalty = 0;
  const playerCount = hands.length;

  // First turn: we play myFirstCard, opponents play random
  const firstPlays: CardNumber[] = [myFirstCard];
  for (let i = 1; i < playerCount; i++) {
    if (hands[i].length === 0) continue;
    const idx = Math.floor(rng() * hands[i].length);
    firstPlays.push(hands[i][idx]);
    hands[i].splice(idx, 1);
  }
  // Remove our played card from hand
  const myHandIdx = hands[0].indexOf(myFirstCard);
  if (myHandIdx !== -1) hands[0].splice(myHandIdx, 1);

  totalPenalty += simulateTurn(firstPlays, board, 0);

  // Remaining turns: all players play random
  const remainingTurns = hands[0].length;
  for (let t = 0; t < remainingTurns; t++) {
    const plays: CardNumber[] = [];
    for (let i = 0; i < playerCount; i++) {
      if (hands[i].length === 0) continue;
      const idx = Math.floor(rng() * hands[i].length);
      plays.push(hands[i][idx]);
      hands[i].splice(idx, 1);
    }
    if (plays.length > 0) {
      totalPenalty += simulateTurn(plays, board, 0);
    }
  }

  return totalPenalty;
}

/**
 * Monte-Carlo Search strategy.
 *
 * Simulates full remaining rounds with random opponent hands to evaluate
 * each possible card play. Picks the card with lowest average total penalty
 * across all simulations.
 *
 * Card counting:
 * - In simulation/MCP: receives onTurnResolved() calls with all played cards.
 * - In live play: onTurnResolved() is never called. Instead, we infer seen cards
 *   by observing the board on every decision — any card that was ever on any board
 *   is eliminated from the unknown pool, even after rows are cleared/taken.
 *   This "passive card counting" works across rounds and reconnects.
 *
 * Based on the MCS agent from:
 *   Johann Brehmer & Marcel Gutsche, "Beating 6 nimmt! with reinforcement learning"
 *   https://github.com/johannbrehmer/rl-6nimmt
 */
export function createMcsStrategy(options: McsOptions = {}): Strategy {
  const mcMax = Math.max(1, Math.floor(Number(options.mcMax) || DEFAULT_MC_MAX));
  const mcPerCard = Math.max(1, Math.floor(Number(options.mcPerCard) || DEFAULT_MC_PER_CARD));
  let rng: () => number = Math.random;
  let playerCount = 2;
  // Persistent set of all cards ever observed — never cleared between rounds.
  // Fed by onTurnResolved() in simulation, and by board observation in live play.
  let seenCards = new Set<number>();

  /** Observe all cards currently on the board, adding them to seenCards. */
  function observeBoard(board: { rows: readonly (readonly CardNumber[])[] }): void {
    for (const row of board.rows) {
      for (const c of row) seenCards.add(c);
    }
  }

  return {
    name: 'mcs',

    onGameStart(config) {
      rng = config.rng;
      playerCount = config.playerCount;
      seenCards = new Set();
    },

    onTurnResolved(resolution: TurnResolution) {
      for (const play of resolution.plays) {
        seenCards.add(play.card);
      }
      // Also track cards from row clears/overflows
      for (const res of resolution.resolutions) {
        if (res.collectedCards) {
          for (const c of res.collectedCards) seenCards.add(c);
        }
      }
      for (const pick of resolution.rowPicks) {
        for (const c of pick.collectedCards) seenCards.add(c);
      }
      if (resolution.boardAfter) {
        for (const row of resolution.boardAfter) {
          for (const card of row) seenCards.add(card);
        }
      }
    },

    chooseCard(state) {
      const { hand, board, turn } = state;
      const opponentCount = playerCount - 1;
      const cardsPerPlayer = 10 - turn + 1; // cards remaining per hand (including this turn)

      // Passive card counting: observe current board (catches cards played since last decision)
      observeBoard(board);
      observeBoard(state.initialBoardCards);

      // Build unknown pool
      const known = new Set<number>();
      for (const c of hand) known.add(c);
      for (const row of board.rows) {
        for (const c of row) known.add(c);
      }
      for (const c of seenCards) known.add(c);
      for (const entry of state.turnHistory) {
        for (const play of entry.plays) known.add(play.card);
      }
      for (const row of state.initialBoardCards.rows) {
        for (const c of row) known.add(c);
      }

      const unknownPool: CardNumber[] = [];
      for (let i = 1; i <= 104; i++) {
        if (!known.has(i)) unknownPool.push(i as CardNumber);
      }

      // Number of simulations
      const nSims = Math.min(mcMax, mcPerCard * hand.length);

      // If only one card, just play it
      if (hand.length === 1) return hand[0];

      let bestCard = hand[0];
      let bestPenalty = Infinity;

      for (const myCard of hand) {
        let totalPenalty = 0;
        const simsPerCard = Math.max(1, Math.floor(nSims / hand.length));

        for (let sample = 0; sample < simsPerCard; sample++) {
          // Shuffle and deal opponent hands
          fisherYates(unknownPool, rng);

          const hands: CardNumber[][] = [];
          // Our hand (remaining cards after playing myCard)
          hands.push([...hand].filter((c) => c !== myCard) as CardNumber[]);

          let offset = 0;
          for (let opp = 0; opp < opponentCount; opp++) {
            const handSize = Math.min(cardsPerPlayer, unknownPool.length - offset);
            if (handSize > 0) {
              hands.push(unknownPool.slice(offset, offset + handSize) as CardNumber[]);
              offset += handSize;
            } else {
              hands.push([]);
            }
          }

          const boardCopy = cloneBoard(board);
          totalPenalty += simulateRound(boardCopy, hands, myCard, rng);
        }

        const avgPenalty = totalPenalty / simsPerCard;
        if (avgPenalty < bestPenalty) {
          bestPenalty = avgPenalty;
          bestCard = myCard;
        }
      }

      return bestCard;
    },

    chooseRow(state) {
      // For row picks: simulate remaining round for each row choice
      const { board } = state;
      const opponentCount = playerCount - 1;
      // Remove triggeringCard from hand — it's already been played this turn
      const hand = state.hand.filter(c => c !== state.triggeringCard);
      const cardsPerPlayer = hand.length;

      // Passive card counting: observe current board
      observeBoard(board);

      // Build unknown pool
      const known = new Set<number>();
      for (const c of hand) known.add(c);
      for (const row of board.rows) {
        for (const c of row) known.add(c);
      }
      for (const c of seenCards) known.add(c);
      for (const entry of state.turnHistory) {
        for (const play of entry.plays) known.add(play.card);
      }
      // Also add cards revealed this turn
      for (const play of state.revealedThisTurn) {
        known.add(play.card);
      }
      known.add(state.triggeringCard);

      const unknownPool: CardNumber[] = [];
      for (let i = 1; i <= 104; i++) {
        if (!known.has(i)) unknownPool.push(i as CardNumber);
      }

      // If cardsPerPlayer is 0 or this is the last turn, just pick fewest heads
      if (cardsPerPlayer === 0) {
        return fewestHeadsRowIndex(board.rows);
      }

      const simsPerRow = mcPerCard;
      let bestRow: 0 | 1 | 2 | 3 = 0;
      let bestPenalty = Infinity;

      for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
        let totalPenalty = 0;

        for (let sample = 0; sample < simsPerRow; sample++) {
          // Simulate taking this row
          const boardCopy = cloneBoard(board);
          const rowPenalty = boardCopy[rowIdx].reduce((s, c) => s + cattleHeads(c), 0);
          boardCopy[rowIdx] = [state.triggeringCard];

          // If no cards remain, just evaluate immediate penalty
          if (cardsPerPlayer === 0) {
            totalPenalty += rowPenalty;
            continue;
          }

          // Deal opponent hands for remaining turns
          fisherYates(unknownPool, rng);
          const hands: CardNumber[][] = [[...hand] as CardNumber[]];
          let offset = 0;
          for (let opp = 0; opp < opponentCount; opp++) {
            const hs = Math.min(cardsPerPlayer, unknownPool.length - offset);
            if (hs > 0) {
              hands.push(unknownPool.slice(offset, offset + hs) as CardNumber[]);
              offset += hs;
            } else {
              hands.push([]);
            }
          }

          // Play out remaining turns randomly
          let simPenalty = rowPenalty;
          const remainingTurns = hands[0].length;
          for (let t = 0; t < remainingTurns; t++) {
            const plays: CardNumber[] = [];
            for (let i = 0; i < hands.length; i++) {
              if (hands[i].length === 0) continue;
              const idx = Math.floor(rng() * hands[i].length);
              plays.push(hands[i][idx]);
              hands[i].splice(idx, 1);
            }
            if (plays.length > 0) {
              simPenalty += simulateTurn(plays, boardCopy, 0);
            }
          }

          totalPenalty += simPenalty;
        }

        const avgPenalty = totalPenalty / simsPerRow;
        if (avgPenalty < bestPenalty) {
          bestPenalty = avgPenalty;
          bestRow = rowIdx as 0 | 1 | 2 | 3;
        }
      }

      return bestRow;
    },
  };
}
