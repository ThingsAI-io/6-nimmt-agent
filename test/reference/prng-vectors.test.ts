/**
 * T1G — PRNG Known-Answer Vector Tests
 * These vectors are canonical ground truth — any PRNG implementation must match exactly.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveSeedState,
  xoshiro256ss,
  fisherYatesShuffle,
  cattleHeads,
  createDeck,
  dealRound,
  determinePlacement,
  resolveOverflow,
  resolveTurn,
  isGameOver,
  getWinners,
  playFullGame,
} from './reference-model';

// ── Helper ─────────────────────────────────────────────────────────────

function hex(n: bigint): string {
  return '0x' + n.toString(16).padStart(16, '0');
}

// ── PRNG vectors: test-seed-001 ────────────────────────────────────────

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
    const shuffled = fisherYatesShuffle(deck, `${SEED}/1`);
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

// ── PRNG vectors: trace-seed-001 ───────────────────────────────────────

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
    const shuffled = fisherYatesShuffle(deck, `${SEED}/1`);
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

// ── cattleHeads correctness ────────────────────────────────────────────

describe('cattleHeads', () => {
  it('sums to exactly 171 for all 104 cards', () => {
    let total = 0;
    for (let i = 1; i <= 104; i++) total += cattleHeads(i);
    expect(total).toBe(171);
  });

  it('returns correct values for special cards', () => {
    expect(cattleHeads(55)).toBe(7);
    expect(cattleHeads(11)).toBe(5);
    expect(cattleHeads(22)).toBe(5);
    expect(cattleHeads(99)).toBe(5);
    expect(cattleHeads(10)).toBe(3);
    expect(cattleHeads(100)).toBe(3);
    expect(cattleHeads(5)).toBe(2);
    expect(cattleHeads(95)).toBe(2);
    expect(cattleHeads(1)).toBe(1);
    expect(cattleHeads(104)).toBe(1);
  });
});

// ── dealRound — player-count verification ──────────────────────────────

describe('dealRound', () => {
  const deck = createDeck('deal-test', 1);

  it.each([2, 5, 10])('deals correctly for %d players', (n) => {
    const { hands, board, remaining } = dealRound(deck, n);
    expect(hands.length).toBe(n);
    for (const h of hands) expect(h.length).toBe(10);
    expect(board.length).toBe(4);
    for (const row of board) expect(row.length).toBe(1);
    expect(remaining.length).toBe(104 - 10 * n - 4);
    // All cards unique
    const all = [...hands.flat(), ...board.flat(), ...remaining];
    expect(new Set(all).size).toBe(104);
  });
});

// ── determinePlacement ─────────────────────────────────────────────────

describe('determinePlacement', () => {
  it('picks closest lower tail', () => {
    const board: [number[], number[], number[], number[]] = [[10], [20], [30], [40]];
    expect(determinePlacement(board, 33)).toBe(2); // 30 is closest below 33
  });

  it('returns -1 when card is lower than all tails (rule 4)', () => {
    const board: [number[], number[], number[], number[]] = [[10], [20], [30], [40]];
    expect(determinePlacement(board, 5)).toBe(-1);
  });
});

// ── resolveOverflow ────────────────────────────────────────────────────

describe('resolveOverflow', () => {
  it('collects 5 cards when row is full', () => {
    const row = [1, 2, 3, 4, 5];
    const { newRow, collected } = resolveOverflow(row, 6);
    expect(newRow).toEqual([6]);
    expect(collected).toEqual([1, 2, 3, 4, 5]);
  });

  it('appends card when row has space', () => {
    const row = [1, 2, 3];
    const { newRow, collected } = resolveOverflow(row, 4);
    expect(newRow).toEqual([1, 2, 3, 4]);
    expect(collected).toEqual([]);
  });
});

// ── resolveTurn — multi-player ─────────────────────────────────────────

describe('resolveTurn', () => {
  it.each([2, 5, 10])('resolves %d simultaneous plays', (n) => {
    const deck = createDeck('resolve-test', 1);
    const { hands, board } = dealRound(deck, n);
    const plays = Array.from({ length: n }, (_, i) => ({
      playerId: `p${i}`,
      card: hands[i][0],
    }));
    const pickFn = (b: number[][]) => {
      let best = 0, bestPen = Infinity;
      for (let i = 0; i < 4; i++) {
        const pen = b[i].reduce((s, c) => s + cattleHeads(c), 0);
        if (pen < bestPen) { bestPen = pen; best = i; }
      }
      return best;
    };
    const { board: newBoard, collectedByPlayer } = resolveTurn(board, plays, pickFn);
    // Board still has 4 rows, each with at least 1 card
    expect(newBoard.length).toBe(4);
    for (const row of newBoard) expect(row.length).toBeGreaterThanOrEqual(1);
    // All played cards accounted for (on board or collected)
    expect(collectedByPlayer.size).toBe(n);
  });
});

// ── Full game self-tests ───────────────────────────────────────────────

describe('playFullGame', () => {
  it('plays a complete 2-player game to termination', () => {
    const result = playFullGame(2, 'self-test-2p');
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.winners.length).toBeGreaterThanOrEqual(1);
    // At least one player must have score ≥ 66
    const maxScore = Math.max(...result.finalScores.values());
    expect(maxScore).toBeGreaterThanOrEqual(66);
  });

  it('plays a complete 10-player game to termination', () => {
    const result = playFullGame(10, 'self-test-10p');
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.winners.length).toBeGreaterThanOrEqual(1);
    const maxScore = Math.max(...result.finalScores.values());
    expect(maxScore).toBeGreaterThanOrEqual(66);
  });

  it('plays a complete 5-player game to termination', () => {
    const result = playFullGame(5, 'self-test-5p');
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.winners.length).toBeGreaterThanOrEqual(1);
  });
});
