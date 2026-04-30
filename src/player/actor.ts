/**
 * Actor — execute moves on BGA page (play card, pick row).
 *
 * KEY DESIGN DECISIONS:
 * - All clicks use el.click() via page.evaluate() instead of Playwright's
 *   page.click(). Reason: BGA elements often fail Playwright's actionability
 *   checks (visible, stable, enabled) even when perfectly clickable. The BGA
 *   framework uses complex CSS animations that confuse Playwright's checks.
 * - Card clicking is ATOMIC: find-by-value + click happens in a single
 *   evaluate() call. This prevents "stale stock ID" errors where BGA re-renders
 *   the hand between our read and our click (stock IDs change on re-render).
 * - Card values are decoded from sprite position, not element IDs.
 *   Element IDs (myhand_item_X) use internal stock IDs that change between renders.
 */
import type { Page } from 'playwright';
import type { HandItem } from './state-reader.js';
import type { CardNumber } from '../engine/types.js';

/**
 * Play a card from hand by clicking it.
 *
 * We do NOT use the pre-read hand's stockId to find the element because
 * BGA's Stock component may have re-rendered between our state read and
 * this click — stock IDs are ephemeral. Instead, we iterate ALL current
 * hand items, decode each card's value from its sprite, and click the one
 * that matches our target value.
 */
export async function playCard(page: Page, _hand: HandItem[], cardValue: CardNumber): Promise<void> {
  const result = await page.evaluate((targetValue: number) => {
    const gu = (window as any).gameui;
    if (!gu?.playerHand) return { ok: false, error: 'no playerHand' };

    const items = gu.playerHand.getAllItems();
    for (const item of items) {
      const el = document.getElementById(`myhand_item_${item.id}`);
      if (!el) continue;

      // Decode card value from sprite background-position (same formula as state-reader)
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
        // Direct DOM click — bypasses Playwright visibility/stability checks
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
 *
 * DOM uses 1-indexed selectors: #row_slot_1_arrow through #row_slot_4_arrow.
 * These arrows have class "selectable_row" when clickable, but their CSS
 * display/visibility can still confuse Playwright — so we use JS click first,
 * falling back to Playwright's force-click if the element isn't found via JS.
 */
export async function pickRow(page: Page, rowIndex: 0 | 1 | 2 | 3): Promise<void> {
  const domIndex = rowIndex + 1; // Convert 0-indexed to BGA's 1-indexed DOM
  const selector = `#row_slot_${domIndex}_arrow`;

  // Primary: JS click via evaluate (most reliable for BGA elements)
  const clicked = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    el.click();
    return true;
  }, selector);

  // Fallback: Playwright force-click if JS click failed (element not in DOM yet)
  if (!clicked) {
    await page.click(selector, { force: true, timeout: 5_000 });
  }
}
