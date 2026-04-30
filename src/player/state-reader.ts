/**
 * State reader — extract game state from BGA live DOM.
 *
 * KEY DESIGN DECISIONS:
 * - All state is read from LIVE DOM elements, never from gameui.gamedatas
 *   (gamedatas is frozen at page load and becomes stale after first turn).
 * - Card values are decoded from CSS sprite background-position, not from
 *   element IDs (card_X IDs are database IDs, NOT card face values).
 * - page.evaluate() runs in the browser context — we access `document`,
 *   `window.gameui`, etc. directly inside callbacks.
 */
import type { Page } from 'playwright';
import type { CardNumber } from '../engine/types.js';
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
 *
 * Hand cards: read from gameui.playerHand.getAllItems() which returns
 * an array of {id, type} objects. The `id` is a stock item ID (internal
 * to BGA's Stock component) — NOT the card value. We must look up the
 * DOM element by stock ID and decode its sprite background-position.
 *
 * Board rows: read from DOM #row_card_zone_1 through _4.
 * Each zone contains card divs with background-position sprites.
 * Zones are 1-indexed in the DOM.
 *
 * Scores: read from gameui.gamedatas.players (scores are kept in sync
 * by the BGA framework even though other gamedatas fields are stale).
 */
export async function readGameState(page: Page): Promise<GameStateFromDOM> {
  return await page.evaluate((() => {
    /* eslint-disable no-undef */

    // === HAND READING ===
    // playerHand is a BGA "Stock" component. getAllItems() returns live items
    // but their .id is an internal stock ID — we must decode the card value
    // from the DOM element's sprite position.
    const handItems = (window as any).gameui.playerHand.getAllItems();
    const hand = handItems.map((item: any) => {
      const el = (window as any).document.getElementById(`myhand_item_${item.id}`);
      if (!el) return null;
      
      // BGA card sprites: background-position encodes card value.
      // The position may be on the element itself OR on a child div
      // (depends on BGA version/skin). We check both.
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

      // Sprite decode formula (verified empirically):
      // Cards are arranged in a 10-column sprite sheet.
      // X% gives column (0-9), Y% gives row (0-9).
      // value = row * 10 + column + 1  (cards are 1-104)
      const x = Math.abs(parseFloat(match[1]));
      const y = Math.abs(parseFloat(match[2]));
      const value = (y / 100) * 10 + (x / 100) + 1;
      return { stockId: item.id, cardValue: Math.round(value) };
    }).filter(Boolean);

    // === BOARD READING ===
    // Board has 4 rows. DOM uses #row_card_zone_1 through _4 (1-indexed).
    // Each zone contains card divs with background-position sprites.
    // We deduplicate by value to handle animation artifacts.
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
        // Filter valid range and deduplicate (animations can create duplicates)
        if (value >= 1 && value <= 104 && !cards.includes(value)) cards.push(value);
      });
      rows.push(cards);
    }

    // === SCORES & PLAYER INFO ===
    // Scores come from gamedatas.players — the BGA framework keeps score
    // fields updated even though other gamedatas fields (hand, table) are stale.
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
 * Capture a diagnostic DOM snapshot for error reporting.
 *
 * Called from loop.ts catch blocks to attach live DOM state to error events.
 * Reads only what's needed for debugging — does NOT re-read full game state
 * (which might itself throw if the page is in a bad state).
 */
export interface ErrorContext {
  title: string;
  gamestateName: string;
  handItemCount: number;
  /** Raw stock item IDs currently in hand — useful to see if card disappeared */
  rawItems: number[];
  rowArrowsVisible: boolean;
}

export async function captureErrorContext(page: Page): Promise<ErrorContext> {
  try {
    return await page.evaluate((() => {
      /* eslint-disable no-undef */
      const gu = (window as any).gameui;
      const title = (window as any).document.getElementById('pagemaintitletext')?.textContent?.trim() ?? '';
      const gamestateName = gu?.gamedatas?.gamestate?.name ?? 'unknown';

      const items = gu?.playerHand?.getAllItems?.() ?? [];
      const rawItems = items.map((i: any) => i.id);

      // Check if any row arrow is currently selectable (our row pick turn).
      // Only 'selectable_row' class is reliable — arrows stay visible during opponent picks.
      let rowArrowsVisible = false;
      for (let r = 1; r <= 4; r++) {
        const arrow = (window as any).document.getElementById(`row_slot_${r}_arrow`);
        if (arrow && arrow.classList.contains('selectable_row')) {
          rowArrowsVisible = true;
          break;
        }
      }

      return { title, gamestateName, handItemCount: items.length, rawItems, rowArrowsVisible };
      /* eslint-enable no-undef */
    }) as any);
  } catch {
    // Page may be mid-navigation or crashed — return a safe fallback
    return { title: '', gamestateName: 'unknown', handItemCount: -1, rawItems: [], rowArrowsVisible: false };
  }
}
/**
 * Debug utility — dump raw DOM state for manual investigation.
 * Not used in normal play; kept for ad-hoc troubleshooting via REPL/agent.
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
 * Detect what action the page is waiting for us to take.
 *
 * BGA indicates the required action via:
 * 1. The page title (#pagemaintitletext) — e.g. "You must choose a card to play"
 * 2. The gamestate name — e.g. 'cardSelect', 'playerTurn', 'gameEnd'
 * 3. DOM element visibility — e.g. row arrows becoming interactive
 *
 * IMPORTANT QUIRKS:
 * - Title "X must take a row" appears for BOTH our turn and opponent's turn.
 *   We must verify it's actually our turn by checking arrow visibility/interactivity.
 * - Between rounds, title may briefly show stale text while BGA deals new cards.
 *   Fallback: check gamestate.name === 'cardSelect' + hand has items.
 * - gamestate.name updates reliably but title text is more human-readable for matching.
 */
export type PageAction = 'playCard' | 'pickRow' | 'waiting' | 'gameEnd';

export async function detectAction(page: Page): Promise<PageAction> {
  return await page.evaluate((() => {
    const gs = (window as any).gameui?.gamedatas?.gamestate;
    const gsName: string = gs?.name ?? '';

    // Game end — check multiple possible state names BGA uses
    if (gsName === 'gameEnd' || gsName === 'endGame' || gsName === 'gameOver') return 'gameEnd';

    // BGA non-interactive resolution states — cards are flying/animating, not our turn.
    // These occur during normal play AND when a player quits mid-game (which can push
    // BGA into cardReveal or similar without a clean gameEnd transition).
    // Returning 'waiting' here prevents the fallback below from falsely triggering 'playCard'.
    // NOTE: add new states here as they are discovered in live play.
    const NON_INTERACTIVE = ['cardReveal', 'cardProcess', 'resolveStack', 'betweenRounds', 'newRound', 'nextRound'];
    if (NON_INTERACTIVE.includes(gsName)) return 'waiting';

    const titleEl = (window as any).document.getElementById('pagemaintitletext');
    const title = (titleEl?.textContent ?? '').toLowerCase();

    // Card selection: title explicitly addresses "you"
    if (title.includes('you must choose a card') || title.includes('you must play a card')) {
      return 'playCard';
    }

    // Row pick detection — tricky because BGA shows the same title structure
    // for both "You must take a row" and "OpponentName must take a row".
    // We verify it's our turn ONLY via the 'selectable_row' class — BGA adds
    // this class exclusively when it's our turn to pick. Do NOT fall back to
    // offsetParent/visibility checks: row arrows remain rendered and visible
    // in the DOM during opponent picks, so visibility alone is unreliable.
    if (title.includes('must take a row') || title.includes('must choose a row')) {
      const arrows = (window as any).document.querySelectorAll('#row_slot_1_arrow, #row_slot_2_arrow, #row_slot_3_arrow, #row_slot_4_arrow');
      let anySelectable = false;
      arrows.forEach((el: any) => {
        if (el.classList.contains('selectable_row')) anySelectable = true;
      });
      if (anySelectable) return 'pickRow';
      // NOT our turn — title says "X must take a row" where X is opponent.
      // Do NOT fall back to title.startsWith('you') — BGA title text can be stale
      // or misleading. Only selectable_row class is authoritative for our turn.
      return 'waiting';
    }

    // Fallback: gamestate name covers round transitions where title hasn't updated yet.
    // After BGA deals new cards, gamestate changes to 'cardSelect' before the title updates.
    // NOTE: this only fires for cardSelect/playerTurn — non-interactive states are handled
    // above and must not reach here, or they'd incorrectly trigger playCard.
    if (gsName === 'cardSelect' || gsName === 'playerTurn') {
      const handItems = (window as any).gameui?.playerHand?.getAllItems?.() ?? [];
      if (handItems.length > 0) return 'playCard';
    }

    return 'waiting';
  }) as any);
}

/**
 * Get final scores when game ends.
 * Uses player IDs as keys (not names) to avoid storing identity data.
 */
export async function getFinalScores(page: Page): Promise<Record<string, number>> {
  return await page.evaluate((() => {
    const players = (window as any).gameui.gamedatas.players;
    const scores: Record<string, number> = {};
    for (const [id, p] of Object.entries(players) as [string, any][]) {
      scores[id] = parseInt((p as any).score) || 0;
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

