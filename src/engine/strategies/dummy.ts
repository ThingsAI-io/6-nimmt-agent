import type { Strategy } from './types';
import { cattleHeads } from '../card';

function fewestHeadsRow(board: { rows: readonly (readonly number[])[] }): 0 | 1 | 2 | 3 {
  let best = 0;
  let bestP = Infinity;
  for (let i = 0; i < board.rows.length; i++) {
    const p = board.rows[i].reduce((s, c) => s + cattleHeads(c), 0);
    if (p < bestP) { bestP = p; best = i; }
  }
  return best as 0 | 1 | 2 | 3;
}

/** Always plays the lowest card in hand. */
export function createDummyMinStrategy(): Strategy {
  return {
    name: 'dummy-min',
    chooseCard(state) {
      let min = state.hand[0];
      for (let i = 1; i < state.hand.length; i++) {
        if (state.hand[i] < min) min = state.hand[i];
      }
      return min;
    },
    chooseRow(state) {
      return fewestHeadsRow(state.board);
    },
  };
}

/** Always plays the highest card in hand. */
export function createDummyMaxStrategy(): Strategy {
  return {
    name: 'dummy-max',
    chooseCard(state) {
      let max = state.hand[0];
      for (let i = 1; i < state.hand.length; i++) {
        if (state.hand[i] > max) max = state.hand[i];
      }
      return max;
    },
    chooseRow(state) {
      return fewestHeadsRow(state.board);
    },
  };
}
