import { describe, it, expect } from 'vitest';
import {
  cattleHeads,
  createDeck,
  isValidCardNumber,
  deriveSeedState,
  xoshiro256ss,
  shuffle,
  createPrng,
} from '../../../src/engine';

// ── Helper ─────────────────────────────────────────────────────────────

function hex(n: bigint): string {
  return '0x' + n.toString(16).padStart(16, '0');
}

// ── cattleHeads ────────────────────────────────────────────────────────

describe('cattleHeads', () => {
  it('card 55 → 7', () => expect(cattleHeads(55)).toBe(7));

  it('multiples of 11 → 5', () => {
    for (const n of [11, 22, 33, 44, 66, 77, 88, 99]) {
      expect(cattleHeads(n)).toBe(5);
    }
  });

  it('multiples of 10 → 3', () => {
    for (const n of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      expect(cattleHeads(n)).toBe(3);
    }
  });

  it('multiples of 5 (not 10, not 11, not 55) → 2', () => {
    for (const n of [5, 15, 25, 35, 45, 65, 75, 85, 95]) {
      expect(cattleHeads(n)).toBe(2);
    }
  });

  it('everything else → 1', () => {
    expect(cattleHeads(1)).toBe(1);
    expect(cattleHeads(104)).toBe(1);
    expect(cattleHeads(42)).toBe(1);
  });

  it('total across 1-104 is 171', () => {
    let total = 0;
    for (let i = 1; i <= 104; i++) total += cattleHeads(i);
    expect(total).toBe(171);
  });
});

// ── isValidCardNumber ──────────────────────────────────────────────────

