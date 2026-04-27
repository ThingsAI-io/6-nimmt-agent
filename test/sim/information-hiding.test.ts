import { describe, it, expect } from 'vitest';
import {
  createGame,
  dealRound,
  toCardChoiceState,
} from '../../src/engine';
import type { CardChoiceState } from '../../src/engine';

describe('Information hiding — CardChoiceState', () => {
  const playerIds = ['spy', 'p1', 'p2'];
  const seed = 'info-hide-test';

  function getCardChoiceState(): CardChoiceState {
    let state = createGame(playerIds, seed);
    state = dealRound(state);
    return toCardChoiceState(state, 'spy');
  }

  it('hand contains only the calling player cards (10 cards)', () => {
    const cs = getCardChoiceState();
    expect(cs.hand).toHaveLength(10);
    // All cards are valid (1–104)
    for (const c of cs.hand) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(104);
    }
  });

  it('state does not expose other players hands', () => {
    const cs = getCardChoiceState();
    const stateKeys = Object.keys(cs);
    // CardChoiceState should not have 'players', 'deck', or 'hands'
    expect(stateKeys).not.toContain('players');
    expect(stateKeys).not.toContain('deck');
    expect(stateKeys).not.toContain('hands');
    expect(stateKeys).not.toContain('otherHands');
  });

  it('state has no deck information', () => {
    const cs = getCardChoiceState();
    expect('deck' in cs).toBe(false);
  });

  it('hand cards do not overlap with board cards', () => {
    const cs = getCardChoiceState();
    const boardCards = new Set<number>();
    for (const row of cs.board.rows) {
      for (const c of row) {
        boardCards.add(c);
      }
    }
    for (const c of cs.hand) {
      expect(boardCards.has(c)).toBe(false);
    }
  });

  it('different players see different hands from the same game state', () => {
    let state = createGame(playerIds, seed);
    state = dealRound(state);
    const spyState = toCardChoiceState(state, 'spy');
    const p1State = toCardChoiceState(state, 'p1');

    // Hands should differ
    expect(spyState.hand).not.toEqual(p1State.hand);
    // But board should be the same
    expect(spyState.board).toEqual(p1State.board);
  });

  it('CardChoiceState only contains expected fields', () => {
    const cs = getCardChoiceState();
    const expectedFields = new Set([
      'hand',
      'board',
      'playerScores',
      'playerCount',
      'round',
      'turn',
      'turnHistory',
      'initialBoardCards',
    ]);
    const actualFields = new Set(Object.keys(cs));
    expect(actualFields).toEqual(expectedFields);
  });
});
