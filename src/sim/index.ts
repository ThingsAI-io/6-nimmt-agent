export type {
  SimConfig,
  GameResult,
  PlayerResult,
  BatchResult,
  StrategyStats,
  EloConfig,
  EloRating,
  EloSnapshot,
  EloGameInput,
  CompetitionConfig,
  CompetitionResult,
} from './types';

export { runGame } from './runner';
export { runBatch } from './batch';
export { runCompetition } from './competition';
export { computeStats, aggregateByStrategy } from './stats';
export {
  computeExpectedScore,
  computeActualScore,
  rankFromScores,
  createEloSnapshot,
  updateRatings,
  DEFAULT_ELO_CONFIG,
} from './elo';
