import type { CardNumber } from '../engine/types';

export interface SimConfig {
  readonly players: readonly {
    id: string;
    strategy: string;
    params?: Record<string, unknown>;
  }[];
  readonly seed?: string;
}

export interface GameResult {
  readonly seed: string;
  readonly rounds: number;
  readonly playerResults: readonly PlayerResult[];
}

export interface PlayerResult {
  readonly id: string;
  readonly strategy: string;
  readonly finalScore: number;
  readonly rank: number;
}

export interface BatchResult {
  readonly gamesPlayed: number;
  readonly config: SimConfig;
  readonly perStrategy: ReadonlyMap<string, StrategyStats>;
}

export interface StrategyStats {
  readonly wins: number;
  readonly winRate: number;
  readonly avgScore: number;
  readonly medianScore: number;
  readonly minScore: number;
  readonly maxScore: number;
  readonly scoreStdDev: number;
}
