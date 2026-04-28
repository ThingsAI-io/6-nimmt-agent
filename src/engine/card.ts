/**
 * Card module: cattle-head values, deck creation, card validation.
 */
import type { CardNumber } from './types';
import { shuffle } from './prng';

// ── Cattle heads ───────────────────────────────────────────────────────

/** Cattle-head value for a card. Priority: 55→7, %11→5, %10→3, %5→2, else→1. */
export function cattleHeads(card: number): number {
  if (card === 55) return 7;
  if (card % 11 === 0) return 5;
  if (card % 10 === 0) return 3;
  if (card % 5 === 0) return 2;
  return 1;
}

// ── Validation ─────────────────────────────────────────────────────────

/** Check whether n is a valid card number (integer 1–104). */
export function isValidCardNumber(n: number): n is CardNumber {
  return Number.isInteger(n) && n >= 1 && n <= 104;
}

// ── Deck creation ──────────────────────────────────────────────────────

/**
 * Create a shuffled 104-card deck using per-round seeded PRNG.
 * Seed is derived as `gameSeed + '/' + roundNumber`.
 */
export function createDeck(seed: string, round: number = 1): CardNumber[] {
  const cards = Array.from({ length: 104 }, (_, i) => (i + 1) as CardNumber);
  return shuffle(cards, `${seed}/${round}`) as CardNumber[];
}
