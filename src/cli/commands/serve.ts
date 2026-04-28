import { Command } from 'commander';

export const serveCommand = new Command('serve')
  .description('Start MCP advisory server on stdio')
  .option('-l, --log-level <level>', 'Log level (debug, info, warn, error)', 'warn')
  .option('--max-sessions <count>', 'Max concurrent sessions', '4')
  .action(async (opts) => {
    const { startServer } = await import('../../mcp/server.js');
    await startServer({
      logLevel: opts.logLevel as string,
      maxSessions: parseInt(opts.maxSessions as string, 10),
    });
  });
