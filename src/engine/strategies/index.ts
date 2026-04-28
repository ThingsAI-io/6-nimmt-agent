import type { Strategy } from './types';
import { createRandomStrategy } from './random';
import { createDummyMinStrategy, createDummyMaxStrategy } from './dummy';

export type { Strategy, TurnResolution } from './types';

/** Registry mapping strategy names to factory functions. */
export const strategies: ReadonlyMap<string, () => Strategy> = new Map([
  ['random', createRandomStrategy],
  ['dummy-min', createDummyMinStrategy],
  ['dummy-max', createDummyMaxStrategy],
]);
