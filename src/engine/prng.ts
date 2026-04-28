/**
 * Seeded PRNG: SHA-256 seed derivation → xoshiro256** generator.
 * Uses BigInt for 64-bit arithmetic to avoid precision issues.
 */
import { createHash } from 'node:crypto';

// ── Constants ──────────────────────────────────────────────────────────

const MASK = (1n << 64n) - 1n;

// ── Internal helpers ───────────────────────────────────────────────────

function rotl64(x: bigint, k: number): bigint {
  return ((x << BigInt(k)) | (x >> BigInt(64 - k))) & MASK;
}

// ── Seed derivation ────────────────────────────────────────────────────

/** SHA-256(seedString) → 32 bytes → 4 × uint64 little-endian */
export function deriveSeedState(seedString: string): bigint[] {
  const buf = createHash('sha256').update(seedString).digest();
  const s: bigint[] = [];
  for (let i = 0; i < 4; i++) s.push(buf.readBigUInt64LE(i * 8));
  return s;
}

// ── xoshiro256** ───────────────────────────────────────────────────────

/** One step of xoshiro256**, mutates state in-place, returns uint64. */
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

// ── Prng object ────────────────────────────────────────────────────────

export interface Prng {
  /** Returns the next raw xoshiro256** output as a bigint. */
  next(): bigint;
  /** Returns a float in [0, 1). */
  nextFloat(): number;
}

/** Create a PRNG seeded from a string via SHA-256 → xoshiro256**. */
export function createPrng(seed: string): Prng {
  const state = deriveSeedState(seed);
  return {
    next(): bigint {
      return xoshiro256ss(state);
    },
    nextFloat(): number {
      // Use upper 53 bits for a double in [0, 1)
      return Number(xoshiro256ss(state) >> 11n) / 2 ** 53;
    },
  };
}

// ── Fisher-Yates shuffle ───────────────────────────────────────────────

/** Fisher-Yates shuffle using a seed string. Returns a NEW array. */
export function shuffle<T>(array: readonly T[], seedString: string): T[] {
  const s = deriveSeedState(seedString);
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Number(xoshiro256ss(s) % BigInt(i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
