/**
 * BatchRunner: run N games with the same config, aggregate per-strategy stats.
 */
import { createHash } from 'node:crypto';
import type { SimConfig, BatchResult, GameResult } from './types';
import { runGame } from './runner';
import { aggregateByStrategy } from './stats';

/** Derive a per-game seed from batch seed + game index. */
function deriveGameSeed(batchSeed: string, gameIndex: number): string {
  return createHash('sha256')
    .update(batchSeed + '/' + gameIndex)
    .digest('hex');
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

  const perStrategy = aggregateByStrategy(results);

  return {
    gamesPlayed: games,
    config,
    perStrategy,
    gameResults: results,
  };
}
