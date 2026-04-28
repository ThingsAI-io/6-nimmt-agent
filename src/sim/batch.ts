/**
 * BatchRunner: run N games with the same config, aggregate per-strategy stats.
 */
import { createHash } from 'node:crypto';
import type { SimConfig, BatchResult, GameResult } from './types';
import { runGame } from './runner';
import { computeStats } from './stats';

/** Derive a per-game seed from batch seed + game index. */
function deriveGameSeed(batchSeed: string, gameIndex: number): string {
  return createHash('sha256')
    .update(batchSeed + '/' + gameIndex)
    .digest('hex');
}

/** Pool game results per strategy and compute aggregate statistics. */
function aggregateResults(
  results: GameResult[],
  config: SimConfig,
): ReadonlyMap<string, import('./types').StrategyStats> {
  // Count how many players use each strategy
  const playersPerStrategy = new Map<string, number>();
  for (const p of config.players) {
    playersPerStrategy.set(
      p.strategy,
      (playersPerStrategy.get(p.strategy) ?? 0) + 1,
    );
  }

  // Collect scores and wins per strategy across all games
  const scoresMap = new Map<string, number[]>();
  const winsMap = new Map<string, number>();
  const winScoresMap = new Map<string, number[]>();

  for (const strat of playersPerStrategy.keys()) {
    scoresMap.set(strat, []);
    winsMap.set(strat, 0);
    winScoresMap.set(strat, []);
  }

  for (const game of results) {
    for (const pr of game.playerResults) {
      scoresMap.get(pr.strategy)!.push(pr.finalScore);
      if (pr.rank === 1) {
        winsMap.set(pr.strategy, winsMap.get(pr.strategy)! + 1);
        winScoresMap.get(pr.strategy)!.push(pr.finalScore);
      }
    }
  }

  // Compute stats per strategy
  const perStrategy = new Map<string, import('./types').StrategyStats>();
  for (const [strategy, scores] of scoresMap) {
    const wins = winsMap.get(strategy)!;
    const totalPlayerGames =
      results.length * playersPerStrategy.get(strategy)!;
    perStrategy.set(strategy, computeStats(scores, wins, totalPlayerGames, winScoresMap.get(strategy)!));
  }

  return perStrategy;
}

/** Run N games with the same player/strategy config, collect results. */
export function runBatch(
  config: SimConfig,
  games: number,
  batchSeed: string,
): BatchResult {
  const results: GameResult[] = [];

  for (let i = 0; i < games; i++) {
    const gameSeed = deriveGameSeed(batchSeed, i);
    const gameConfig: SimConfig = { ...config, seed: gameSeed };
    results.push(runGame(gameConfig));
  }

  const perStrategy = aggregateResults(results, config);

  return {
    gamesPlayed: games,
    config,
    perStrategy,
    gameResults: results,
  };
}
