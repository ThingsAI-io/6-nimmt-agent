/**
 * CompetitionRunner: tournament-style benchmark where each game draws a random
 * player count and random strategies from a pool. Accumulates ELO ratings and
 * per-strategy statistics across all games.
 */
import { createHash } from 'node:crypto';
import type {
  CompetitionConfig,
  CompetitionResult,
  SimConfig,
  GameResult,
} from './types';
import { runGame } from './runner';
import { aggregateByStrategy } from './stats';
import { createEloSnapshot, updateRatings } from './elo';
import { deriveSeedState, xoshiro256ss } from '../engine';

/** Derive a per-game seed from competition seed + game index. */
function deriveGameSeed(baseSeed: string, gameIndex: number): string {
  return createHash('sha256')
    .update(baseSeed + '/competition/' + gameIndex)
    .digest('hex');
}

/**
 * Create a seeded PRNG that returns integers in [0, max) from the competition seed.
 * Uses the engine's xoshiro256** for deterministic, reproducible draws.
 */
function createCompetitionRng(seed: string): (max: number) => number {
  const state = deriveSeedState(seed + '/competition-rng');
  return (max: number): number => {
    const raw = Number(xoshiro256ss(state) >> 11n);
    return Math.floor((raw / 2 ** 53) * max);
  };
}

/**
 * Run a competition tournament: each game draws a random player count and
 * random strategies from the pool.
 */
export function runCompetition(config: CompetitionConfig): CompetitionResult {
  const { pool, minPlayers, maxPlayers, games, seed } = config;

  if (pool.length === 0) {
    throw new Error('Competition pool must contain at least one strategy.');
  }
  if (minPlayers < 2 || maxPlayers > 10 || minPlayers > maxPlayers) {
    throw new Error(
      `Invalid player range: [${minPlayers}, ${maxPlayers}]. Must be 2–10 with min ≤ max.`,
    );
  }

  const rng = createCompetitionRng(seed);
  let eloSnapshot = createEloSnapshot(config.eloConfig);
  const allResults: GameResult[] = [];

  for (let i = 0; i < games; i++) {
    // Random player count in [minPlayers, maxPlayers]
    const playerCount =
      minPlayers + rng(maxPlayers - minPlayers + 1);

    // Draw strategies from pool with replacement
    const gamePlayers: SimConfig['players'] extends readonly (infer T)[]
      ? T[]
      : never = [];

    for (let seat = 0; seat < playerCount; seat++) {
      const poolEntry = pool[rng(pool.length)];
      gamePlayers.push({
        id: `p${seat}`,
        strategy: poolEntry.strategy,
        ...(poolEntry.strategyOptions
          ? { strategyOptions: poolEntry.strategyOptions }
          : {}),
      });
    }

    const gameSeed = deriveGameSeed(seed, i);
    const gameConfig: SimConfig = {
      players: gamePlayers,
      seed: gameSeed,
    };

    const result = runGame(gameConfig);
    allResults.push(result);

    // Feed into ELO
    eloSnapshot = updateRatings(eloSnapshot, {
      players: result.playerResults.map((pr) => ({
        strategy: pr.strategy,
        penaltyScore: pr.finalScore,
      })),
    });
  }

  const perStrategy = aggregateByStrategy(allResults);

  return {
    gamesPlayed: games,
    config,
    perStrategy,
    elo: eloSnapshot,
    gameResults: allResults,
  };
}
