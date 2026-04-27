import { describe, it, expect } from 'vitest';
import {
  resolveTurn,
  cattleHeads,
  type Board,
  type RowPickFn,
  type Play,
} from '../reference/index';
import traces from '../../spec/fixtures/full-game-traces.json';

interface TraceRowPick {
  playerId: string;
  pickedRowIndex: number;
}

function makeRowPickFnFromTurn(rowPicks: TraceRowPick[]): RowPickFn {
  const picks = [...rowPicks];
  let idx = 0;
  return (_board, _card, playerId) => {
    while (idx < picks.length) {
      const pick = picks[idx];
      idx++;
      if (pick.playerId === playerId) {
        return pick.pickedRowIndex;
      }
    }
    throw new Error(`No row pick found for player ${playerId}`);
  };
}

function replayRound(round: (typeof traces)[0]['rounds'][0]) {
  let board = round.initialBoard as Board;
  const allCollected: Record<string, number[]> = {};

  for (const turn of round.turns) {
    const plays: Play[] = turn.plays.map((p) => ({
      playerId: p.playerId,
      card: p.card,
    }));
    const pickFn = makeRowPickFnFromTurn((turn.rowPicks ?? []) as TraceRowPick[]);
    const result = resolveTurn(board, plays, pickFn);
    board = result.board;
    for (const [pid, cards] of result.collectedByPlayer) {
      if (!allCollected[pid]) allCollected[pid] = [];
      allCollected[pid].push(...cards);
    }
  }

  return { board, allCollected };
}

describe('full-game-traces.json replay', () => {
  for (const trace of traces) {
    describe(`trace: ${trace.id} (${trace.playerCount} players)`, () => {
      const cumulativeScores: Record<string, number> = {};

      it('replays all rounds and turns correctly', () => {
        for (const round of trace.rounds) {
          let currentBoard = round.initialBoard as Board;

          for (const turn of round.turns) {
            const plays: Play[] = turn.plays.map((p) => ({
              playerId: p.playerId,
              card: p.card,
            }));

            const pickFn = makeRowPickFnFromTurn((turn.rowPicks ?? []) as TraceRowPick[]);
            const result = resolveTurn(currentBoard, plays, pickFn);

            expect(
              result.board,
              `round ${round.round} turn ${turn.turn}: boardAfter`,
            ).toEqual(turn.boardAfter);

            currentBoard = result.board;
          }

          // Re-run the whole round to get collected data for scoring verification
          const { allCollected } = replayRound(round);

          for (const scoreEntry of round.roundScores) {
            const pid = scoreEntry.id;
            const collected = allCollected[pid] ?? [];
            const penalty = collected.reduce((s, c) => s + cattleHeads(c), 0);
            expect(
              penalty,
              `round ${round.round} player ${pid}: penalty`,
            ).toBe(scoreEntry.penalty);

            if (!cumulativeScores[pid]) cumulativeScores[pid] = 0;
            cumulativeScores[pid] += penalty;
            expect(
              cumulativeScores[pid],
              `round ${round.round} player ${pid}: totalScore`,
            ).toBe(scoreEntry.totalScore);
          }
        }
      });

      it('final results match', () => {
        const scores: Record<string, number> = {};
        for (const round of trace.rounds) {
          const { allCollected } = replayRound(round);

          for (const scoreEntry of round.roundScores) {
            if (!scores[scoreEntry.id]) scores[scoreEntry.id] = 0;
            const collected = allCollected[scoreEntry.id] ?? [];
            scores[scoreEntry.id] += collected.reduce(
              (s, c) => s + cattleHeads(c),
              0,
            );
          }
        }

        for (const result of trace.finalResults) {
          expect(
            scores[result.id],
            `final score for ${result.id}`,
          ).toBe(result.finalScore);
        }
      });
    });
  }

  it('includes 2-player and 10-player games', () => {
    const playerCounts = traces.map((t) => t.playerCount);
    expect(playerCounts).toContain(2);
    expect(playerCounts).toContain(10);
  });
});
