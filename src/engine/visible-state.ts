/**
 * Visible-state projections: derive limited-visibility views
 * of GameState for strategy decision-making.
 */
import type {
  GameState,
  CardChoiceState,
  RowChoiceState,
} from './types';

/**
 * Project full GameState into what a player sees when choosing a card.
 * Only that player's hand is visible; other hands are hidden.
 */
export function toCardChoiceState(
  state: GameState,
  playerId: string,
): CardChoiceState {
  if (state.phase !== 'awaiting-cards') {
    throw new Error(
      `Cannot project card-choice state: phase is "${state.phase}", expected "awaiting-cards".`,
    );
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Unknown player "${playerId}".`);
  }

  const playerScores: Record<string, number> = {};
  for (const p of state.players) {
    playerScores[p.id] = p.score;
  }

  return {
    hand: player.hand,
    board: state.board,
    playerScores,
    playerCount: state.players.length,
    round: state.round,
    turn: state.turn,
    turnHistory: state.turnHistory,
    initialBoardCards: state.initialBoardCards,
  };
}

/**
 * Project full GameState into what a player sees when forced to pick a row.
 * All played cards this turn are public (simultaneous reveal).
 */
export function toRowChoiceState(
  state: GameState,
  playerId: string,
): RowChoiceState {
  if (state.phase !== 'awaiting-row-pick') {
    throw new Error(
      `Cannot project row-choice state: phase is "${state.phase}", expected "awaiting-row-pick".`,
    );
  }

  if (!state.pendingRowPick) {
    throw new Error('No pending row pick in state.');
  }

  if (state.pendingRowPick.playerId !== playerId) {
    throw new Error(
      `Player "${playerId}" is not the pending row picker (expected "${state.pendingRowPick.playerId}").`,
    );
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Unknown player "${playerId}".`);
  }

  const playerScores: Record<string, number> = {};
  for (const p of state.players) {
    playerScores[p.id] = p.score;
  }

  return {
    board: state.board,
    triggeringCard: state.pendingRowPick.triggeringCard,
    revealedThisTurn: state.pendingRowPick.revealedThisTurn,
    resolutionIndex: 0,
    hand: player.hand,
    playerScores,
    playerCount: state.players.length,
    round: state.round,
    turn: state.turn,
    turnHistory: state.turnHistory,
  };
}
