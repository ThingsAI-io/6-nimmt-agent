/**
 * Headless 6 Nimmt! player for Board Game Arena.
 *
 * Modes:
 *   1. Connect to your existing browser (default — you login, pick table, then run this):
 *      npm run play -- --connect --strategy mcs -v
 *
 *   2. Attach to a specific table (launches browser, handles login):
 *      npm run play -- --table 843761580 --strategy mcs -v
 */
import { chromium } from 'playwright';
import type { Page, Browser } from 'playwright';
import { strategies, parseStrategySpec } from '../engine/strategies/index.js';
import { getCredentials, login, saveSession } from './bga-auth.js';
import { playGame } from './loop.js';
import { isCdpPortOpen, launchBrowser } from './browser-launcher.js';

// ── Argument parsing ───────────────────────────────────────────────────

type BrowserChoice = 'chrome' | 'msedge' | 'chromium';

interface Args {
  mode: 'connect' | 'table';
  table: string;
  strategy: string;
  delay: number;
  verbose: boolean;
  headless: boolean;
  sessionFile: string;
  cdpUrl: string;
  port: number;
  browser: BrowserChoice;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const opts: Args = {
    mode: 'connect',
    table: '',
    strategy: 'mcs',
    delay: 2000,
    verbose: false,
    headless: true,
    sessionFile: '.bga-session.json',
    cdpUrl: '',
    port: 9222,
    browser: 'msedge',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--connect': case '-c':
        opts.mode = 'connect'; break;
      case '--table': case '-t':
        opts.mode = 'table';
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
      case '--cdp-url':
        opts.cdpUrl = args[++i]; break;
      case '--port': case '-p':
        opts.port = parseInt(args[++i]) || 9222; break;
      case '--browser': case '-b':
        opts.browser = args[++i] as BrowserChoice; break;
      case '--help': case '-h':
        printUsage(); process.exit(0);
    }
  }

  return opts;
}

