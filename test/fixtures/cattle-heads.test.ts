import { describe, it, expect } from 'vitest';
import { cattleHeads } from '../reference/index';
import fixtureData from '../../spec/fixtures/cattle-heads.json';

describe('cattle-heads.json fixture validation', () => {
  const { cards, checksum } = fixtureData;

  it('contains exactly 104 entries', () => {
    expect(cards).toHaveLength(104);
  });

  it('covers cards numbered 1-104', () => {
    const numbers = cards.map((c) => c.number);
    const expected = Array.from({ length: 104 }, (_, i) => i + 1);
    expect(numbers).toEqual(expected);
  });

  it('total cattleHeads sum equals 171', () => {
    const sum = cards.reduce((s, c) => s + c.cattleHeads, 0);
    expect(sum).toBe(171);
    expect(checksum.totalCattleHeads).toBe(171);
    expect(checksum.totalCards).toBe(104);
  });

  it('card 55 has 7 cattle heads (special)', () => {
    expect(cards.find((c) => c.number === 55)!.cattleHeads).toBe(7);
  });

  it('multiples of 11 (not 55) have 5 cattle heads', () => {
    for (const n of [11, 22, 33, 44, 66, 77, 88, 99]) {
      expect(cards.find((c) => c.number === n)!.cattleHeads).toBe(5);
    }
  });

  it('multiples of 10 (not multiples of 11) have 3 cattle heads', () => {
    for (const n of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      expect(cards.find((c) => c.number === n)!.cattleHeads).toBe(3);
    }
  });

  it('multiples of 5 (not 10 or 11, not 55) have 2 cattle heads', () => {
    const fives = [5, 15, 25, 35, 45, 65, 75, 85, 95];
    for (const n of fives) {
      expect(cards.find((c) => c.number === n)!.cattleHeads).toBe(2);
    }
  });

  it('every card matches reference model cattleHeads()', () => {
    for (const card of cards) {
      expect(card.cattleHeads, `card ${card.number}`).toBe(cattleHeads(card.number));
    }
  });

  it('priority rules: 55→7 > %11→5 > %10→3 > %5→2 > else→1', () => {
    // 55 is special (not treated as %5 or %11)
    expect(cattleHeads(55)).toBe(7);
    // 11 is %11 (not %1)
    expect(cattleHeads(11)).toBe(5);
    // 50 is %10 (not just %5)
    expect(cattleHeads(50)).toBe(3);
    // 100 is %10 (not just %5)
    expect(cattleHeads(100)).toBe(3);
    // 5 is %5 (not %10)
    expect(cattleHeads(5)).toBe(2);
    // 1 is else
    expect(cattleHeads(1)).toBe(1);
  });
});
