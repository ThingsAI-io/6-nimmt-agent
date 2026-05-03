/**
 * Statistical aggregation helpers for batch simulation results.
 */
import type { GameResult, StrategyStats } from './types';

/** Compute strategy statistics from collected scores and win count. */
export function computeStats(
  scores: number[],
  wins: number,
  totalPlayerGames: number,
  winningScores: number[] = [],
): StrategyStats {
  const n = scores.length;
  if (n === 0) {
    return {
      wins: 0,
      winRate: 0,
      avgScore: 0,
      avgWinningScore: null,
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

  const avgWinningScore =
    winningScores.length > 0
      ? winningScores.reduce((acc, v) => acc + v, 0) / winningScores.length
      : null;

  return {
    wins,
    winRate: totalPlayerGames > 0 ? wins / totalPlayerGames : 0,
    avgScore: avg,
    avgWinningScore,
    medianScore,
    minScore: sorted[0],
    maxScore: sorted[n - 1],
    scoreStdDev: Math.sqrt(variance),
  };
}

/**
 * Aggregate per-strategy statistics from a heterogeneous set of game results.
 * Works for both fixed lineups (BatchRunner) and variable lineups (CompetitionRunner).
 * Counts player-games dynamically from actual results rather than a fixed config.
 */
export function aggregateByStrategy(
  results: readonly GameResult[],
): ReadonlyMap<string, StrategyStats> {
  const scoresMap = new Map<string, number[]>();
  const winsMap = new Map<string, number>();
  const winScoresMap = new Map<string, number[]>();
  const playerGamesMap = new Map<string, number>();

  for (const game of results) {
    for (const pr of game.playerResults) {
      if (!scoresMap.has(pr.strategy)) {
        scoresMap.set(pr.strategy, []);
        winsMap.set(pr.strategy, 0);
        winScoresMap.set(pr.strategy, []);
        playerGamesMap.set(pr.strategy, 0);
      }
      scoresMap.get(pr.strategy)!.push(pr.finalScore);
      playerGamesMap.set(pr.strategy, playerGamesMap.get(pr.strategy)! + 1);
      if (pr.rank === 1) {
        winsMap.set(pr.strategy, winsMap.get(pr.strategy)! + 1);
        winScoresMap.get(pr.strategy)!.push(pr.finalScore);
      }
    }
  }

  const perStrategy = new Map<string, StrategyStats>();
  for (const [strategy, scores] of scoresMap) {
    const wins = winsMap.get(strategy)!;
    const totalPlayerGames = playerGamesMap.get(strategy)!;
    perStrategy.set(
      strategy,
      computeStats(scores, wins, totalPlayerGames, winScoresMap.get(strategy)!),
    );
  }

  return perStrategy;
}
