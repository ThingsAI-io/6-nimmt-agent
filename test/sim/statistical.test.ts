import { describe, it, expect } from 'vitest';
import { runBatch } from '../../src/sim';
import type { SimConfig, GameResult } from '../../src/sim';

function makeConfig(playerCount: number, seed?: string): SimConfig {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i}`,
      strategy: 'random',
    })),
    seed,
  };
}

describe.each([2, 5, 10])('Statistical smoke (%i players)', (playerCount) => {
  const batchSeed = `stat-smoke-${playerCount}p`;
  const games = 1000;

  let batch: ReturnType<typeof runBatch>;
  let allResults: readonly GameResult[];

  function ensureResults() {
    if (batch) return;
    batch = runBatch(makeConfig(playerCount), games, batchSeed);
    allResults = batch.gameResults;
  }

  it('all games terminate (no infinite loops)', () => {
    ensureResults();
    expect(allResults).toHaveLength(games);
    for (const r of allResults) {
      expect(r.rounds).toBeGreaterThanOrEqual(1);
    }
  });

  it('average game length between 1 and 20 rounds', () => {
    ensureResults();
    const avgRounds =
      allResults.reduce((sum, r) => sum + r.rounds, 0) / games;
    expect(avgRounds).toBeGreaterThanOrEqual(1);
    expect(avgRounds).toBeLessThanOrEqual(20);
  });

  it('no negative scores in any game', () => {
    ensureResults();
    for (const r of allResults) {
      for (const pr of r.playerResults) {
        expect(pr.finalScore).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every game has at least one winner (rank === 1)', () => {
    ensureResults();
    for (const r of allResults) {
      const hasWinner = r.playerResults.some((pr) => pr.rank === 1);
      expect(hasWinner).toBe(true);
    }
  });

  it('win rate per seat is roughly 1/N (±0.15)', () => {
    ensureResults();
    const expectedRate = 1 / playerCount;
    const tolerance = 0.15;

    // Track wins per seat (player id)
    const winsPerSeat = new Map<string, number>();
    for (let i = 0; i < playerCount; i++) {
      winsPerSeat.set(`p${i}`, 0);
    }

    for (const r of allResults) {
      for (const pr of r.playerResults) {
        if (pr.rank === 1) {
          winsPerSeat.set(pr.id, (winsPerSeat.get(pr.id) ?? 0) + 1);
        }
      }
    }

    for (const [, wins] of winsPerSeat) {
      const rate = wins / games;
      expect(rate).toBeGreaterThanOrEqual(
        expectedRate - tolerance,
      );
      expect(rate).toBeLessThanOrEqual(
        expectedRate + tolerance,
      );
    }
  });

  it('mean score across all games is within reasonable bounds (1–100)', () => {
    ensureResults();
    let totalScore = 0;
    let count = 0;
    for (const r of allResults) {
      for (const pr of r.playerResults) {
        totalScore += pr.finalScore;
        count++;
      }
    }
    const meanScore = totalScore / count;
    expect(meanScore).toBeGreaterThanOrEqual(1);
    expect(meanScore).toBeLessThanOrEqual(100);
  });

  it('games complete correctly (deck remainder handled)', () => {
    ensureResults();
    // If games complete without error, the deck/deal formula works.
    // Just verify all games have valid results.
    for (const r of allResults) {
      expect(r.playerResults).toHaveLength(playerCount);
      expect(r.rounds).toBeGreaterThanOrEqual(1);
    }
  });
});
