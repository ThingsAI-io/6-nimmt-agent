import { Command } from 'commander';

export const recommendCommand = new Command('recommend')
  .description('Get AI move recommendation for a given game state')
  .option('--state <json>', 'Game state as inline JSON')
  .option('--state-file <path>', 'Path to game state JSON file')
  .requiredOption('-s, --strategy <strategy>', 'Strategy to use for recommendation')
  .option('-d, --decision <type>', 'Decision type (card or row)')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '10000')
  .option('-f, --format <format>', 'Output format (json, table)', 'json')
  .action((_opts) => {
    console.log('recommend: not implemented yet');
  });
