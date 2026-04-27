import { Command } from 'commander';

export const strategiesCommand = new Command('strategies')
  .description('List available strategies')
  .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
  .action((_opts) => {
    console.log('strategies: not implemented yet');
  });
