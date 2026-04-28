import { Command } from 'commander';
import { strategies } from '../../engine/index.js';
import { format } from '../formatters/index.js';
import type { StrategiesResult, OutputFormat } from '../formatters/types.js';
import { createMeta } from '../helpers.js';

const strategyDescriptions: Record<string, string> = {
  random: 'Picks a card uniformly at random. Baseline strategy.',
};

export const strategiesCommand = new Command('strategies')
  .description('List available strategies')
  .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
  .action((opts) => {
    const fmt = opts.format as OutputFormat;
    const startTime = Date.now();

    const stratList = [...strategies.keys()].map((name) => ({
      name,
      description: strategyDescriptions[name] ?? 'No description available.',
    }));

    const output: StrategiesResult = {
      meta: createMeta('strategies', startTime),
      strategies: stratList,
      usage: {
        simulateExample: `6nimmt simulate --strategies ${[...strategies.keys()].join(',')} --games 100`,
        playerCountRange: { min: 2, max: 10 },
        strategyNamesCaseSensitive: true,
      },
    };

    console.log(format(output, fmt));
  });
