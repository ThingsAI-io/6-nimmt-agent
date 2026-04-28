import { describe, it, expect } from 'vitest';
import {
  determinePlacement,
  resolveOverflow,
  resolveTurn,
  type Board,
  type RowPickFn,
} from '../reference/index';
import placementScenarios from '../../spec/fixtures/placement-scenarios.json';
import overflowScenarios from '../../spec/fixtures/overflow-scenarios.json';
import mustPickRowScenarios from '../../spec/fixtures/must-pick-row-scenarios.json';

interface RowPick {
  playerId: string;
  rowIndex?: number;
  pickedRowIndex?: number;
}

interface SingleCardScenario {
  id: string;
  board: number[][];
  card: number;
  expected: { kind: string; rowIndex?: number; causedOverflow?: boolean };
}

interface MultiPlayScenario {
  id: string;
  board: number[][];
  plays: Array<{ playerId: string; card: number }>;
  rowPicks?: RowPick[];
  expected: {
    rowPicks?: RowPick[];
    collected?: Record<string, number[]>;
    boardAfter: number[][];
  };
}

function makeRowPickFn(rowPicks: RowPick[]): RowPickFn {
  const picks = [...rowPicks];
  let idx = 0;
  return (_board, _card, playerId) => {
    while (idx < picks.length) {
      const pick = picks[idx];
      idx++;
      if (pick.playerId === playerId) {
        return pick.rowIndex ?? pick.pickedRowIndex ?? 0;
      }
    }
    throw new Error(`No row pick found for player ${playerId}`);
  };
}

function runSingleCardScenario(scenario: SingleCardScenario) {
  const board = scenario.board as Board;
  const rowIdx = determinePlacement(board, scenario.card);

  if (scenario.expected.kind === 'must-pick-row') {
    expect(rowIdx, scenario.id).toBe(-1);
    return;
  }

  expect(rowIdx, `${scenario.id}: rowIndex`).toBe(scenario.expected.rowIndex);

  if (scenario.expected.causedOverflow !== undefined) {
    const row = board[rowIdx];
    const { collected } = resolveOverflow(row, scenario.card);
    const didOverflow = collected.length > 0;
    expect(didOverflow, `${scenario.id}: overflow`).toBe(scenario.expected.causedOverflow);
  }
}

function runMultiPlayScenario(scenario: MultiPlayScenario) {
  const board = scenario.board as Board;
  const rowPicks = scenario.expected.rowPicks ?? scenario.rowPicks ?? [];
  const pickFn = makeRowPickFn(rowPicks);

  const result = resolveTurn(board, scenario.plays, pickFn);

  expect(result.board, `${scenario.id}: boardAfter`).toEqual(scenario.expected.boardAfter);

  const expectedCollected = scenario.expected.collected ?? {};
  const actualCollected: Record<string, number[]> = {};
  for (const [pid, cards] of result.collectedByPlayer) {
    if (cards.length > 0) actualCollected[pid] = cards;
  }
  expect(actualCollected, `${scenario.id}: collected`).toEqual(expectedCollected);
}

describe('placement-scenarios.json', () => {
  const singleCard = placementScenarios.filter(
    (s): s is SingleCardScenario & typeof s => !('plays' in s),
  );
  const multiPlay = placementScenarios.filter(
    (s): s is MultiPlayScenario & typeof s => 'plays' in s,
  );

  describe('single-card placement', () => {
    for (const scenario of singleCard) {
      it(scenario.id, () => runSingleCardScenario(scenario));
    }
  });

  describe('multi-play turns', () => {
    for (const scenario of multiPlay) {
      it(scenario.id, () => runMultiPlayScenario(scenario));
    }
  });

  it('includes 2-, 5-, and 10-play scenarios', () => {
    const counts = new Set(multiPlay.map((s) => s.plays.length));
    expect(counts.has(2)).toBe(true);
    expect(counts.has(5)).toBe(true);
    expect(counts.has(10)).toBe(true);
  });
});

describe('overflow-scenarios.json', () => {
  for (const scenario of overflowScenarios) {
    it(scenario.id, () => runMultiPlayScenario(scenario as MultiPlayScenario));
  }

  it('includes a 10-player cascade', () => {
    const has10 = overflowScenarios.some((s) => s.plays.length >= 10);
    expect(has10).toBe(true);
  });
});

describe('must-pick-row-scenarios.json', () => {
  for (const scenario of mustPickRowScenarios) {
    it(scenario.id, () => {
      const board = scenario.board as Board;
      const rowPicks = scenario.rowPicks;
      const pickFn = makeRowPickFn(rowPicks);

      const result = resolveTurn(board, scenario.plays, pickFn);

      expect(result.board, `${scenario.id}: boardAfter`).toEqual(scenario.expected.boardAfter);

      const actualCollected: Record<string, number[]> = {};
      for (const [pid, cards] of result.collectedByPlayer) {
        if (cards.length > 0) actualCollected[pid] = cards;
      }
      const expectedCollected: Record<string, number[]> = {};
      for (const [pid, cards] of Object.entries(scenario.expected.collected)) {
        if ((cards as number[]).length > 0) expectedCollected[pid] = cards as number[];
      }
      expect(actualCollected, `${scenario.id}: collected`).toEqual(expectedCollected);
    });
  }
});