function printUsage(): void {
  console.log(`
6 Nimmt! Headless Player for Board Game Arena

MODES:

  Connect mode (default) — attach to your running browser:
    1. Launch Chrome with: chrome --remote-debugging-port=9222
    2. Login to BGA and open a table yourself
    3. Run: npm run play -- --connect -s mcs -v

  Table mode — script launches browser and navigates:
    npm run play -- --table <table-id> -s mcs -v

OPTIONS:
  --connect, -c     Connect to existing browser (default mode)
  --table, -t       BGA table ID (switches to table mode)
  --browser, -b     Browser to use: chrome, msedge, chromium (default: msedge)
  --strategy, -s    Strategy to use (default: mcs)
                    Format: name or name:key=val,key=val
                    Available: ${[...strategies.keys()].join(', ')}
  --delay, -d       Ms delay before each play (default: 2000)
  --verbose, -v     Enable structured logging
  --port, -p        CDP port for connect mode (default: 9222)
  --cdp-url         Full CDP WebSocket URL (overrides --port)
  --no-headless     Show browser window (table mode only)
  --session         Session file path (default: .bga-session.json)
  --help, -h        Show this help

ENVIRONMENT:
  BGA_USERNAME      Board Game Arena username (table mode only)
  BGA_PASSWORD      Board Game Arena password (table mode only)

EXAMPLES:
  # You're already on a BGA table in Edge with --remote-debugging-port=9222
  npm run play -- --connect -s mcs -v

  # Use Chrome instead of Edge
  npm run play -- --connect -b chrome -s mcs -v

  # Full auto: launch browser, login, navigate to table
  npm run play -- --table 843761580 -s mcs:mcPerCard=100 -b chrome --no-headless -v

  # Connect to a specific CDP endpoint
  npm run play -- --connect --cdp-url ws://127.0.0.1:9222/devtools/browser/abc123 -v
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
      mode: args.mode,
      table: args.table || '(from browser)',
      strategy: name,
      options: options ?? {},
      delay: args.delay,
      timestamp: new Date().toISOString(),
    }));
  }

  let page: Page | undefined;
  let browser: Browser | undefined;

  try {
    if (args.mode === 'connect') {
      // ── Connect mode: attach to existing browser ──
      const cdpUrl = args.cdpUrl || `http://127.0.0.1:${args.port}`;
      
      const portOpen = await isCdpPortOpen(args.port);
      
      if (!portOpen && !args.cdpUrl) {
        // No browser running — launch one and prompt user to prepare
        console.log(`\nLaunching ${args.browser} with remote debugging on port ${args.port}...`);
        launchBrowser(args.browser as 'chrome' | 'msedge', args.port, 'https://boardgamearena.com');
        
        let ready = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 1000));
          if (await isCdpPortOpen(args.port)) { ready = true; break; }
        }
        if (!ready) {
          throw new Error(`Browser did not start on port ${args.port} within 20s`);
        }
        console.log('Browser launched!\n');

        const resolvedOpts = strategy.getOptions?.() ?? options ?? {};
        console.log('──────────────────────────────────────────');
        console.log('  6 Nimmt! Headless Player');
        console.log(`  Strategy: ${name} (${JSON.stringify(resolvedOpts)})`);
        console.log('──────────────────────────────────────────\n');
        console.log('1. Login to BGA if needed');
        console.log('2. Open or join a 6 Nimmt! table');
        console.log('3. When you\'re on the game table and ready to play:\n');
        console.log('Press ENTER to start playing...');
        await waitForEnter();
      } else {
        // Browser already running — resume immediately
        console.log(`\nConnecting to existing browser on port ${args.port}...`);
      }

      if (args.verbose) {
        console.log(JSON.stringify({
          event: 'connecting',
          cdpUrl,
          browser: args.browser,
          timestamp: new Date().toISOString(),
        }));
      }

      browser = await chromium.connectOverCDP(cdpUrl);
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        throw new Error('No browser contexts found. Is the browser open?');
      }
      
      // Find BGA game page among open tabs
      const context = contexts[0];
      const pages = context.pages();
      page = pages.find(p => 
        p.url().includes('boardgamearena.com') && 
        (p.url().includes('/table') || p.url().includes('/sechsnimmt') || p.url().includes('game='))
      );

      if (!page) {
        console.error('No BGA game tab found. Open tabs:');
        for (const p of pages) {
          console.error(`  - ${p.url()}`);
        }
        throw new Error(
          'Navigate to a BGA game table in your browser, then run this again.'
        );
      }

      console.log(`Connected to: ${page.url()}`);

    } else {
      // ── Table mode: launch browser and navigate ──
      const channel = args.browser === 'chromium' ? undefined : args.browser;
      browser = await chromium.launch({ headless: args.headless, channel });
      let context;
      try {
        context = await browser.newContext({ storageState: args.sessionFile });
      } catch {
        context = await browser.newContext();
      }
      
      page = await context.newPage();
      const tableUrl = `https://boardgamearena.com/table?table=${args.table}`;
      await page.goto(tableUrl, { waitUntil: 'domcontentloaded' });

      // Check if we need to log in
      if (page.url().includes('/account') || page.url().includes('/login')) {
        const creds = getCredentials();
        await login(page, creds);
        await saveSession(context, args.sessionFile);
        await page.goto(tableUrl, { waitUntil: 'domcontentloaded' });
      }
    }

    // Wait for game to be ready
    await page.waitForSelector('#game_play_area', { timeout: 30_000 });
    await page.waitForTimeout(2000); // Let animations settle

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
      strategyName: name,
      delay: args.delay,
      verbose: args.verbose,
    });

    console.log(JSON.stringify({
      event: 'gameComplete',
      ...result,
      timestamp: new Date().toISOString(),
    }));

    // Save session if in table mode
    if (args.mode === 'table') {
      const context = page.context();
      await saveSession(context, args.sessionFile);
    }

  } catch (err) {
    console.error(JSON.stringify({
      event: 'error',
      message: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  } finally {
    // In connect mode, don't close the user's browser!
    if (args.mode === 'table' && browser) {
      await browser.close();
    } else if (browser) {
      browser.close().catch(() => {}); // disconnect gracefully
    }
  }
}

function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve());
  });
}

main();
