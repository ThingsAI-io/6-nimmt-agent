import { describe, it, expect } from 'vitest';
import { strategies } from '../../src/engine/strategies/index';
import { createMcsStrategy } from '../../src/engine/strategies/mcs';
import { createMcsPriorStrategy } from '../../src/engine/strategies/mcs-prior';

describe('Strategy option validation', () => {
  describe('MCS strategy', () => {
    it('throws on unknown option key', () => {
      expect(() => createMcsStrategy({ mcPerCrad: 50 } as never)).toThrow(
        /Unknown MCS option "mcPerCrad"/,
      );
    });

    it('throws on invalid scoring value', () => {
      expect(() => createMcsStrategy({ scoring: 'aggressive' } as never)).toThrow(
        /Invalid scoring mode "aggressive"/,
      );
    });

    it('accepts valid options without throwing', () => {
      expect(() => createMcsStrategy({ mcPerCard: 100, mcMax: 500, scoring: 'relative' })).not.toThrow();
    });

    it('accepts empty options (defaults)', () => {
      expect(() => createMcsStrategy()).not.toThrow();
      expect(() => createMcsStrategy({})).not.toThrow();
    });

    it('getOptions() returns resolved defaults', () => {
      const s = createMcsStrategy({});
      const opts = s.getOptions!();
      expect(opts).toEqual({ mcPerCard: 50, mcMax: 500, scoring: 'self' });
    });

    it('getOptions() reflects provided values', () => {
      const s = createMcsStrategy({ mcPerCard: 100, scoring: 'relative' });
      const opts = s.getOptions!();
      expect(opts).toEqual({ mcPerCard: 100, mcMax: 1000, scoring: 'relative' });
    });
  });

  describe('No-option strategies', () => {
    it.each(['random', 'dummy-min', 'dummy-max', 'bayesian-simple'])('%s throws when options are passed', (name) => {
      const factory = strategies.get(name)!;
      expect(() => factory({ foo: 1 })).toThrow(/does not accept options/);
    });

    it.each(['random', 'dummy-min', 'dummy-max', 'bayesian-simple'])('%s accepts no options', (name) => {
      const factory = strategies.get(name)!;
      expect(() => factory()).not.toThrow();
      expect(() => factory({})).not.toThrow();
    });
  });

  describe('MCS-prior strategy', () => {

    it('throws on unknown option key', () => {
      expect(() => createMcsPriorStrategy({ mcPerCrad: 50 })).toThrow(
        /Unknown mcs-prior option "mcPerCrad"/,
      );
    });

    it('accepts valid options without throwing', () => {
      expect(() =>
        createMcsPriorStrategy({ mcPerCard: 100, mcMax: 500, scoring: 'relative', simDepth: 2, opponentModel: 'prior', timingWeight: 0.5 }),
      ).not.toThrow();
    });

    it('accepts empty options (defaults)', () => {
      expect(() => createMcsPriorStrategy()).not.toThrow();
      expect(() => createMcsPriorStrategy({})).not.toThrow();
    });

    it('getOptions() returns resolved defaults', () => {
      const s = createMcsPriorStrategy({});
      const opts = s.getOptions!();
      expect(opts).toEqual({ mcPerCard: 100, mcMax: 1000, scoring: 'relative', simDepth: 1, opponentModel: 'prior', timingWeight: 0.3, trappedDiscount: 0.3 });
    });

    it('getOptions() reflects provided values', () => {
      const s = createMcsPriorStrategy({ mcPerCard: 50, timingWeight: 0.5, opponentModel: 'uniform' });
      const opts = s.getOptions!();
      expect(opts).toMatchObject({ mcPerCard: 50, timingWeight: 0.5, opponentModel: 'uniform' });
    });

    it('allows timingWeight=0 (disables timing pressure)', () => {
      const s = createMcsPriorStrategy({ timingWeight: 0 });
      expect(s.getOptions!().timingWeight).toBe(0);
    });
  });
});
