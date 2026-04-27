import { Command } from 'commander';

export const simulateCommand = new Command('simulate')
  .description('Run batch simulations across strategies')
  .requiredOption('-s, --strategies <strategies>', 'Comma-separated list of strategy names')
  .option('-n, --games <count>', 'Number of games to simulate', '100')
  .option('-S, --seed <seed>', 'Random seed for reproducibility')
  .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--dry-run', 'Validate options without running')
  .action((_opts) => {
    console.log('simulate: not implemented yet');
  });
