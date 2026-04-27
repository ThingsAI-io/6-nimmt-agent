export {
  cattleHeads,
  deriveSeedState,
  xoshiro256ss,
  fisherYatesShuffle,
  createDeck,
  dealRound,
  determinePlacement,
  resolveOverflow,
  resolveTurn,
  scoreRound,
  isGameOver,
  getWinners,
  playFullGame,
} from './reference-model';

export type {
  CardNumber,
  Row,
  Board,
  Play,
  PlacementResult,
  RowPickFn,
} from './reference-model';
