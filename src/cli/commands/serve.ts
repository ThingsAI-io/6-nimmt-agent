import { Command } from 'commander';

export const serveCommand = new Command('serve')
  .description('Start MCP advisory server on stdio')
  .option('-l, --log-level <level>', 'Log level (debug, info, warn, error)', 'warn')
  .option('--max-sessions <count>', 'Max concurrent sessions', '4')
  .action((opts) => {
    console.error(`MCP server starting (log-level: ${opts.logLevel}, max-sessions: ${opts.maxSessions})...`);
    console.error('MCP server module not yet implemented. Will be added in Phase 5b.');
    process.exit(2);
  });
