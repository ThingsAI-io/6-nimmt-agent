import { describe, it, expect } from 'vitest';
import { runGame } from '../../src/sim';

describe('GameRunner smoke', () => {
  it('completes a 3-player random game deterministically', () => {
    const result = runGame({
      players: [
        { id: 'p1', strategy: 'random' },
        { id: 'p2', strategy: 'random' },
        { id: 'p3', strategy: 'random' },
      ],
      seed: 'smoke-test-42',
    });

    expect(result.seed).toBe('smoke-test-42');
    expect(result.rounds).toBeGreaterThanOrEqual(1);
    expect(result.playerResults).toHaveLength(3);

    for (const pr of result.playerResults) {
      expect(pr.rank).toBeGreaterThanOrEqual(1);
      expect(pr.finalScore).toBeGreaterThanOrEqual(0);
      expect(pr.strategy).toBe('random');
    }

    expect(result.playerResults.some((pr) => pr.rank === 1)).toBe(true);

    const maxScore = Math.max(...result.playerResults.map((pr) => pr.finalScore));
    expect(maxScore).toBeGreaterThanOrEqual(66);
  });

  it('is deterministic with same seed', () => {
    const a = runGame({
      players: [
        { id: 'p1', strategy: 'random' },
        { id: 'p2', strategy: 'random' },
      ],
      seed: 'determinism-check',
    });
    const b = runGame({
      players: [
        { id: 'p1', strategy: 'random' },
        { id: 'p2', strategy: 'random' },
      ],
      seed: 'determinism-check',
    });

    expect(a).toEqual(b);
  });

  it('generates a seed when none provided', () => {
    const result = runGame({
      players: [
        { id: 'p1', strategy: 'random' },
        { id: 'p2', strategy: 'random' },
      ],
    });

    expect(result.seed).toBeTruthy();
    expect(result.rounds).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid player count', () => {
    expect(() =>
      runGame({ players: [{ id: 'p1', strategy: 'random' }], seed: 's' }),
    ).toThrow(/player count/i);
  });

  it('rejects unknown strategy', () => {
    expect(() =>
      runGame({
        players: [
          { id: 'p1', strategy: 'nonexistent' },
          { id: 'p2', strategy: 'random' },
        ],
        seed: 's',
      }),
    ).toThrow(/unknown strategy/i);
  });
});
