import { describe, it, expect } from 'vitest';
import {
  createGame,
  dealRound,
  toCardChoiceState,
  toRowChoiceState,
} from '../../../src/engine';
import type {
  CardNumber,
  GameState,
  PendingRowPick,
} from '../../../src/engine';

function setupAwaitingCards(seed = 'visible-state-seed'): GameState {
  const state = createGame(['p0', 'p1', 'p2'], seed);
  return dealRound(state);
}

function setupAwaitingRowPick(seed = 'visible-state-seed'): GameState {
  const dealt = setupAwaitingCards(seed);
  const triggeringCard = dealt.players[0].hand[0];
  const revealedThisTurn = dealt.players.map((p) => ({
    playerId: p.id,
    card: p.hand[0],
  }));
  const pendingRowPick: PendingRowPick = {
    playerId: 'p0',
    triggeringCard,
    revealedThisTurn,
  };
  return {
    ...dealt,
    phase: 'awaiting-row-pick' as const,
    pendingRowPick,
  };
}

// ── toCardChoiceState ──────────────────────────────────────────────────

describe('toCardChoiceState', () => {
  it('returns only the specified player\'s hand', () => {
    const state = setupAwaitingCards();
    const view = toCardChoiceState(state, 'p0');
    expect(view.hand).toEqual(state.players[0].hand);
    // Ensure other players' hands are NOT present
    expect(view.hand).not.toEqual(state.players[1].hand);
  });

  it('includes correct board, scores, round, turn', () => {
    const state = setupAwaitingCards();
    const view = toCardChoiceState(state, 'p1');
    expect(view.board).toEqual(state.board);
    expect(view.round).toBe(state.round);
    expect(view.turn).toBe(state.turn);
    expect(view.playerCount).toBe(3);
    expect(view.playerScores).toEqual({
      p0: 0,
      p1: 0,
      p2: 0,
    });
    expect(view.turnHistory).toEqual([]);
    expect(view.initialBoardCards).toEqual(state.initialBoardCards);
  });

  it('throws for non-existent player', () => {
    const state = setupAwaitingCards();
    expect(() => toCardChoiceState(state, 'unknown')).toThrow('Unknown player');
  });

  it('throws if phase is not "awaiting-cards"', () => {
    const state = createGame(['p0', 'p1'], 'seed');
    // phase is "round-over"
    expect(() => toCardChoiceState(state, 'p0')).toThrow('awaiting-cards');
  });
});

// ── toRowChoiceState ───────────────────────────────────────────────────

describe('toRowChoiceState', () => {
  it('includes triggeringCard and revealedThisTurn', () => {
    const state = setupAwaitingRowPick();
    const view = toRowChoiceState(state, 'p0');
    expect(view.triggeringCard).toBe(state.pendingRowPick!.triggeringCard);
    expect(view.revealedThisTurn).toEqual(state.pendingRowPick!.revealedThisTurn);
    expect(view.board).toEqual(state.board);
    expect(view.hand).toEqual(state.players[0].hand);
    expect(view.playerCount).toBe(3);
  });

  it('throws if phase is not "awaiting-row-pick"', () => {
    const state = setupAwaitingCards();
    expect(() => toRowChoiceState(state, 'p0')).toThrow('awaiting-row-pick');
  });

  it('throws if playerId doesn\'t match pending player', () => {
    const state = setupAwaitingRowPick();
    expect(() => toRowChoiceState(state, 'p1')).toThrow('not the pending row picker');
  });

  it('resolutionIndex is always 0', () => {
    const state = setupAwaitingRowPick();
    const view = toRowChoiceState(state, 'p0');
    expect(view.resolutionIndex).toBe(0);
  });
});
