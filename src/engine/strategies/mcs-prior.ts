/**
 * MCS-Prior strategy — Monte Carlo Search enhanced with prior-based heuristic evaluation.
 *
 * Instead of simulating entire remaining rounds (expensive, noisy), this strategy:
 * 1. Simulates only 1–2 turns forward (cheap, more samples)
 * 2. Evaluates the resulting hand + board state using a pre-computed prior
 * 3. Models opponents with prior-weighted card selection (not uniform random)
 *
 * The prior captures per-card danger (overflow/row-pick rates, penalties, timing)
 * and per-turn board baselines (min row top, primed rows) from thousands of games.
 */
import type { Strategy, TurnResolution } from './types';
import type { CardNumber } from '../types';
import { cattleHeads } from '../card';
import {
  fewestHeadsRowIndex,
  cloneBoard,
  accumulateTurn,
  buildUnknownPool,
  buildUnknownPoolForRowChoice,
  updateSeenCards,
  sampleOpponentHands,
} from './mcs-base';
import { CARD_PRIOR, TURN_BASELINE } from './prior-table';

export interface McsPriorOptions {
  /** Simulations per candidate card (default: 100) */
  mcPerCard?: number;
  /** Maximum total simulations (default: 10 × mcPerCard) */
  mcMax?: number;
  /** Scoring mode (default: 'relative') */
  scoring?: 'self' | 'relative';
  /** Turns to simulate forward before applying heuristic (default: 1) */
  simDepth?: number;
  /** Opponent model: 'uniform' = random, 'prior' = weighted by inverse danger (default: 'prior') */
  opponentModel?: 'uniform' | 'prior';
  /** Weight of timing pressure in heuristic (default: 0.3) */
  timingWeight?: number;
}

const DEFAULT_MC_PER_CARD = 100;
const DEFAULT_SIM_DEPTH = 1;
const DEFAULT_TIMING_WEIGHT = 0.3;

/**
 * Compute heuristic danger score for a hand given board context.
 * Higher = more dangerous hand to be holding.
 */
function evaluateHand(
  hand: readonly CardNumber[],
  board: CardNumber[][],
  turn: number,
  timingWeight: number,
): number {
  if (hand.length === 0) return 0;

  const rowTops = board.map(r => r[r.length - 1]);
  const minRowTop = Math.min(...rowTops);
  const rowLens = board.map(r => r.length);
  const primedCount = rowLens.filter(l => l >= 5).length;

  const baseline = TURN_BASELINE[Math.min(turn - 1, 9)] ?? TURN_BASELINE[9];
  const baseMinTop = baseline.avgMinRowTop ?? 25;
  const basePrimed = baseline.avgPrimedRows ?? 1.0;

  let totalDanger = 0;
  for (const card of hand) {
    const prior = CARD_PRIOR[card - 1];
    if (!prior) continue;

    let cardDanger: number;
    if (card < minRowTop) {
      // Row pick risk — scales with how far below the min top we are
      const scale = Math.max(0.5, (minRowTop - card) / baseMinTop);
      cardDanger = prior.rowPickRate * prior.avgRowPickPenalty * scale;
    } else {
      // Overflow risk — scales with number of primed rows
      const scale = basePrimed > 0 ? Math.max(0.5, primedCount / basePrimed) : 1;
      cardDanger = prior.overflowRate * prior.avgOverflowPenalty * scale;
    }

    // Timing pressure: penalize holding cards past their natural play window
    const timingPressure = Math.max(0, turn - prior.avgTurn) * timingWeight;
    cardDanger *= (1 + timingPressure);

    totalDanger += cardDanger;
  }

  return totalDanger;
}

/**
 * Select a card from hand using prior-weighted distribution (inverse danger = more likely to play).
 * Cards with LOW expected penalty are played first (safe cards get dumped).
 */
function priorWeightedSelect(hand: CardNumber[], turn: number, rng: () => number): CardNumber {
  if (hand.length === 0) throw new Error('Empty hand');
  if (hand.length === 1) return hand[0];

  // Weight = inverse of expected penalty, adjusted by timing
  const weights: number[] = hand.map(card => {
    const prior = CARD_PRIOR[card - 1];
    if (!prior) return 1;
    // Cards that are "due" (past their avg turn) get higher weight (opponents dump them)
    const timingBoost = Math.max(0, turn - prior.avgTurn) * 0.2;
    // Inverse danger: safer cards are played more freely, dangerous cards are held
    // But timing pressure makes overdue dangerous cards more likely to be played
    const danger = prior.expectedPenalty || 0.5;
    return (1 / (danger + 0.1)) * (1 + timingBoost);
  });

  // Normalize and sample
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) {
    return hand[Math.floor(rng() * hand.length)];
  }

  let r = rng() * total;
  for (let i = 0; i < hand.length; i++) {
    r -= weights[i];
    if (r <= 0) return hand[i];
  }
  return hand[hand.length - 1];
}

