/**
 * State reader — extract game state from BGA live DOM.
 * All DOM reading code is verified from live play testing.
 *
 * Note: page.evaluate() callbacks run in browser context where `document`
 * and `gameui` exist. We use Function type to avoid needing DOM lib.
 */
import type { Page } from 'playwright';
import type { CardNumber, Board } from '../engine/types.js';
import { cattleHeads } from '../engine/card.js';

export interface HandItem {
  stockId: number;
  cardValue: CardNumber;
}

export interface GameStateFromDOM {
  hand: HandItem[];
  board: { rows: number[][] };
  scores: Record<string, number>;
  playerCount: number;
  myPlayerId: string;
}

/**
 * Read complete game state from BGA DOM.
 * Uses live DOM sources (not stale gamedatas).
 */
export async function readGameState(page: Page): Promise<GameStateFromDOM> {
  return await page.evaluate((() => {
    /* eslint-disable no-undef */
    // Hand: from playerHand stock (live source)
    const handItems = (window as any).gameui.playerHand.getAllItems();
    const hand = handItems.map((item: any) => {
      const el = (window as any).document.getElementById(`myhand_item_${item.id}`);
      if (!el) return null;
      
      // Find element with background-position (could be the element itself or any descendant)
      let bgPos = '';
      if (el.style && el.style.backgroundPosition) {
        bgPos = el.style.backgroundPosition;
      } else {
        const inner = el.querySelector('[style*="background-position"]');
        if (inner) bgPos = inner.style.backgroundPosition;
      }
      
      if (!bgPos) return null;
      const match = bgPos.match(/([-\d.]+)%\s+([-\d.]+)%/);
      if (!match) return null;
      const x = Math.abs(parseFloat(match[1]));
      const y = Math.abs(parseFloat(match[2]));
      const value = (y / 100) * 10 + (x / 100) + 1;
      return { stockId: item.id, cardValue: Math.round(value) };
    }).filter(Boolean);

    // Board: from DOM row zones (live source)
    const rows: number[][] = [];
    for (let r = 1; r <= 4; r++) {
      const zone = (window as any).document.getElementById(`row_card_zone_${r}`);
      if (!zone) { rows.push([]); continue; }
      const cards: number[] = [];
      const children = zone.querySelectorAll('[style*="background-position"]');
      children.forEach((div: any) => {
        const bgPos = div.style.backgroundPosition;
        if (!bgPos) return;
        const match = bgPos.match(/([-\d.]+)%\s+([-\d.]+)%/);
        if (!match) return;
        const x = Math.abs(parseFloat(match[1]));
        const y = Math.abs(parseFloat(match[2]));
        const value = Math.round((y / 100) * 10 + (x / 100) + 1);
        if (value >= 1 && value <= 104 && !cards.includes(value)) cards.push(value);
      });
      rows.push(cards);
    }

    // Scores and player info
    const players = (window as any).gameui.gamedatas.players;
    const scores: Record<string, number> = {};
    let playerCount = 0;
    for (const [id, p] of Object.entries(players) as [string, any][]) {
      scores[id] = parseInt((p as any).score) || 0;
      playerCount++;
    }

    const myPlayerId = String((window as any).gameui.player_id);

    return { hand, board: { rows }, scores, playerCount, myPlayerId };
    /* eslint-enable no-undef */
  }) as any);
}

/**
 * Diagnostic: dump raw hand DOM info for debugging.
 */
export async function diagnoseDom(page: Page): Promise<unknown> {
  return await page.evaluate((() => {
    const gu = (window as any).gameui;
    if (!gu) return { error: 'gameui not available' };

    const items = gu.playerHand?.getAllItems?.() ?? [];
    const sampleItem = items[0];
    let sampleHtml = '';
    if (sampleItem) {
      const el = (window as any).document.getElementById(`myhand_item_${sampleItem.id}`);
      sampleHtml = el?.outerHTML?.slice(0, 500) ?? 'element not found';
    }

    const title = (window as any).document.getElementById('pagemaintitletext')?.textContent ?? '';
    const stateName = gu.gamedatas?.gamestate?.name ?? 'unknown';

    return {
      itemCount: items.length,
      sampleItem,
      sampleHtml,
      title,
      stateName,
    };
  }) as any);
}

/**
 * Detect current page action state.
 */
export type PageAction = 'playCard' | 'pickRow' | 'waiting' | 'gameEnd';

export async function detectAction(page: Page): Promise<PageAction> {
  return await page.evaluate((() => {
    const gs = (window as any).gameui?.gamedatas?.gamestate;
    if (gs?.name === 'gameEnd') return 'gameEnd';

    const titleEl = (window as any).document.getElementById('pagemaintitletext');
    const title = (titleEl?.textContent ?? '').toLowerCase();

    if (title.includes('you must choose a card') || title.includes('you must play a card')) {
      return 'playCard';
    }

    // Row pick: must be OUR turn AND arrows must be actually visible
    if (title.includes('must take a row') || title.includes('must choose a row')) {
      // Check if any row arrow is visible (displayed with non-zero size)
      const arrows = (window as any).document.querySelectorAll('.arrow_slot');
      let anyVisible = false;
      arrows.forEach((el: any) => {
        if (el.offsetWidth > 0 && el.offsetHeight > 0 && 
            getComputedStyle(el).display !== 'none' &&
            getComputedStyle(el).visibility !== 'hidden') {
          anyVisible = true;
        }
      });
      if (anyVisible) return 'pickRow';
      // Arrows not visible — opponent is picking, wait
      return 'waiting';
    }

    // Fallback: check game state name directly (covers round transitions)
    if (gs?.name === 'cardSelect' || gs?.name === 'playerTurn') {
      const handItems = (window as any).gameui?.playerHand?.getAllItems?.() ?? [];
      if (handItems.length > 0) return 'playCard';
    }

    return 'waiting';
  }) as any);
}

/**
 * Get final scores when game ends.
 */
export async function getFinalScores(page: Page): Promise<Record<string, number>> {
  return await page.evaluate((() => {
    const players = (window as any).gameui.gamedatas.players;
    const scores: Record<string, number> = {};
    for (const [, p] of Object.entries(players) as [string, any][]) {
      scores[(p as any).name] = parseInt((p as any).score) || 0;
    }
    return scores;
  }) as any);
}

/**
 * Find the cheapest row (fewest cattle heads total) for row picking.
 */
export function findCheapestRow(board: { rows: number[][] }): 0 | 1 | 2 | 3 {
  let minHeads = Infinity;
  let minIdx: 0 | 1 | 2 | 3 = 0;
  for (let i = 0; i < 4; i++) {
    const row = board.rows[i];
    const heads = row.reduce((sum, card) => sum + cattleHeads(card), 0);
    if (heads < minHeads) {
      minHeads = heads;
      minIdx = i as 0 | 1 | 2 | 3;
    }
  }
  return minIdx;
}

