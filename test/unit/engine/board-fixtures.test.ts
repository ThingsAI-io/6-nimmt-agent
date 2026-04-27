import { describe, it, expect } from 'vitest';
import { determinePlacement } from '../../../src/engine/board';
import type { Board, CardNumber } from '../../../src/engine/types';
import scenarios from '../../../spec/fixtures/placement-scenarios.json';

interface SingleCardScenario {
  id: string;
  description: string;
  board: number[][];
  card: number;
  expected: { kind: string; rowIndex?: number; causedOverflow?: boolean };
}

function mkBoard(rows: number[][]): Board {
  return {
    rows: rows.map((r) => r.map((n) => n as CardNumber)),
  } as unknown as Board;
}

const singleCard = scenarios.filter(
  (s): s is SingleCardScenario & typeof s => 'card' in s && !('plays' in s),
);

describe('board-fixtures: single-card placement scenarios', () => {
  for (const scenario of singleCard) {
    it(scenario.id, () => {
      const board = mkBoard(scenario.board);
      const result = determinePlacement(board, scenario.card as CardNumber);

      if (scenario.expected.kind === 'must-pick-row') {
        expect(result).toEqual({ kind: 'must-pick-row' });
        return;
      }

      expect('rowIndex' in result).toBe(true);
      if (!('rowIndex' in result)) return;

      expect(result.rowIndex).toBe(scenario.expected.rowIndex);
      expect(result.causedOverflow).toBe(scenario.expected.causedOverflow);
    });
  }
});
