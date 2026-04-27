/**
 * T1G — Reference Model for 6 Nimmt!
 * Deliberately naive, flat, imperative implementation.
 * No imports from src/ — completely independent.
 */
import { createHash } from 'node:crypto';

// ── Types ──────────────────────────────────────────────────────────────

export type CardNumber = number;
export type Row = CardNumber[];
export type Board = [Row, Row, Row, Row];
export interface Play { playerId: string; card: CardNumber }
export interface PlacementResult {
  rowIndex: number;
  collected: CardNumber[];
  overflow: boolean;
}
export type RowPickFn = (board: Board, card: CardNumber, playerId: string) => number;

// ── Card values (rule §Cards) ──────────────────────────────────────────

/** Cattle-head lookup — priority: 55→7, %11→5, %10→3, %5→2, else→1 */
export function cattleHeads(card: CardNumber): number {
  if (card === 55) return 7;          // 1 card
  if (card % 11 === 0) return 5;      // 8 cards
  if (card % 10 === 0) return 3;      // 10 cards
  if (card % 5 === 0) return 2;       // 9 cards
  return 1;                           // 76 cards
}

// ── PRNG: xoshiro256** with SHA-256 seed derivation (§2.2) ─────────────

const MASK = (1n << 64n) - 1n;

function rotl64(x: bigint, k: number): bigint {
  return ((x << BigInt(k)) | (x >> BigInt(64 - k))) & MASK;
}

/** SHA-256(seedString) → 4 × uint64 LE → xoshiro256** state */
export function deriveSeedState(seedString: string): bigint[] {
  const buf = createHash('sha256').update(seedString).digest();
  const s: bigint[] = [];
  for (let i = 0; i < 4; i++) s.push(buf.readBigUInt64LE(i * 8));
  return s;
}

/** One step of xoshiro256**, mutates state in-place, returns uint64 */
export function xoshiro256ss(s: bigint[]): bigint {
  const result = (rotl64((s[1] * 5n) & MASK, 7) * 9n) & MASK;
  const t = (s[1] << 17n) & MASK;
  s[2] ^= s[0]; s[2] &= MASK;
  s[3] ^= s[1]; s[3] &= MASK;
  s[1] ^= s[2]; s[1] &= MASK;
  s[0] ^= s[3]; s[0] &= MASK;
  s[2] ^= t;    s[2] &= MASK;
  s[3] = rotl64(s[3], 45);
  return result;
}

