import type { Strategy, TurnResolution } from './types';
import type { CardNumber, Board } from '../types';
import { cattleHeads } from '../card';

const DEFAULT_MC_PER_CARD = 50;

export interface McsOptions {
  /** Maximum total simulations across all cards (default: 10 × mcPerCard) */
  mcMax?: number;
  /** Simulations per candidate card (default: 50, capped by mcMax) */
  mcPerCard?: number;
  /** Scoring mode: 'self' = minimize own penalty, 'relative' = minimize own minus avg opponent (default: 'self') */
  scoring?: 'self' | 'relative';
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
 * Simulate placing all plays onto the board, return penalties for each player.
 * Modifies board in-place. Returns array where penalties[i] = penalty for player i.
 */
function simulateTurn(
  plays: CardNumber[],
  board: CardNumber[][],
): number[] {
  const indexed = plays.map((card, i) => ({ card, idx: i }));
  indexed.sort((a, b) => a.card - b.card);
  const penalties = new Array(plays.length).fill(0) as number[];

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
      penalties[idx] += board[rowIdx].reduce((s, c) => s + cattleHeads(c), 0);
      board[rowIdx] = [card];
    } else if (board[bestRow].length >= 5) {
      // Overflow: 6th card
      penalties[idx] += board[bestRow].reduce((s, c) => s + cattleHeads(c), 0);
      board[bestRow] = [card];
    } else {
      board[bestRow].push(card);
    }
  }

  return penalties;
}

/**
 * Simulate the entire remaining round from a given state.
 * Returns array of penalties for each player (index 0 = us).
 *
 * hands[0] = our hand (with myCard already chosen for turn 1)
 * hands[1..N-1] = sampled opponent hands
 */
function simulateRound(
  board: CardNumber[][],
  hands: CardNumber[][],
  myFirstCard: CardNumber,
  rng: () => number,
): number[] {
  const playerCount = hands.length;
  const totalPenalties = new Array(playerCount).fill(0) as number[];

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

  const firstPenalties = simulateTurn(firstPlays, board);
  for (let i = 0; i < firstPenalties.length; i++) totalPenalties[i] += firstPenalties[i];

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
      const turnPenalties = simulateTurn(plays, board);
      for (let i = 0; i < turnPenalties.length; i++) totalPenalties[i] += turnPenalties[i];
    }
  }

  return totalPenalties;
}

/**
 * Monte-Carlo Search strategy.
 *
 * Simulates full remaining rounds with random opponent hands to evaluate
 * each possible card play. Picks the card with lowest average total penalty
 * across all simulations.
 *
 * Card counting is fed by the caller via onTurnResolved() — the strategy
 * tracks all cards it's been told about and excludes them from the unknown pool.
 *
 * Based on the MCS agent from:
 *   Johann Brehmer & Marcel Gutsche, "Beating 6 nimmt! with reinforcement learning"
 *   https://github.com/johannbrehmer/rl-6nimmt
 */
export function createMcsStrategy(options: McsOptions = {}): Strategy {
  // Validate options — reject unknown keys to catch typos
  const VALID_OPTIONS = new Set(['mcPerCard', 'mcMax', 'scoring']);
  for (const key of Object.keys(options)) {
    if (!VALID_OPTIONS.has(key)) {
      throw new Error(`Unknown MCS option "${key}". Valid options: ${[...VALID_OPTIONS].join(', ')}`);
    }
  }
  if (options.scoring !== undefined && options.scoring !== 'self' && options.scoring !== 'relative') {
    throw new Error(`Invalid scoring mode "${options.scoring}". Must be "self" or "relative".`);
  }

  const mcPerCard = Math.max(1, Math.floor(Number(options.mcPerCard) || DEFAULT_MC_PER_CARD));
  // Default mcMax = 10 × mcPerCard (max hand size is 10, so budget never clips by default)
  const mcMax = Math.max(1, Math.floor(Number(options.mcMax) || mcPerCard * 10));
  const scoring: 'self' | 'relative' = options.scoring === 'relative' ? 'relative' : 'self';
  let rng: () => number = Math.random;
  let playerCount = 2;
  // Persistent set of all cards ever observed — fed by onTurnResolved().
  let seenCards = new Set<number>();

  /** Score a simulation result based on scoring mode. Lower = better. */
  function score(penalties: number[]): number {
    const myPenalty = penalties[0];
    if (scoring === 'self') return myPenalty;
    // 'relative': our penalty minus average opponent penalty (negative = we're winning)
    const oppTotal = penalties.slice(1).reduce((s, p) => s + p, 0);
    const oppAvg = penalties.length > 1 ? oppTotal / (penalties.length - 1) : 0;
    return myPenalty - oppAvg;
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
          totalPenalty += score(simulateRound(boardCopy, hands, myCard, rng));
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
            // In relative mode, only we take the row penalty (opponents get 0)
            const allPenalties = new Array(opponentCount + 1).fill(0) as number[];
            allPenalties[0] = rowPenalty;
            totalPenalty += score(allPenalties);
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

          // Play out remaining turns randomly, accumulate all penalties
          const simPenalties = new Array(hands.length).fill(0) as number[];
          simPenalties[0] = rowPenalty; // we already took the row
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
              const turnPenalties = simulateTurn(plays, boardCopy);
              for (let i = 0; i < turnPenalties.length; i++) simPenalties[i] += turnPenalties[i];
            }
          }

          totalPenalty += score(simPenalties);
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
