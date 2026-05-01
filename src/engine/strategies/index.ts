import type { Strategy } from './types';
import { createRandomStrategy } from './random';
import { createDummyMinStrategy, createDummyMaxStrategy } from './dummy';
import { createBayesianSimpleStrategy } from './bayesian';
import { createMcsStrategy } from './mcs';

export type { Strategy, TurnResolution } from './types';

export type StrategyFactory = (opts?: Record<string, unknown>) => Strategy;

/** Registry mapping strategy names to factory functions. */
export const strategies: ReadonlyMap<string, StrategyFactory> = new Map([
  ['random', noOptions('random', () => createRandomStrategy())],
  ['dummy-min', noOptions('dummy-min', () => createDummyMinStrategy())],
  ['dummy-max', noOptions('dummy-max', () => createDummyMaxStrategy())],
  ['bayesian-simple', noOptions('bayesian-simple', () => createBayesianSimpleStrategy())],
  ['mcs', (opts?: Record<string, unknown>) => createMcsStrategy(opts as Parameters<typeof createMcsStrategy>[0])],
]);

/** Wrap a no-options factory to reject any options passed by mistake. */
function noOptions(name: string, factory: () => Strategy): StrategyFactory {
  return (opts?: Record<string, unknown>) => {
    if (opts && Object.keys(opts).length > 0) {
      throw new Error(`Strategy "${name}" does not accept options. Got: ${Object.keys(opts).join(', ')}`);
    }
    return factory();
  };
}

/**
 * Parse a strategy specifier string with optional colon-separated params.
 * Examples:
 *   "mcs" → { name: "mcs", options: undefined }
 *   "mcs:mcMax=500,mcPerCard=50" → { name: "mcs", options: { mcMax: 500, mcPerCard: 50 } }
 */
export function parseStrategySpec(spec: string): { name: string; options?: Record<string, unknown> } {
  const colonIdx = spec.indexOf(':');
  if (colonIdx === -1) return { name: spec };

  const name = spec.slice(0, colonIdx).trim();
  const paramStr = spec.slice(colonIdx + 1).trim();
  if (!paramStr) return { name };

  const options: Record<string, unknown> = {};
  for (const rawPair of paramStr.split(',')) {
    const pair = rawPair.trim();
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      // Bare flags treated as true
      options[pair] = true;
    } else {
      const key = pair.slice(0, eqIdx).trim();
      const rawVal = pair.slice(eqIdx + 1).trim();
      // Attempt numeric coercion
      const num = Number(rawVal);
      options[key] = Number.isNaN(num) ? rawVal : num;
    }
  }
  return { name, options };
}
