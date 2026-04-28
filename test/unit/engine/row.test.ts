import { describe, it, expect } from 'vitest';
import { tail, penalty, rowLength, appendCard, isOverflowing } from '../../../src/engine/row';
import { cattleHeads } from '../../../src/engine/card';
import type { CardNumber, Row } from '../../../src/engine/types';

const cn = (n: number) => n as CardNumber;

describe('row module', () => {
  describe('tail', () => {
    it('returns the last element', () => {
      const row: Row = [cn(3), cn(7), cn(12)];
      expect(tail(row)).toBe(12);
    });

    it('returns the only element for a single-card row', () => {
      const row: Row = [cn(55)];
      expect(tail(row)).toBe(55);
    });
  });

  describe('penalty', () => {
    it('sums cattleHeads correctly for known values', () => {
      // 55 → 7, 11 → 5, 10 → 3, 5 → 2, 1 → 1
      const row: Row = [cn(55), cn(11), cn(10), cn(5), cn(1)];
      expect(penalty(row)).toBe(7 + 5 + 3 + 2 + 1);
    });

    it('returns cattleHeads of single card', () => {
      expect(penalty([cn(33)] as Row)).toBe(cattleHeads(33));
    });

    it('handles all-ones row', () => {
      const row: Row = [cn(1), cn(2), cn(3), cn(4)];
      expect(penalty(row)).toBe(4);
    });
  });

  describe('rowLength', () => {
    it('returns correct length', () => {
      expect(rowLength([cn(1)] as Row)).toBe(1);
      expect(rowLength([cn(1), cn(2), cn(3)] as Row)).toBe(3);
      expect(rowLength([cn(1), cn(2), cn(3), cn(4), cn(5)] as Row)).toBe(5);
    });
  });

  describe('appendCard', () => {
    it('returns new array with card at end', () => {
      const row: Row = [cn(3), cn(7)];
      const result = appendCard(row, cn(12));
      expect(result).toEqual([3, 7, 12]);
    });

    it('does not mutate the original row', () => {
      const row: Row = [cn(3), cn(7)];
      appendCard(row, cn(12));
      expect(row).toEqual([3, 7]);
    });

    it('returns a different array reference', () => {
      const row: Row = [cn(3), cn(7)];
      const result = appendCard(row, cn(12));
      expect(result).not.toBe(row);
    });
  });

  describe('isOverflowing', () => {
    it('returns true for length 5', () => {
      const row: Row = [cn(1), cn(2), cn(3), cn(4), cn(5)];
      expect(isOverflowing(row)).toBe(true);
    });

    it('returns false for lengths 1-4', () => {
      for (let len = 1; len <= 4; len++) {
        const row = Array.from({ length: len }, (_, i) => cn(i + 1)) as Row;
        expect(isOverflowing(row)).toBe(false);
      }
    });
  });
});
