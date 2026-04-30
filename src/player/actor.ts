/**
 * Actor — execute moves on BGA page (play card, pick row).
 */
import type { Page } from 'playwright';
import type { HandItem } from './state-reader.js';
import type { CardNumber } from '../engine/types.js';

/**
 * Play a card from hand by clicking it.
 * Finds the card by value in the live DOM and clicks it atomically.
 */
export async function playCard(page: Page, hand: HandItem[], cardValue: CardNumber): Promise<void> {
  // Atomic: find card element by value and click it in one evaluate
  const result = await page.evaluate((targetValue: number) => {
    const gu = (window as any).gameui;
    if (!gu?.playerHand) return { ok: false, error: 'no playerHand' };

    const items = gu.playerHand.getAllItems();
    for (const item of items) {
      const el = document.getElementById(`myhand_item_${item.id}`);
      if (!el) continue;

      // Find background-position to decode card value
      let bgPos = '';
      if ((el as HTMLElement).style?.backgroundPosition) {
        bgPos = (el as HTMLElement).style.backgroundPosition;
      } else {
        const inner = el.querySelector('[style*="background-position"]');
        if (inner) bgPos = (inner as HTMLElement).style.backgroundPosition;
      }
      if (!bgPos) continue;

      const match = bgPos.match(/([-\d.]+)%\s+([-\d.]+)%/);
      if (!match) continue;
      const x = Math.abs(parseFloat(match[1]));
      const y = Math.abs(parseFloat(match[2]));
      const value = Math.round((y / 100) * 10 + (x / 100) + 1);

      if (value === targetValue) {
        (el as HTMLElement).click();
        return { ok: true, stockId: item.id, value };
      }
    }

    return { ok: false, error: `Card ${targetValue} not found`, items: items.length };
  }, cardValue as number);

  if (!result.ok) {
    throw new Error(`Failed to play card ${cardValue}: ${result.error}`);
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