/**
 * Simulate a single turn with prior-weighted opponent play.
 * Returns penalty array indexed by player position.
 */
function simulateTurnWithOpponentModel(
  hands: CardNumber[][],
  board: CardNumber[][],
  myCard: CardNumber,
  turn: number,
  opponentModel: 'uniform' | 'prior',
  rng: () => number,
): number[] {
  const taggedPlays: { playerIdx: number; card: CardNumber }[] = [
    { playerIdx: 0, card: myCard },
  ];

  // Remove our card from our hand
  const myIdx = hands[0].indexOf(myCard);
  if (myIdx !== -1) hands[0].splice(myIdx, 1);

  for (let i = 1; i < hands.length; i++) {
    if (hands[i].length === 0) continue;
    let card: CardNumber;
    if (opponentModel === 'prior') {
      card = priorWeightedSelect(hands[i], turn, rng);
    } else {
      const idx = Math.floor(rng() * hands[i].length);
      card = hands[i][idx];
    }
    const cardIdx = hands[i].indexOf(card);
    hands[i].splice(cardIdx, 1);
    taggedPlays.push({ playerIdx: i, card });
  }

  const penalties = new Array(hands.length).fill(0) as number[];
  accumulateTurn(taggedPlays, board, penalties);
  return penalties;
}

/**
 * Simulate remaining turns (after the evaluated first turn) with random/prior play.
 */
function simulateRemainingTurns(
  hands: CardNumber[][],
  board: CardNumber[][],
  penalties: number[],
  startTurn: number,
  turnsRemaining: number,
  opponentModel: 'uniform' | 'prior',
  rng: () => number,
): void {
  for (let t = 0; t < turnsRemaining; t++) {
    const turn = startTurn + t;
    const taggedPlays: { playerIdx: number; card: CardNumber }[] = [];
    for (let i = 0; i < hands.length; i++) {
      if (hands[i].length === 0) continue;
      let card: CardNumber;
      if (opponentModel === 'prior' && i > 0) {
        card = priorWeightedSelect(hands[i], turn, rng);
      } else {
        const idx = Math.floor(rng() * hands[i].length);
        card = hands[i][idx];
      }
      const cardIdx = hands[i].indexOf(card);
      hands[i].splice(cardIdx, 1);
      taggedPlays.push({ playerIdx: i, card });
    }
    if (taggedPlays.length > 0) {
      accumulateTurn(taggedPlays, board, penalties);
    }
  }
}

