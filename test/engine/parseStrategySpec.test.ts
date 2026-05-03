import { describe, it, expect } from 'vitest';
import { parseStrategySpec, strategyKey } from '../../src/engine/strategies/index.js';
import { parseStrategies } from '../../src/cli/helpers.js';

describe('parseStrategySpec', () => {
  it('parses bare strategy name', () => {
    expect(parseStrategySpec('mcs')).toEqual({ name: 'mcs' });
  });

  it('parses strategy with numeric options', () => {
    expect(parseStrategySpec('mcs:mcMax=500,mcPerCard=50')).toEqual({
      name: 'mcs',
      options: { mcMax: 500, mcPerCard: 50 },
    });
  });

  it('parses strategy with string option', () => {
    expect(parseStrategySpec('mcs:policy=greedy')).toEqual({
      name: 'mcs',
      options: { policy: 'greedy' },
    });
  });

  it('parses flag-style params (no value)', () => {
    expect(parseStrategySpec('mcs:debug')).toEqual({
      name: 'mcs',
      options: { debug: true },
    });
  });

  it('handles trailing colon with no params', () => {
    expect(parseStrategySpec('mcs:')).toEqual({ name: 'mcs' });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseStrategySpec('mcs: mcMax = 500 , mcPerCard = 50 ')).toEqual({
      name: 'mcs',
      options: { mcMax: 500, mcPerCard: 50 },
    });
  });

  it('skips empty segments from trailing commas', () => {
    expect(parseStrategySpec('mcs:mcMax=500,')).toEqual({
      name: 'mcs',
      options: { mcMax: 500 },
    });
  });
});

describe('parseStrategies', () => {
  it('splits simple comma-separated strategies', () => {
    expect(parseStrategies('mcs,random,bayesian-simple')).toEqual([
      'mcs', 'random', 'bayesian-simple',
    ]);
  });

  it('keeps key=val params with preceding colon-spec', () => {
    expect(parseStrategies('mcs:mcMax=500,mcPerCard=50,random')).toEqual([
      'mcs:mcMax=500,mcPerCard=50', 'random',
    ]);
  });

  it('keeps flag params with =true syntax with preceding colon-spec', () => {
    expect(parseStrategies('mcs:debug=true,mcMax=500,random')).toEqual([
      'mcs:debug=true,mcMax=500', 'random',
    ]);
  });

  it('handles JSON array format', () => {
    expect(parseStrategies('["mcs","random"]')).toEqual(['mcs', 'random']);
  });

  it('handles multiple parameterized strategies', () => {
    expect(parseStrategies('mcs:mcMax=500,bayesian-simple,random')).toEqual([
      'mcs:mcMax=500', 'bayesian-simple', 'random',
    ]);
  });
});

describe('strategyKey', () => {
  it('returns bare name when no options', () => {
    expect(strategyKey('mcs')).toBe('mcs');
    expect(strategyKey('mcs', undefined)).toBe('mcs');
    expect(strategyKey('mcs', {})).toBe('mcs');
  });

  it('appends sorted options after colon', () => {
    expect(strategyKey('mcs', { mcPerCard: 100, mcMax: 500 })).toBe('mcs:mcMax=500,mcPerCard=100');
  });

  it('produces different keys for same strategy with different options', () => {
    const key1 = strategyKey('mcs', { mcPerCard: 50 });
    const key2 = strategyKey('mcs', { mcPerCard: 200 });
    expect(key1).not.toBe(key2);
    expect(key1).toBe('mcs:mcPerCard=50');
    expect(key2).toBe('mcs:mcPerCard=200');
  });

  it('roundtrips with parseStrategySpec', () => {
    const key = strategyKey('mcs', { mcPerCard: 100, mcMax: 500 });
    const parsed = parseStrategySpec(key);
    expect(parsed.name).toBe('mcs');
    expect(parsed.options).toEqual({ mcMax: 500, mcPerCard: 100 });
  });
});
