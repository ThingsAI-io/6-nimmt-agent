import { describe, it, expect } from 'vitest';
import { runBatch } from '../../src/sim';
import type { SimConfig } from '../../src/sim';

function makeConfig(playerCount: number, seed?: string): SimConfig {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i}`,
      strategy: 'random',
    })),
    seed,
  };
}

describe('BatchRunner', () => {
  it('completes a batch of 10 games without error', () => {
    const result = runBatch(makeConfig(2), 10, 'batch-smoke');

    expect(result.gamesPlayed).toBe(10);
    expect(result.perStrategy.size).toBeGreaterThan(0);
  });

  it('same batchSeed produces identical BatchResult (determinism)', () => {
    const a = runBatch(makeConfig(2), 10, 'det-seed');
    const b = runBatch(makeConfig(2), 10, 'det-seed');

    expect(a.gamesPlayed).toBe(b.gamesPlayed);
    const statsA = a.perStrategy.get('random')!;
    const statsB = b.perStrategy.get('random')!;
    expect(statsA).toEqual(statsB);
  });

  it('different batchSeed produces different results', () => {
    const a = runBatch(makeConfig(2), 10, 'seed-alpha');
    const b = runBatch(makeConfig(2), 10, 'seed-beta');

    const statsA = a.perStrategy.get('random')!;
    const statsB = b.perStrategy.get('random')!;
    // With 10 games and different seeds, at least one stat should differ
    const same =
      statsA.avgScore === statsB.avgScore &&
      statsA.wins === statsB.wins &&
      statsA.medianScore === statsB.medianScore;
    expect(same).toBe(false);
  });

  it('statistics fields are populated correctly', () => {
    const result = runBatch(makeConfig(3), 20, 'stats-check');
    const stats = result.perStrategy.get('random')!;

    expect(stats.winRate).toBeGreaterThanOrEqual(0);
    expect(stats.winRate).toBeLessThanOrEqual(1);
    expect(stats.avgScore).toBeGreaterThanOrEqual(stats.minScore);
    expect(stats.avgScore).toBeLessThanOrEqual(stats.maxScore);
    expect(stats.medianScore).toBeGreaterThanOrEqual(stats.minScore);
    expect(stats.medianScore).toBeLessThanOrEqual(stats.maxScore);
    // All 3 players use 'random', so wins pools across all 3 seats per game
    expect(stats.wins).toBeLessThanOrEqual(result.gamesPlayed * 3);
  });

  it('pools multiple players with same strategy into single entry', () => {
    const config: SimConfig = {
      players: [
        { id: 'a', strategy: 'random' },
        { id: 'b', strategy: 'random' },
        { id: 'c', strategy: 'random' },
        { id: 'd', strategy: 'random' },
      ],
    };
    const result = runBatch(config, 10, 'pool-test');

    expect(result.perStrategy.size).toBe(1);
    expect(result.perStrategy.has('random')).toBe(true);
  });

  it('5-player config batch works', () => {
    const result = runBatch(makeConfig(5), 10, 'five-player');

    expect(result.gamesPlayed).toBe(10);
    expect(result.perStrategy.get('random')).toBeDefined();
    expect(result.perStrategy.get('random')!.wins).toBeGreaterThanOrEqual(0);
  });

  it('10-player config batch works', () => {
    const result = runBatch(makeConfig(10), 10, 'ten-player');

    expect(result.gamesPlayed).toBe(10);
    expect(result.perStrategy.get('random')).toBeDefined();
    expect(result.perStrategy.get('random')!.wins).toBeGreaterThanOrEqual(0);
  });
});
