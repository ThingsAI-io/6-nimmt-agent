// Engine barrel export
export type {
  CardNumber,
  Row,
  Board,
  PlayerState,
  GameState,
  GamePhase,
  CardChoiceState,
  RowChoiceState,
  TurnHistoryEntry,
  PlayCardMove,
  PickRowMove,
  PlacementResult,
  TurnResolutionResult,
  PendingRowPick,
} from './types';

export { cattleHeads, isValidCardNumber, createDeck } from './card';

export {
  createPrng,
  deriveSeedState,
  xoshiro256ss,
  shuffle,
} from './prng';

export type { Prng } from './prng';

export { tail, penalty, rowLength, appendCard, isOverflowing } from './row';

export { determinePlacement, placeCard, collectRow } from './board';

export type { MustPickRow } from './board';

export {
  createGame,
  dealRound,
  resolveTurn,
  scoreRound,
  isGameOver,
  getWinners,
} from './game';

export { toCardChoiceState, toRowChoiceState } from './visible-state';

export type { Strategy, TurnResolution } from './strategies';
export { strategies } from './strategies';
