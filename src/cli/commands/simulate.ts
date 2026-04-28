import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { runBatch } from '../../sim/index.js';
import { strategies } from '../../engine/index.js';
import { format } from '../formatters/index.js';
import type { SimulateResult, StrategyResultRow, SeatResultRow, OutputFormat } from '../formatters/types.js';
import { didYouMean, outputError, createMeta, parseStrategies } from '../helpers.js';
import { computeStats } from '../../sim/stats.js';
import type { GameResult } from '../../sim/types.js';

function buildResultRows(
  result: import('../../sim/types.js').BatchResult,
  config: import('../../sim/types.js').SimConfig,
): StrategyResultRow[] {
  const rows: StrategyResultRow[] = [];
  for (const [strategy, stats] of result.perStrategy) {
    const seatIndices: number[] = [];
    const playerIds: string[] = [];
    config.players.forEach((p, i) => {
      if (p.strategy === strategy) {
        seatIndices.push(i);
        playerIds.push(p.id);
      }
    });
    rows.push({
      strategy,
      seatIndices,
      playerIds,
      playerCount: seatIndices.length,
      wins: stats.wins,
      winRate: stats.winRate,
      avgScore: stats.avgScore,
      medianScore: stats.medianScore,
      minScore: stats.minScore,
      maxScore: stats.maxScore,
      scoreStdDev: stats.scoreStdDev,
    });
  }
  return rows;
}

function buildSeatRows(
  result: import('../../sim/types.js').BatchResult,
  config: import('../../sim/types.js').SimConfig,
): SeatResultRow[] {
  const rows: SeatResultRow[] = [];
  const numPlayers = config.players.length;

  for (let seat = 0; seat < numPlayers; seat++) {
    const player = config.players[seat];
    const scores: number[] = [];
    let wins = 0;

    for (const game of result.gameResults) {
      // playerResults is sorted by score, find this player by id
      const pr = game.playerResults.find((p) => p.id === player.id)!;
      scores.push(pr.finalScore);
      if (pr.rank === 1) wins++;
    }

    const stats = computeStats(scores, wins, result.gamesPlayed);
    rows.push({
      seatIndex: seat,
      playerId: player.id,
      strategy: player.strategy,
      wins: stats.wins,
      winRate: stats.winRate,
      avgScore: stats.avgScore,
      medianScore: stats.medianScore,
      minScore: stats.minScore,
      maxScore: stats.maxScore,
      scoreStdDev: stats.scoreStdDev,
    });
  }

  return rows;
}

export const simulateCommand = new Command('simulate')
  .description('Run batch simulations across strategies')
  .requiredOption('-s, --strategies <strategies>', 'Comma-separated strategy names or JSON array')
  .option('-n, --games <count>', 'Number of games to simulate', '100')
  .option('-S, --seed <seed>', 'Random seed for reproducibility')
  .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--dry-run', 'Validate options without running')
  .action((opts) => {
    const fmt = opts.format as OutputFormat;
    const startTime = Date.now();

    // Parse strategies
    let strategyNames: string[];
    const raw = opts.strategies as string;
    try {
      strategyNames = parseStrategies(raw);
    } catch {
      outputError(fmt, 'INVALID_STRATEGY', `Failed to parse strategies: ${raw}`);
      process.exit(1);
    }

    // Validate strategies exist
    for (const name of strategyNames) {
      if (!strategies.has(name)) {
        const valid = [...strategies.keys()];
        const suggestion = didYouMean(name, valid);
        outputError(
          fmt,
          'INVALID_STRATEGY',
          `Unknown strategy '${name}'.${suggestion ? ` Did you mean '${suggestion}'?` : ''}`,
          valid,
        );
        process.exit(1);
      }
    }

    // Validate player count
    if (strategyNames.length < 2 || strategyNames.length > 10) {
      outputError(fmt, 'INVALID_PLAYER_COUNT', `Need 2–10 strategies, got ${strategyNames.length}.`, [
        'Provide 2 to 10 comma-separated strategy names',
      ]);
      process.exit(1);
    }

    // Validate format
    if (!['table', 'json', 'csv'].includes(fmt)) {
      outputError(fmt, 'INVALID_FORMAT', `Unknown format '${fmt}'.`, ['table', 'json', 'csv']);
      process.exit(1);
    }

    const games = parseInt(opts.games, 10);
    const seed = opts.seed ?? randomUUID();

    // Dry run
    if (opts.dryRun) {
      console.log(JSON.stringify({ dryRun: true, strategies: strategyNames, games, seed, format: fmt }));
      return;
    }

    // Build SimConfig
    const config = {
      players: strategyNames.map((s, i) => ({ id: `player-${i}`, strategy: s })),
      seed,
    };

    // Run batch
    try {
      const result = runBatch(config, games, seed);

      const output: SimulateResult = {
        meta: createMeta('simulate', startTime),
        gamesPlayed: result.gamesPlayed,
        strategies: strategyNames,
        seed,
        results: buildResultRows(result, config),
        perSeat: buildSeatRows(result, config),
      };

      console.log(format(output, fmt));
    } catch (err) {
      outputError(fmt, 'ENGINE_ERROR', `Engine error: ${(err as Error).message}`);
      process.exit(2);
    }
  });
