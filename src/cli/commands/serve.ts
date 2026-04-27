import { Command } from 'commander';

export const serveCommand = new Command('serve')
  .description('Start the MCP server for AI-assisted play')
  .option('-l, --log-level <level>', 'Log level (debug, info, warn, error)', 'warn')
  .option('--max-sessions <count>', 'Maximum concurrent sessions', '4')
  .action((_opts) => {
    console.log('serve: not implemented yet');
  });
