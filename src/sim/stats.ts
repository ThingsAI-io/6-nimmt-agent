/**
 * Statistical aggregation helpers for batch simulation results.
 */
import type { StrategyStats } from './types';

/** Compute strategy statistics from collected scores and win count. */
export function computeStats(
  scores: number[],
  wins: number,
  totalPlayerGames: number,
): StrategyStats {
  const n = scores.length;
  if (n === 0) {
    return {
      wins: 0,
      winRate: 0,
      avgScore: 0,
      medianScore: 0,
      minScore: 0,
      maxScore: 0,
      scoreStdDev: 0,
    };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const sum = scores.reduce((acc, v) => acc + v, 0);
  const avg = sum / n;

  const medianScore =
    n % 2 === 1
      ? sorted[Math.floor(n / 2)]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const variance = scores.reduce((acc, v) => acc + (v - avg) ** 2, 0) / n;

  return {
    wins,
    winRate: totalPlayerGames > 0 ? wins / totalPlayerGames : 0,
    avgScore: avg,
    medianScore,
    minScore: sorted[0],
    maxScore: sorted[n - 1],
    scoreStdDev: Math.sqrt(variance),
  };
}