export function createMcsPriorStrategy(options: McsPriorOptions = {}): Strategy {
  const VALID_OPTIONS = new Set(['mcPerCard', 'mcMax', 'scoring', 'simDepth', 'opponentModel', 'timingWeight']);
  for (const key of Object.keys(options)) {
    if (!VALID_OPTIONS.has(key)) {
      throw new Error(`Unknown mcs-prior option "${key}". Valid: ${[...VALID_OPTIONS].join(', ')}`);
    }
  }

  const mcPerCard = Math.max(1, Math.floor(Number(options.mcPerCard) || DEFAULT_MC_PER_CARD));
  const mcMax = Math.max(1, Math.floor(Number(options.mcMax) || mcPerCard * 10));
  const scoring: 'self' | 'relative' = options.scoring === 'self' ? 'self' : 'relative';
  const simDepth = Math.max(1, Math.floor(Number(options.simDepth ?? DEFAULT_SIM_DEPTH)));
  const opponentModel: 'uniform' | 'prior' = options.opponentModel === 'uniform' ? 'uniform' : 'prior';
  const timingWeight = Number(options.timingWeight ?? DEFAULT_TIMING_WEIGHT);

  let rng: () => number = Math.random;
  let playerCount = 2;
  let seenCards = new Set<number>();

  function score(penalties: number[]): number {
    const myPenalty = penalties[0];
    if (scoring === 'self') return myPenalty;
    const oppTotal = penalties.slice(1).reduce((s, p) => s + p, 0);
    const oppAvg = penalties.length > 1 ? oppTotal / (penalties.length - 1) : 0;
    return myPenalty - oppAvg;
  }

  return {
    name: 'mcs-prior',

    getOptions() {
      return { mcPerCard, mcMax, scoring, simDepth, opponentModel, timingWeight };
    },

    onGameStart(config) {
      rng = config.rng;
      playerCount = config.playerCount;
      seenCards = new Set();
    },

    onRoundStart() {
      seenCards = new Set();
    },

    onTurnResolved(resolution: TurnResolution) {
      updateSeenCards(seenCards, resolution);
    },

    chooseCard(state) {
      const { hand, board, turn } = state;
      const opponentCount = playerCount - 1;
      const cardsPerPlayer = 10 - turn + 1;

      if (hand.length === 1) return hand[0];

      const unknownPool = buildUnknownPool(hand, board, seenCards, state.turnHistory, state.initialBoardCards);
      const nSims = Math.min(mcMax, mcPerCard * hand.length);

      let bestCard = hand[0];
      let bestScore = Infinity;

      for (const myCard of hand) {
        let totalScore = 0;
        const simsPerCard = Math.max(1, Math.floor(nSims / hand.length));

        for (let sample = 0; sample < simsPerCard; sample++) {
          // Sample opponent hands
          const oppHands = sampleOpponentHands(unknownPool, opponentCount, cardsPerPlayer, rng);
          const myHand = [...hand].filter(c => c !== myCard) as CardNumber[];
          const hands: CardNumber[][] = [myHand, ...oppHands];

          const boardCopy = cloneBoard(board);
          const penalties = new Array(hands.length).fill(0) as number[];

          // Simulate first turn (our card + opponent cards)
          const firstTurnPenalties = simulateTurnWithOpponentModel(
            hands, boardCopy, myCard, turn, opponentModel, rng,
          );
          for (let i = 0; i < penalties.length; i++) penalties[i] += firstTurnPenalties[i];

          // Simulate additional turns up to simDepth
          const extraTurns = Math.min(simDepth - 1, hands[0].length);
          if (extraTurns > 0) {
            simulateRemainingTurns(hands, boardCopy, penalties, turn + 1, extraTurns, opponentModel, rng);
          }

          // Heuristic evaluation of remaining hand + board state
          const heuristicTurn = turn + simDepth;
          const handDanger = evaluateHand(hands[0], boardCopy, heuristicTurn, timingWeight);
          penalties[0] += handDanger;

          totalScore += score(penalties);
        }

        const avgScore = totalScore / simsPerCard;
        if (avgScore < bestScore) {
          bestScore = avgScore;
          bestCard = myCard;
        }
      }

      return bestCard;
    },

    chooseRow(state) {
      const { board } = state;
      const opponentCount = playerCount - 1;
      const hand = state.hand.filter(c => c !== state.triggeringCard);
      const cardsPerPlayer = hand.length;

      const unknownPool = buildUnknownPoolForRowChoice(
        hand, board, seenCards, state.turnHistory, state.revealedThisTurn, state.triggeringCard,
      );

      if (cardsPerPlayer === 0) {
        return fewestHeadsRowIndex(board.rows);
      }

      const simsPerRow = mcPerCard;
      let bestRow: 0 | 1 | 2 | 3 = 0;
      let bestScore = Infinity;

      for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
        let totalScore = 0;

        for (let sample = 0; sample < simsPerRow; sample++) {
          const boardCopy = cloneBoard(board);
          const rowPenalty = boardCopy[rowIdx].reduce((s, c) => s + cattleHeads(c), 0);
          boardCopy[rowIdx] = [state.triggeringCard];

          const oppHands = sampleOpponentHands(unknownPool, opponentCount, cardsPerPlayer, rng);
          const hands: CardNumber[][] = [[...hand] as CardNumber[], ...oppHands];
          const penalties = new Array(hands.length).fill(0) as number[];
          penalties[0] = rowPenalty;

          // Simulate forward
          const turnsToSim = Math.min(simDepth, hands[0].length);
          simulateRemainingTurns(hands, boardCopy, penalties, state.turn + 1, turnsToSim, opponentModel, rng);

          // Heuristic on remaining hand
          const heuristicTurn = state.turn + 1 + turnsToSim;
          penalties[0] += evaluateHand(hands[0], boardCopy, heuristicTurn, timingWeight);

          totalScore += score(penalties);
        }

        const avgScore = totalScore / simsPerRow;
        if (avgScore < bestScore) {
          bestScore = avgScore;
          bestRow = rowIdx as 0 | 1 | 2 | 3;
        }
      }

      return bestRow;
    },
  };
}
