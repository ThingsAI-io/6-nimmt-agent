/**
 * Actor — execute moves on BGA page (play card, pick row).
 */
import type { Page } from 'playwright';
import type { HandItem } from './state-reader.js';
import type { CardNumber } from '../engine/types.js';

/**
 * Play a card from hand by clicking it.
 */
export async function playCard(page: Page, hand: HandItem[], cardValue: CardNumber): Promise<void> {
  const item = hand.find(h => h.cardValue === cardValue);
  if (!item) {
    throw new Error(
      `Card ${cardValue} not found in hand. Available: ${hand.map(h => h.cardValue).join(', ')}`
    );
  }

  const selector = `#myhand_item_${item.stockId}`;
  await page.click(selector);
}

/**
 * Pick a row (0-indexed) by clicking its arrow selector.
 * DOM uses 1-indexed row selectors.
 */
export async function pickRow(page: Page, rowIndex: 0 | 1 | 2 | 3): Promise<void> {
  const domIndex = rowIndex + 1; // DOM is 1-indexed
  const selector = `#row_slot_${domIndex}_arrow`;

  // Wait for row arrow to be clickable
  await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
  await page.click(selector);
}
