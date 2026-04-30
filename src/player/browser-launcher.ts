/**
 * Browser launcher — find and launch Chrome/Edge with remote debugging enabled.
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const BROWSER_PATHS: Record<string, string[]> = {
  msedge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/microsoft-edge',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
};

/**
 * Find the browser executable path.
 */
export function findBrowserPath(browser: 'chrome' | 'msedge'): string | null {
  const paths = BROWSER_PATHS[browser] ?? [];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Check if a browser is already listening on the given CDP port.
 */
export async function isCdpPortOpen(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/json/version`);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Launch browser with remote debugging port.
 * Returns the spawned process (detached — won't block the script).
 */
export function launchBrowser(
  browser: 'chrome' | 'msedge',
  port: number,
  url?: string
): void {
  const execPath = findBrowserPath(browser);
  if (!execPath) {
    throw new Error(
      `Could not find ${browser} executable. Searched:\n` +
      (BROWSER_PATHS[browser] ?? []).map(p => `  - ${p}`).join('\n') +
      `\n\nLaunch it manually with: <path-to-browser> --remote-debugging-port=${port}`
    );
  }

  const args = [
    `--remote-debugging-port=${port}`,
    ...(url ? [url] : []),
  ];

  // Spawn detached so it outlives this process
  const child = spawn(execPath, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log(`Launched ${browser} (PID ${child.pid}) with --remote-debugging-port=${port}`);
  if (url) console.log(`Opening: ${url}`);
}
