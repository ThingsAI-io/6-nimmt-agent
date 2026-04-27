import type { Strategy } from './types';
import { cattleHeads } from '../card';

/** Creates a random baseline strategy. */
export function createRandomStrategy(): Strategy {
  let rng: (() => number) | null = null;

  return {
    name: 'random',

    onGameStart(config) {
      rng = config.rng;
    },

    chooseCard(state) {
      if (!rng) {
        throw new Error(
          'RandomStrategy: onGameStart() must be called before chooseCard()',
        );
      }
      const { hand } = state;
      const index = Math.floor(rng() * hand.length);
      return hand[index];
    },

    chooseRow(state) {
      const { board } = state;
      let bestIndex = 0;
      let bestPenalty = Infinity;

      for (let i = 0; i < board.rows.length; i++) {
        const p = board.rows[i].reduce(
          (sum, card) => sum + cattleHeads(card),
          0,
        );
        if (p < bestPenalty) {
          bestPenalty = p;
          bestIndex = i;
        }
      }

      return bestIndex as 0 | 1 | 2 | 3;
    },
  };
}
