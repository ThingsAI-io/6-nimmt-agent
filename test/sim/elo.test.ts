import { describe, it, expect } from 'vitest';
import {
  computeExpectedScore,
  computeActualScore,
  rankFromScores,
  createEloSnapshot,
  updateRatings,
  DEFAULT_ELO_CONFIG,
} from '../../src/sim/elo';
import type { EloGameInput } from '../../src/sim/types';

describe('ELO module', () => {
  describe('rankFromScores', () => {
    it('ranks distinct scores in ascending order (lowest penalty = rank 1)', () => {
      expect(rankFromScores([20, 5, 10])).toEqual([3, 1, 2]);
    });

    it('handles ties with fractional ranks', () => {
      // scores: [5, 10, 10, 20] → ranks: [1, 2.5, 2.5, 4]
      expect(rankFromScores([5, 10, 10, 20])).toEqual([1, 2.5, 2.5, 4]);
    });

    it('handles all-tied scores', () => {
      expect(rankFromScores([7, 7, 7])).toEqual([2, 2, 2]);
    });

    it('handles two players', () => {
      expect(rankFromScores([15, 8])).toEqual([2, 1]);
    });

    it('handles single player', () => {
      expect(rankFromScores([42])).toEqual([1]);
    });
  });

  describe('computeExpectedScore', () => {
    it('returns 0.5 for equal ratings (1 opponent)', () => {
      const result = computeExpectedScore(1500, [1500]);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('returns higher expected score against weaker opponents', () => {
      const result = computeExpectedScore(1700, [1500]);
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(1);
    });

    it('sums pairwise expectations for multiple opponents', () => {
      const result = computeExpectedScore(1500, [1500, 1500, 1500]);
      expect(result).toBeCloseTo(1.5, 5); // 0.5 × 3
    });

    it('200-point advantage gives ~0.76 expected score', () => {
      const result = computeExpectedScore(1700, [1500]);
      expect(result).toBeCloseTo(0.7597, 3);
    });
  });

  describe('computeActualScore', () => {
    it('1st place gets N-1 (beat everyone)', () => {
      const ranks = [1, 2, 3, 4];
      expect(computeActualScore(1, ranks, 0)).toBe(3);
    });

    it('last place gets 0 (lost to everyone)', () => {
      const ranks = [1, 2, 3, 4];
      expect(computeActualScore(4, ranks, 3)).toBe(0);
    });

    it('tied players get 0.5 against each other', () => {
      const ranks = [1, 2.5, 2.5, 4];
      // Player at rank 2.5 (index 1): beats rank 4 (1), ties rank 2.5 (0.5), loses to rank 1 (0)
      expect(computeActualScore(2.5, ranks, 1)).toBe(1.5);
    });

    it('all tied → 0.5 per opponent', () => {
      const ranks = [2, 2, 2];
      expect(computeActualScore(2, ranks, 0)).toBe(1); // 0.5 + 0.5
    });
  });

  describe('createEloSnapshot', () => {
    it('creates snapshot with default config', () => {
      const snap = createEloSnapshot();
      expect(snap.totalGames).toBe(0);
      expect(snap.ratings.size).toBe(0);
      expect(snap.config).toEqual(DEFAULT_ELO_CONFIG);
    });

    it('accepts partial config overrides', () => {
      const snap = createEloSnapshot({ K: 16, initialRating: 1600 });
      expect(snap.config.K).toBe(16);
      expect(snap.config.initialRating).toBe(1600);
      expect(snap.config.D).toBe(400); // default preserved
    });
  });

  describe('updateRatings', () => {
    it('initializes ratings for new strategies on first game', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [
          { strategy: 'mcs', penaltyScore: 5 },
          { strategy: 'random', penaltyScore: 15 },
        ],
      };

      const updated = updateRatings(snap, game);
      expect(updated.totalGames).toBe(1);
      expect(updated.ratings.size).toBe(2);
      expect(updated.ratings.get('mcs')!.gamesPlayed).toBe(1);
      expect(updated.ratings.get('random')!.gamesPlayed).toBe(1);
    });

    it('winner gains rating, loser loses rating', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [
          { strategy: 'mcs', penaltyScore: 5 },    // winner (lower penalty)
          { strategy: 'random', penaltyScore: 15 },  // loser
        ],
      };

      const updated = updateRatings(snap, game);
      expect(updated.ratings.get('mcs')!.rating).toBeGreaterThan(1500);
      expect(updated.ratings.get('random')!.rating).toBeLessThan(1500);
    });

    it('equal-rated players in 2-player: winner gets +K/2, loser gets -K/2', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [
          { strategy: 'a', penaltyScore: 5 },
          { strategy: 'b', penaltyScore: 15 },
        ],
      };

      const updated = updateRatings(snap, game);
      // Expected = 0.5, Actual for winner = 1.0
      // Delta = K × (1.0 - 0.5) / (2-1) = 32 × 0.5 = 16
      expect(updated.ratings.get('a')!.rating).toBeCloseTo(1516, 0);
      expect(updated.ratings.get('b')!.rating).toBeCloseTo(1484, 0);
    });

    it('tied game with equal ratings produces no rating change', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [
          { strategy: 'a', penaltyScore: 10 },
          { strategy: 'b', penaltyScore: 10 },
        ],
      };

      const updated = updateRatings(snap, game);
      expect(updated.ratings.get('a')!.rating).toBeCloseTo(1500, 5);
      expect(updated.ratings.get('b')!.rating).toBeCloseTo(1500, 5);
    });

    it('handles multi-player games (5 players)', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [
          { strategy: 'a', penaltyScore: 5 },
          { strategy: 'b', penaltyScore: 10 },
          { strategy: 'c', penaltyScore: 15 },
          { strategy: 'd', penaltyScore: 20 },
          { strategy: 'e', penaltyScore: 25 },
        ],
      };

      const updated = updateRatings(snap, game);

      // Winner should gain most, loser should lose most
      const ratingA = updated.ratings.get('a')!.rating;
      const ratingE = updated.ratings.get('e')!.rating;
      expect(ratingA).toBeGreaterThan(1500);
      expect(ratingE).toBeLessThan(1500);

      // Ratings should be monotonically decreasing with rank
      const ratings = ['a', 'b', 'c', 'd', 'e'].map(
        (s) => updated.ratings.get(s)!.rating,
      );
      for (let i = 0; i < ratings.length - 1; i++) {
        expect(ratings[i]).toBeGreaterThan(ratings[i + 1]);
      }
    });

    it('accumulates history across multiple games', () => {
      let snap = createEloSnapshot();

      for (let i = 0; i < 5; i++) {
        snap = updateRatings(snap, {
          players: [
            { strategy: 'a', penaltyScore: 5 },
            { strategy: 'b', penaltyScore: 15 },
          ],
        });
      }

      expect(snap.totalGames).toBe(5);
      expect(snap.ratings.get('a')!.gamesPlayed).toBe(5);
      expect(snap.ratings.get('a')!.history.length).toBe(5);
      // a should keep gaining (always wins)
      const hist = snap.ratings.get('a')!.history;
      for (let i = 1; i < hist.length; i++) {
        expect(hist[i]).toBeGreaterThan(hist[i - 1]);
      }
    });

    it('averages deltas when same strategy occupies multiple seats', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [
          { strategy: 'mcs', penaltyScore: 5 },
          { strategy: 'random', penaltyScore: 10 },
          { strategy: 'random', penaltyScore: 20 },
        ],
      };

      const updated = updateRatings(snap, game);
      // random has 2 seats: one at rank 2, one at rank 3
      // Deltas are averaged, so the rating change should be moderate
      expect(updated.ratings.get('random')!.gamesPlayed).toBe(1);
      expect(updated.ratings.get('random')!.rating).toBeLessThan(1500);
    });

    it('rating changes are zero-sum across all seats', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [
          { strategy: 'a', penaltyScore: 3 },
          { strategy: 'b', penaltyScore: 7 },
          { strategy: 'c', penaltyScore: 12 },
          { strategy: 'd', penaltyScore: 18 },
        ],
      };

      const updated = updateRatings(snap, game);
      // Each strategy has 1 seat, so the sum of rating changes should be ~0
      const totalChange = ['a', 'b', 'c', 'd']
        .map((s) => updated.ratings.get(s)!.rating - 1500)
        .reduce((sum, d) => sum + d, 0);
      expect(totalChange).toBeCloseTo(0, 5);
    });

    it('ignores games with fewer than 2 players', () => {
      const snap = createEloSnapshot();
      const game: EloGameInput = {
        players: [{ strategy: 'a', penaltyScore: 5 }],
      };
      const updated = updateRatings(snap, game);
      expect(updated.totalGames).toBe(0);
      expect(updated.ratings.size).toBe(0);
    });
  });
});
