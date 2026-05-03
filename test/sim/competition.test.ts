import { describe, it, expect } from 'vitest';
import { runCompetition } from '../../src/sim/competition';
import type { CompetitionConfig } from '../../src/sim/types';

function makeConfig(overrides?: Partial<CompetitionConfig>): CompetitionConfig {
  return {
    pool: [
      { strategy: 'random' },
      { strategy: 'dummy-min' },
      { strategy: 'dummy-max' },
    ],
    minPlayers: 3,
    maxPlayers: 5,
    games: 20,
    seed: 'competition-test',
    ...overrides,
  };
}

describe('CompetitionRunner', () => {
  it('completes a competition without error', () => {
    const result = runCompetition(makeConfig());
    expect(result.gamesPlayed).toBe(20);
    expect(result.gameResults.length).toBe(20);
  });

  it('produces ELO ratings for all strategies that participated', () => {
    const result = runCompetition(makeConfig());
    // All pool strategies should have been drawn at least once over 20 games
    expect(result.elo.ratings.size).toBeGreaterThan(0);
    expect(result.elo.totalGames).toBe(20);

    for (const [, rating] of result.elo.ratings) {
      expect(rating.gamesPlayed).toBeGreaterThan(0);
      expect(rating.history.length).toBe(rating.gamesPlayed);
    }
  });

  it('produces per-strategy stats for all participating strategies', () => {
    const result = runCompetition(makeConfig());
    expect(result.perStrategy.size).toBeGreaterThan(0);

    for (const [, stats] of result.perStrategy) {
      expect(stats.wins).toBeGreaterThanOrEqual(0);
      expect(stats.winRate).toBeGreaterThanOrEqual(0);
      expect(stats.winRate).toBeLessThanOrEqual(1);
      expect(stats.avgScore).toBeGreaterThanOrEqual(0); // penalty scores are non-negative
    }
  });

  it('generates games with varying player counts', () => {
    const result = runCompetition(
      makeConfig({ minPlayers: 2, maxPlayers: 8, games: 50 }),
    );

    const playerCounts = new Set(
      result.gameResults.map((g) => g.playerResults.length),
    );
    // With 50 games and range [2,8], we should see at least 2 different counts
    expect(playerCounts.size).toBeGreaterThanOrEqual(2);
    for (const count of playerCounts) {
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(8);
    }
  });

  it('is deterministic with the same seed', () => {
    const config = makeConfig({ games: 10 });
    const result1 = runCompetition(config);
    const result2 = runCompetition(config);

    // Same seed → same results
    expect(result1.gameResults.length).toBe(result2.gameResults.length);
    for (let i = 0; i < result1.gameResults.length; i++) {
      expect(result1.gameResults[i].seed).toBe(result2.gameResults[i].seed);
      expect(result1.gameResults[i].playerResults).toEqual(
        result2.gameResults[i].playerResults,
      );
    }

    // Same ELO outcomes
    for (const [strategy, rating1] of result1.elo.ratings) {
      const rating2 = result2.elo.ratings.get(strategy)!;
      expect(rating1.rating).toBeCloseTo(rating2.rating, 10);
    }
  });

  it('allows same strategy in multiple seats', () => {
    const result = runCompetition(
      makeConfig({
        pool: [{ strategy: 'random' }],
        minPlayers: 4,
        maxPlayers: 4,
        games: 5,
      }),
    );

    // Every game should have 4 random players
    for (const game of result.gameResults) {
      expect(game.playerResults.length).toBe(4);
      for (const pr of game.playerResults) {
        expect(pr.strategy).toBe('random');
      }
    }

    // ELO should exist for random
    expect(result.elo.ratings.has('random')).toBe(true);
  });

  it('respects custom ELO K-factor', () => {
    const defaultResult = runCompetition(makeConfig({ games: 10 }));
    const lowKResult = runCompetition(
      makeConfig({ games: 10, eloConfig: { K: 8 } }),
    );

    // Lower K → smaller rating changes. Compare max deviation from initial.
    const maxDevDefault = Math.max(
      ...Array.from(defaultResult.elo.ratings.values()).map((r) =>
        Math.abs(r.rating - 1500),
      ),
    );
    const maxDevLowK = Math.max(
      ...Array.from(lowKResult.elo.ratings.values()).map((r) =>
        Math.abs(r.rating - 1500),
      ),
    );
    expect(maxDevLowK).toBeLessThan(maxDevDefault);
  });

  it('throws on empty pool', () => {
    expect(() =>
      runCompetition(makeConfig({ pool: [] })),
    ).toThrow('pool must contain at least one');
  });

  it('throws on invalid player range', () => {
    expect(() =>
      runCompetition(makeConfig({ minPlayers: 5, maxPlayers: 3 })),
    ).toThrow('Invalid player range');

    expect(() =>
      runCompetition(makeConfig({ minPlayers: 1 })),
    ).toThrow('Invalid player range');

    expect(() =>
      runCompetition(makeConfig({ maxPlayers: 11 })),
    ).toThrow('Invalid player range');
  });

  it('tracks same strategy with different options as separate entries', () => {
    const result = runCompetition({
      pool: [
        { strategy: 'mcs', strategyOptions: { mcPerCard: 10 } },
        { strategy: 'mcs', strategyOptions: { mcPerCard: 50 } },
        { strategy: 'random' },
      ],
      minPlayers: 3,
      maxPlayers: 3,
      games: 5,
      seed: 'dedup-test',
    });

    // Should have 3 distinct entries (not 2)
    const eloKeys = [...result.elo.ratings.keys()];
    expect(eloKeys).toContain('mcs:mcPerCard=10');
    expect(eloKeys).toContain('mcs:mcPerCard=50');
    expect(eloKeys).toContain('random');
    expect(eloKeys.length).toBe(3);

    // perStrategy should also distinguish them
    expect(result.perStrategy.has('mcs:mcPerCard=10')).toBe(true);
    expect(result.perStrategy.has('mcs:mcPerCard=50')).toBe(true);
    expect(result.perStrategy.has('random')).toBe(true);
  });
});
