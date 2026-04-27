import { describe, it, expect } from 'vitest';
import { cattleHeads, isGameOver, getWinners } from '../reference/index';
import scenarios from '../../spec/fixtures/round-scoring-scenarios.json';

describe('round-scoring-scenarios.json', () => {
  for (const scenario of scenarios) {
    describe(scenario.id, () => {
      it('penalties match', () => {
        for (const player of scenario.players) {
          const penalty = player.collectedThisRound.reduce(
            (s: number, c: number) => s + cattleHeads(c),
            0,
          );
          expect(
            penalty,
            `${player.id} penalty`,
          ).toBe((scenario.expected.penalties as Record<string, number>)[player.id]);
        }
      });

      it('scoresAfter match', () => {
        for (const player of scenario.players) {
          const penalty = player.collectedThisRound.reduce(
            (s: number, c: number) => s + cattleHeads(c),
            0,
          );
          const scoreAfter = player.scoreBefore + penalty;
          expect(
            scoreAfter,
            `${player.id} scoreAfter`,
          ).toBe((scenario.expected.scoresAfter as Record<string, number>)[player.id]);
        }
      });

      it('gameOver matches', () => {
        const scores = new Map<string, number>();
        for (const player of scenario.players) {
          const penalty = player.collectedThisRound.reduce(
            (s: number, c: number) => s + cattleHeads(c),
            0,
          );
          scores.set(player.id, player.scoreBefore + penalty);
        }
        expect(isGameOver(scores)).toBe(scenario.expected.gameOver);
      });

      it('winners match', () => {
        if (!scenario.expected.gameOver) {
          expect(scenario.expected.winners).toEqual([]);
          return;
        }
        const scores = new Map<string, number>();
        for (const player of scenario.players) {
          const penalty = player.collectedThisRound.reduce(
            (s: number, c: number) => s + cattleHeads(c),
            0,
          );
          scores.set(player.id, player.scoreBefore + penalty);
        }
        const winners = getWinners(scores);
        expect(winners.sort()).toEqual([...scenario.expected.winners].sort());
      });
    });
  }
});
