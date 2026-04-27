import { Command } from 'commander';

export const playCommand = new Command('play')
  .description('Play a single game with full round-by-round output')
  .requiredOption('-s, --strategies <strategies>', 'Comma-separated list of strategy names')
  .option('-S, --seed <seed>', 'Random seed for reproducibility')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action((_opts) => {
    console.log('play: not implemented yet');
  });
