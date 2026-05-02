import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { runCompetition } from '../../sim/competition.js';
import { strategies, parseStrategySpec, strategyKey } from '../../engine/index.js';
import { format } from '../formatters/index.js';
import type {
  CompeteResult,
  StrategyResultRow,
  EloLeaderboardRow,
  OutputFormat,
} from '../formatters/types.js';
import { didYouMean, outputError, createMeta, parseStrategies } from '../helpers.js';

function buildResultRows(
  perStrategy: ReadonlyMap<string, import('../../sim/types.js').StrategyStats>,
): StrategyResultRow[] {
  const rows: StrategyResultRow[] = [];
  for (const [strategy, stats] of perStrategy) {
    rows.push({
      strategy,
      seatIndices: [],
      playerIds: [],
      playerCount: 0,
      wins: stats.wins,
      winRate: stats.winRate,
      avgScore: stats.avgScore,
      avgWinningScore: stats.avgWinningScore,
      medianScore: stats.medianScore,
      minScore: stats.minScore,
      maxScore: stats.maxScore,
      scoreStdDev: stats.scoreStdDev,
    });
  }
  return rows;
}

function buildEloRows(
  elo: import('../../sim/types.js').EloSnapshot,
): EloLeaderboardRow[] {
  const rows: EloLeaderboardRow[] = [];
  for (const [, rating] of elo.ratings) {
    // Compute std dev of last N ratings for uncertainty estimate
    const hist = rating.history;
    const window = hist.slice(-Math.min(100, hist.length));
    let stdDev = 0;
    if (window.length > 1) {
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const variance =
        window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
      stdDev = Math.sqrt(variance);
    }

    rows.push({
      strategy: rating.strategy,
      rating: rating.rating,
      gamesPlayed: rating.gamesPlayed,
      ratingStdDev: stdDev,
    });
  }
  return rows;
}

export const competeCommand = new Command('compete')
  .description('Run a tournament-style competition with ELO ratings')
  .requiredOption(
    '-p, --pool <strategies>',
    'Comma-separated strategy pool (e.g., mcs-prior,mcs,random)',
  )
  .option('-n, --games <count>', 'Number of games to play', '500')
  .option('--min-players <n>', 'Minimum players per game', '3')
  .option('--max-players <n>', 'Maximum players per game', '6')
  .option('--elo-k <K>', 'ELO K-factor', '32')
  .option('-S, --seed <seed>', 'Random seed for reproducibility')
  .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--dry-run', 'Validate options without running')
  .action((opts) => {
    const fmt = opts.format as OutputFormat;
    const startTime = Date.now();

    // Parse pool strategies
    let poolSpecs: { name: string; options?: Record<string, unknown> }[];
    const rawPool = opts.pool as string;
    try {
      const names = parseStrategies(rawPool);
      poolSpecs = names.map(parseStrategySpec);
    } catch {
      outputError(fmt, 'INVALID_STRATEGY', `Failed to parse pool: ${rawPool}`);
      process.exit(1);
    }

    // Validate strategies exist
    for (const spec of poolSpecs) {
      if (!strategies.has(spec.name)) {
        const valid = [...strategies.keys()];
        const suggestion = didYouMean(spec.name, valid);
        outputError(
          fmt,
          'INVALID_STRATEGY',
          `Unknown strategy '${spec.name}'.${suggestion ? ` Did you mean '${suggestion}'?` : ''}`,
          valid,
        );
        process.exit(1);
      }
    }

    if (poolSpecs.length === 0) {
      outputError(fmt, 'INVALID_POOL', 'Pool must contain at least one strategy.');
      process.exit(1);
    }

    const games = parseInt(opts.games, 10);
    const minPlayers = parseInt(opts.minPlayers, 10);
    const maxPlayers = parseInt(opts.maxPlayers, 10);
    const eloK = parseFloat(opts.eloK);
    const seed = opts.seed ?? randomUUID();

    // Validate player range
    if (minPlayers < 2 || maxPlayers > 10 || minPlayers > maxPlayers) {
      outputError(
        fmt,
        'INVALID_PLAYER_RANGE',
        `Player range [${minPlayers}, ${maxPlayers}] invalid. Must be 2–10 with min ≤ max.`,
      );
      process.exit(1);
    }

    // Validate format
    if (!['table', 'json', 'csv'].includes(fmt)) {
      outputError(fmt, 'INVALID_FORMAT', `Unknown format '${fmt}'.`, ['table', 'json', 'csv']);
      process.exit(1);
    }

    // Dry run
    if (opts.dryRun) {
      console.log(
        JSON.stringify({
          dryRun: true,
          pool: poolSpecs.map((s) => s.name),
          games,
          minPlayers,
          maxPlayers,
          eloK,
          seed,
          format: fmt,
        }),
      );
      return;
    }

    if (opts.verbose) {
      const poolKeys = poolSpecs.map((s) => strategyKey(s.name, s.options));
      console.error(
        `Competition: ${games} games, pool=[${poolKeys.join(',')}], players=${minPlayers}–${maxPlayers}, K=${eloK}, seed=${seed}`,
      );
    }

    // Run competition
    try {
      const result = runCompetition({
        pool: poolSpecs.map((s) => ({
          strategy: s.name,
          ...(s.options ? { strategyOptions: s.options } : {}),
        })),
        minPlayers,
        maxPlayers,
        games,
        seed,
        eloConfig: { K: eloK },
        onProgress: opts.verbose
          ? (completed: number, total: number) => {
              if (completed % 50 === 0 || completed === total) {
                const pct = ((completed / total) * 100).toFixed(0);
                process.stderr.write(`\r  Progress: ${completed}/${total} games (${pct}%)`);
                if (completed === total) process.stderr.write('\n');
              }
            }
          : undefined,
      });

      const poolKeys = poolSpecs.map((s) => strategyKey(s.name, s.options));
      const output: CompeteResult = {
        meta: createMeta('compete', startTime),
        gamesPlayed: result.gamesPlayed,
        pool: poolKeys,
        playerRange: { min: minPlayers, max: maxPlayers },
        seed,
        eloConfig: {
          initialRating: 1500,
          K: eloK,
          D: 400,
          normalization: '÷(N−1)',
        },
        results: buildResultRows(result.perStrategy),
        elo: buildEloRows(result.elo),
      };

      console.log(format(output, fmt));
    } catch (err) {
      outputError(fmt, 'ENGINE_ERROR', `Engine error: ${(err as Error).message}`);
      process.exit(2);
    }
  });
