/**
 * Actor — execute moves on BGA page (play card, pick row).
 */
import type { Page } from 'playwright';
import type { HandItem } from './state-reader.js';
import type { CardNumber } from '../engine/types.js';

/**
 * Play a card from hand by clicking it.
 * Uses JS click via evaluate as BGA cards may not pass Playwright's visibility checks.
 */
export async function playCard(page: Page, hand: HandItem[], cardValue: CardNumber): Promise<void> {
  const item = hand.find(h => h.cardValue === cardValue);
  if (!item) {
    throw new Error(
      `Card ${cardValue} not found in hand. Available: ${hand.map(h => h.cardValue).join(', ')}`
    );
  }

  const selector = `#myhand_item_${item.stockId}`;
  
  // Use JS click — more reliable than Playwright's actionability checks for BGA
  const clicked = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    el.click();
    return true;
  }, selector);

  if (!clicked) {
    // Fallback: force click via Playwright
    await page.click(selector, { force: true, timeout: 5_000 });
  }
}

/**
 * Pick a row (0-indexed) by clicking its arrow selector.
 * DOM uses 1-indexed row selectors.
 */
export async function pickRow(page: Page, rowIndex: 0 | 1 | 2 | 3): Promise<void> {
  const domIndex = rowIndex + 1; // DOM is 1-indexed
  const selector = `#row_slot_${domIndex}_arrow`;

  // Use JS click — BGA arrows often fail Playwright visibility checks
  const clicked = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    el.click();
    return true;
  }, selector);

  if (!clicked) {
    await page.click(selector, { force: true, timeout: 5_000 });
  }
}
