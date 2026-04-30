/**
 * Headless 6 Nimmt! player for Board Game Arena.
 *
 * Usage:
 *   npx tsx src/player/play.ts --table <table-id> --strategy mcs
 *   npx tsx src/player/play.ts --table 843761580 --strategy mcs:mcMax=500 --delay 2000 --verbose
 */
import { chromium } from 'playwright';
import { strategies, parseStrategySpec } from '../engine/strategies/index.js';
import { getCredentials, login, saveSession } from './bga-auth.js';
import { playGame } from './loop.js';

// ── Argument parsing ───────────────────────────────────────────────────

interface Args {
  table: string;
  strategy: string;
  delay: number;
  verbose: boolean;
  headless: boolean;
  sessionFile: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const opts: Args = {
    table: '',
    strategy: 'mcs',
    delay: 2000,
    verbose: false,
    headless: true,
    sessionFile: '.bga-session.json',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--table': case '-t':
        opts.table = args[++i]; break;
      case '--strategy': case '-s':
        opts.strategy = args[++i]; break;
      case '--delay': case '-d':
        opts.delay = parseInt(args[++i]) || 2000; break;
      case '--verbose': case '-v':
        opts.verbose = true; break;
      case '--no-headless':
        opts.headless = false; break;
      case '--session':
        opts.sessionFile = args[++i]; break;
      case '--help': case '-h':
        printUsage(); process.exit(0);
    }
  }

  if (!opts.table) {
    console.error('Error: --table <table-id> is required');
    printUsage();
    process.exit(1);
  }

  return opts;
}

function printUsage(): void {
  console.log(`
6 Nimmt! Headless Player for Board Game Arena

Usage:
  npx tsx src/player/play.ts --table <table-id> [options]

Options:
  --table, -t       BGA table ID (required)
  --strategy, -s    Strategy to use (default: mcs)
                    Format: name or name:key=val,key=val
                    Available: ${[...strategies.keys()].join(', ')}
  --delay, -d       Ms delay before each play (default: 2000)
  --verbose, -v     Enable structured logging
  --no-headless     Show browser window
  --session         Session file path (default: .bga-session.json)
  --help, -h        Show this help

Environment:
  BGA_USERNAME      Board Game Arena username
  BGA_PASSWORD      Board Game Arena password

Examples:
  npx tsx src/player/play.ts --table 843761580 --strategy mcs -v
  npx tsx src/player/play.ts -t 843761580 -s bayesian-simple --no-headless
  npx tsx src/player/play.ts -t 843761580 -s mcs:mcMax=1000 -d 3000 -v
`);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  // Parse strategy
  const { name, options } = parseStrategySpec(args.strategy);
  const factory = strategies.get(name);
  if (!factory) {
    console.error(`Unknown strategy: "${name}". Available: ${[...strategies.keys()].join(', ')}`);
    process.exit(1);
  }
  const strategy = factory(options);

  if (args.verbose) {
    console.log(JSON.stringify({
      event: 'init',
      table: args.table,
      strategy: name,
      options: options ?? {},
      delay: args.delay,
      headless: args.headless,
      timestamp: new Date().toISOString(),
    }));
  }

  // Launch browser
  const browser = await chromium.launch({ headless: args.headless });
  let context;
  
  try {
    // Try reusing saved session
    try {
      context = await browser.newContext({ storageState: args.sessionFile });
    } catch {
      context = await browser.newContext();
    }
    
    const page = await context.newPage();

    // Navigate to table
    const tableUrl = `https://boardgamearena.com/table?table=${args.table}`;
    await page.goto(tableUrl, { waitUntil: 'domcontentloaded' });

    // Check if we need to log in
    if (page.url().includes('/account') || page.url().includes('/login')) {
      const creds = getCredentials();
      await login(page, creds);
      await saveSession(context, args.sessionFile);
      // Navigate to table again after login
      await page.goto(tableUrl, { waitUntil: 'domcontentloaded' });
    }

    // Wait for game to be ready
    await page.waitForSelector('#game_play_area', { timeout: 30_000 });
    await page.waitForTimeout(3000); // Let animations settle

    if (args.verbose) {
      console.log(JSON.stringify({
        event: 'gameReady',
        url: page.url(),
        timestamp: new Date().toISOString(),
      }));
    }

    // Play the game!
    const result = await playGame(page, {
      strategy,
      delay: args.delay,
      verbose: args.verbose,
    });

    // Report final result
    console.log(JSON.stringify({
      event: 'gameComplete',
      ...result,
      timestamp: new Date().toISOString(),
    }));

    // Save session for next time
    await saveSession(context, args.sessionFile);

  } catch (err) {
    console.error(JSON.stringify({
      event: 'error',
      message: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