/** Fisher-Yates shuffle using seeded xoshiro256** */
export function fisherYatesShuffle<T>(arr: T[], seedString: string): T[] {
  const s = deriveSeedState(seedString);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Number(xoshiro256ss(s) % BigInt(i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Deck / Deal ────────────────────────────────────────────────────────

/** Create cards 1-104, shuffle with per-round seed: SHA-256(gameSeed + '/' + round) */
export function createDeck(gameSeed: string, round: number): CardNumber[] {
  const cards = Array.from({ length: 104 }, (_, i) => i + 1);
  return fisherYatesShuffle(cards, `${gameSeed}/${round}`);
}

/** Deal 10 cards per player + 4 to board from shuffled deck */
export function dealRound(
  deck: CardNumber[],
  playerCount: number,
): { hands: CardNumber[][]; board: Board; remaining: CardNumber[] } {
  const d = [...deck];
  const hands: CardNumber[][] = [];
  for (let p = 0; p < playerCount; p++) hands.push(d.splice(0, 10));
  const boardCards = d.splice(0, 4);
  const board: Board = [
    [boardCards[0]], [boardCards[1]], [boardCards[2]], [boardCards[3]],
  ];
  return { hands, board, remaining: d };
}

// ── Board / Placement (rules §1–4) ─────────────────────────────────────

/** Find row with closest lower tail; returns index or -1 for "must-pick" (rule 4) */
export function determinePlacement(board: Board, card: CardNumber): number {
  let bestIdx = -1;
  let bestTail = -1;
  for (let i = 0; i < 4; i++) {
    const tail = board[i][board[i].length - 1];
    if (tail < card && tail > bestTail) { bestIdx = i; bestTail = tail; }
  }
  return bestIdx; // -1 means card < all tails → rule 4
}

/** Handle overflow: if row has 5 cards, collect them; new row = [card] */
export function resolveOverflow(
  row: Row,
  card: CardNumber,
): { newRow: Row; collected: CardNumber[] } {
  if (row.length >= 5) {
    return { newRow: [card], collected: [...row] }; // rule 3: collect 5, start fresh
  }
  return { newRow: [...row, card], collected: [] };
}

// ── Turn resolution ────────────────────────────────────────────────────

/** Resolve all plays for one turn, lowest card first (rules §1–4) */
export function resolveTurn(
  board: Board,
  plays: Play[],
  rowPickFn: RowPickFn,
): { board: Board; collectedByPlayer: Map<string, CardNumber[]> } {
  const sorted = [...plays].sort((a, b) => a.card - b.card);
  const b: Board = [
    [...board[0]], [...board[1]], [...board[2]], [...board[3]],
  ];
  const collected = new Map<string, CardNumber[]>();
  for (const p of sorted) collected.set(p.playerId, []);

  for (const { playerId, card } of sorted) {
    let rowIdx = determinePlacement(b, card);
    if (rowIdx === -1) {
      // Rule 4: card lower than all tails → player picks a row
      rowIdx = rowPickFn(b, card, playerId);
      const taken = [...b[rowIdx]];
      collected.get(playerId)!.push(...taken);
      b[rowIdx] = [card];
    } else {
      // Rules 1-2: place on closest lower tail row
      const { newRow, collected: overflow } = resolveOverflow(b[rowIdx], card);
      b[rowIdx] = newRow;
      if (overflow.length > 0) collected.get(playerId)!.push(...overflow);
    }
  }
  return { board: b, collectedByPlayer: collected };
}

// ── Scoring / Game-end ─────────────────────────────────────────────────

/** Sum cattle heads of collected cards per player */
export function scoreRound(
  collectedByPlayer: Map<string, CardNumber[]>,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const [pid, cards] of collectedByPlayer) {
    scores.set(pid, cards.reduce((sum, c) => sum + cattleHeads(c), 0));
  }
  return scores;
}

/** Any player score ≥ 66 means game over (§2.1 step 5) */
export function isGameOver(scores: Map<string, number>): boolean {
  for (const s of scores.values()) if (s >= 66) return true;
  return false;
}

/** Player(s) with lowest total score win (§2.4 — ties share victory) */
export function getWinners(scores: Map<string, number>): string[] {
  let min = Infinity;
  for (const s of scores.values()) if (s < min) min = s;
  return [...scores.entries()].filter(([, s]) => s === min).map(([id]) => id);
}

// ── Self-test: play a complete game ────────────────────────────────────

/** Minimal row-pick strategy: pick row with fewest cattle heads */
function leastPenaltyRow(board: Board): number {
  let best = 0;
  let bestPen = Infinity;
  for (let i = 0; i < 4; i++) {
    const pen = board[i].reduce((s, c) => s + cattleHeads(c), 0);
    if (pen < bestPen) { bestPen = pen; best = i; }
  }
  return best;
}

/** Play a full game to termination with N players using simple strategy */
export function playFullGame(
  playerCount: number,
  gameSeed: string,
): { rounds: number; finalScores: Map<string, number>; winners: string[] } {
  const pids = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  const totalScores = new Map<string, number>();
  for (const pid of pids) totalScores.set(pid, 0);

  let round = 0;
  while (!isGameOver(totalScores)) {
    round++;
    const deck = createDeck(gameSeed, round);
    const { hands, board } = dealRound(deck, playerCount);
    let currentBoard = board;
    const roundCollected = new Map<string, CardNumber[]>();
    for (const pid of pids) roundCollected.set(pid, []);

    // Play 10 turns
    for (let turn = 0; turn < 10; turn++) {
      const plays: Play[] = pids.map((pid, i) => ({
        playerId: pid,
        card: hands[i][turn],  // simple: play cards in deal order
      }));
      const pickFn: RowPickFn = (b) => leastPenaltyRow(b);
      const result = resolveTurn(currentBoard, plays, pickFn);
      currentBoard = result.board;
      for (const [pid, cards] of result.collectedByPlayer) {
        roundCollected.get(pid)!.push(...cards);
      }
    }

    // Score round
    const roundScores = scoreRound(roundCollected);
    for (const [pid, s] of roundScores) {
      totalScores.set(pid, totalScores.get(pid)! + s);
    }
  }

  return { rounds: round, finalScores: totalScores, winners: getWinners(totalScores) };
}
