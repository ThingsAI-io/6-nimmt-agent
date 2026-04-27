/**
 * Row module: pure, immutable operations on board rows.
 */
import type { CardNumber, Row } from './types';
import { cattleHeads } from './card';

/** Returns the last card in the row (the one new cards compare against). */
export function tail(row: Row): CardNumber {
  return row[row.length - 1];
}

/** Sum of cattleHeads for all cards in the row. */
export function penalty(row: Row): number {
  return row.reduce((sum, card) => sum + cattleHeads(card), 0);
}

/** Number of cards in the row. */
export function rowLength(row: Row): number {
  return row.length;
}

/** Returns a new row with the card appended (does NOT mutate). */
export function appendCard(row: Row, card: CardNumber): Row {
  return [...row, card];
}

/** True if the row has 5 cards (6th would trigger overflow). */
export function isOverflowing(row: Row): boolean {
  return row.length === 5;
}
