/**
 * BGA Authentication — login and session management.
 */
import type { Browser, BrowserContext, Page } from 'playwright';

export interface BgaCredentials {
  username: string;
  password: string;
}

export function getCredentials(): BgaCredentials {
  const username = process.env.BGA_USERNAME;
  const password = process.env.BGA_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'BGA_USERNAME and BGA_PASSWORD environment variables are required.\n' +
      'Set them before running the player.'
    );
  }
  return { username, password };
}

/**
 * Login to BGA and return the authenticated page.
 * If already logged in (persistent context), this is a no-op.
 */
export async function login(page: Page, creds: BgaCredentials): Promise<void> {
  await page.goto('https://boardgamearena.com/account');
  
  // Check if already logged in
  const url = page.url();
  if (!url.includes('/account') || await page.locator('#username_input').count() === 0) {
    return; // Already authenticated
  }

  await page.fill('#username_input', creds.username);
  await page.fill('#password_input', creds.password);
  await page.click('#submit_login_button');
  
  // Wait for redirect away from login page
  await page.waitForURL((url) => !url.toString().includes('/account'), { timeout: 15_000 });
}

/**
 * Create a persistent browser context to avoid re-login.
 */
export async function createPersistentContext(
  browser: Browser,
  storageStatePath?: string
): Promise<BrowserContext> {
  if (storageStatePath) {
    try {
      return await browser.newContext({ storageState: storageStatePath });
    } catch {
      // Storage state file doesn't exist yet — create fresh context
    }
  }
  return await browser.newContext();
}

/**
 * Save session cookies for reuse.
 */
export async function saveSession(context: BrowserContext, path: string): Promise<void> {
  await context.storageState({ path });
}
