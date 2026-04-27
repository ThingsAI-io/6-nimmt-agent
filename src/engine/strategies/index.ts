import type { Strategy } from './types';
import { createRandomStrategy } from './random';

export type { Strategy, TurnResolution } from './types';

/** Registry mapping strategy names to factory functions. */
export const strategies: ReadonlyMap<string, () => Strategy> = new Map([
  ['random', createRandomStrategy],
]);