describe('isValidCardNumber', () => {
  it('accepts 1-104', () => {
    expect(isValidCardNumber(1)).toBe(true);
    expect(isValidCardNumber(104)).toBe(true);
    expect(isValidCardNumber(52)).toBe(true);
  });

  it('rejects out of range', () => {
    expect(isValidCardNumber(0)).toBe(false);
    expect(isValidCardNumber(105)).toBe(false);
    expect(isValidCardNumber(-1)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(isValidCardNumber(1.5)).toBe(false);
    expect(isValidCardNumber(NaN)).toBe(false);
  });
});

// ── createDeck ─────────────────────────────────────────────────────────

describe('createDeck', () => {
  it('returns 104 unique cards', () => {
    const deck = createDeck('test-seed', 1);
    expect(deck).toHaveLength(104);
    expect(new Set(deck).size).toBe(104);
  });

  it('is deterministic (same seed → same deck)', () => {
    const a = createDeck('determinism-test', 1);
    const b = createDeck('determinism-test', 1);
    expect(a).toEqual(b);
  });

  it('different seeds produce different decks', () => {
    const a = createDeck('seed-a', 1);
    const b = createDeck('seed-b', 1);
    expect(a).not.toEqual(b);
  });

  it('different rounds produce different decks', () => {
    const a = createDeck('same-seed', 1);
    const b = createDeck('same-seed', 2);
    expect(a).not.toEqual(b);
  });
});

// ── PRNG vectors — test-seed-001 ───────────────────────────────────────

describe('PRNG vectors — test-seed-001', () => {
  const SEED = 'test-seed-001';

  it('derives correct SHA-256 → xoshiro256** state', () => {
    const state = deriveSeedState(SEED);
    expect(state.map(hex)).toEqual([
      '0x166d6757c986ef30',
      '0x4fbe935e450ed88b',
      '0x7deba52846209485',
      '0x95104aa0ca8b4f29',
    ]);
  });

  it('produces correct first 20 xoshiro256** outputs', () => {
    const state = deriveSeedState(SEED);
    const outputs: bigint[] = [];
    for (let i = 0; i < 20; i++) outputs.push(xoshiro256ss(state));
    expect(outputs.map(hex)).toEqual([
      '0x3ff3c911ce0839ff',
      '0xf321784fd258f62a',
      '0x854220a76d92338e',
      '0x3be747c52ee31e5f',
      '0x03b188c36ffdaf14',
      '0x0d257afa5a5d8f6b',
      '0xe60d58fde56da5d2',
      '0x2ab1649ba445881a',
      '0x7795db19e250b217',
      '0x75ca0493d61fffcc',
      '0x43ad5c5b191e2fb4',
      '0x788ea13038642738',
      '0x0044ca196ded091a',
      '0x5ce569e760dcc8af',
      '0x26ac3ebda535b97e',
      '0x2e979f9b22b9cf69',
      '0x9ec925f426c73d12',
      '0xae2b047c9562baa0',
      '0x0b3da9d0aa41e6ac',
      '0xb0d2ad1067a1fca0',
    ]);
  });

  it('produces correct 104-card Fisher-Yates shuffle for round 1', () => {
    const deck = Array.from({ length: 104 }, (_, i) => i + 1);
    const shuffled = shuffle(deck, `${SEED}/1`);
    expect(shuffled).toEqual([
      65, 7, 91, 13, 24, 2, 28, 33, 12, 75,
      97, 38, 23, 43, 20, 5, 57, 84, 47, 36,
      95, 18, 63, 60, 21, 17, 58, 82, 26, 46,
      8, 92, 29, 27, 102, 15, 66, 87, 19, 77,
      98, 25, 68, 71, 89, 54, 74, 44, 67, 52,
      62, 61, 93, 11, 31, 50, 42, 86, 45, 30,
      64, 101, 73, 103, 78, 69, 40, 80, 16, 6,
      10, 96, 72, 37, 55, 22, 48, 49, 32, 41,
      4, 100, 1, 59, 9, 79, 94, 14, 104, 39,
      3, 81, 99, 85, 51, 34, 53, 83, 90, 35,
      56, 70, 76, 88,
    ]);
  });
});

// ── PRNG vectors — trace-seed-001 ──────────────────────────────────────

describe('PRNG vectors — trace-seed-001', () => {
  const SEED = 'trace-seed-001';

  it('derives correct SHA-256 → xoshiro256** state', () => {
    const state = deriveSeedState(SEED);
    expect(state.map(hex)).toEqual([
      '0x417e48a0339cedad',
      '0x2203c1fd7a31eed2',
      '0x3cf36c267a4ff142',
      '0x2874999e48d0d145',
    ]);
  });

  it('produces correct first 20 xoshiro256** outputs', () => {
    const state = deriveSeedState(SEED);
    const outputs: bigint[] = [];
    for (let i = 0; i < 20; i++) outputs.push(xoshiro256ss(state));
    expect(outputs.map(hex)).toEqual([
      '0x548cc73d637d77fd',
      '0x0f2b540f724a605e',
      '0x1b48bb2b695a66a3',
      '0x31b5553c075af817',
      '0x57629d6166c2a88c',
      '0x9c1107f9db39373a',
      '0x1c9013c02cf4d66f',
      '0xb1b0fe259d42df2d',
      '0xb7c9d58f1a8b441e',
      '0xbcdd78dec969f810',
      '0x04521555608803e0',
      '0xe11298cdddf08574',
      '0x251443faa9f60602',
      '0x5e0f31483a4517ec',
      '0xdaea1a0f7e6ebd22',
      '0xd61fbd4da612eda3',
      '0x212a068850a97a87',
      '0xfb08ebdf0214a392',
      '0x3d0690cc5cacb88d',
      '0x95f8f639d1d1c9d8',
    ]);
  });

  it('produces correct 104-card Fisher-Yates shuffle for round 1', () => {
    const deck = Array.from({ length: 104 }, (_, i) => i + 1);
    const shuffled = shuffle(deck, `${SEED}/1`);
    expect(shuffled).toEqual([
      56, 15, 30, 86, 62, 55, 36, 77, 16, 49,
      83, 52, 96, 68, 14, 34, 13, 66, 63, 73,
      99, 1, 54, 43, 45, 22, 25, 10, 40, 103,
      37, 18, 76, 74, 88, 11, 46, 60, 90, 38,
      31, 9, 26, 59, 48, 71, 28, 12, 27, 91,
      2, 3, 89, 85, 101, 98, 80, 95, 69, 17,
      87, 29, 81, 82, 8, 35, 64, 58, 24, 23,
      72, 39, 79, 42, 65, 47, 33, 7, 93, 92,
      5, 20, 21, 94, 44, 102, 97, 50, 61, 19,
      67, 51, 6, 100, 78, 70, 53, 104, 4, 84,
      57, 41, 32, 75,
    ]);
  });
});

// ── createPrng object interface ────────────────────────────────────────

describe('createPrng', () => {
  it('next() returns the same sequence as raw xoshiro256ss', () => {
    const prng = createPrng('test-seed-001');
    const state = deriveSeedState('test-seed-001');
    for (let i = 0; i < 10; i++) {
      expect(prng.next()).toBe(xoshiro256ss(state));
    }
  });

  it('nextFloat() returns values in [0, 1)', () => {
    const prng = createPrng('float-test');
    for (let i = 0; i < 100; i++) {
      const f = prng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});
