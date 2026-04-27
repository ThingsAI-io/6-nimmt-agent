import { describe, it, expect } from 'vitest';
import { listStrategies, validateState, recommendOnce } from '../../src/mcp/tools/stateless.js';

// ── Shared test states ──────────────────────────────────────────────

const validCardState: Record<string, unknown> = {
  hand: [3, 17, 42, 55, 67],
  board: { rows: [[5], [10], [20], [30]] },
  playerScores: { p0: 0, p1: 0 },
  playerCount: 2,
  round: 1,
  turn: 1,
  turnHistory: [],
  initialBoardCards: { rows: [[5], [10], [20], [30]] },
};

const validRowState: Record<string, unknown> = {
  board: { rows: [[5], [10], [20], [30]] },
  triggeringCard: 2,
  revealedThisTurn: [{ playerId: 'p0', card: 2 }],
  resolutionIndex: 0,
  hand: [17, 42],
  playerScores: { p0: 0, p1: 0 },
  playerCount: 2,
  round: 1,
  turn: 1,
  turnHistory: [],
};

// ── list_strategies ─────────────────────────────────────────────────

describe('listStrategies', () => {
  it('returns array containing "random"', () => {
    const result = listStrategies();
    const names = result.strategies.map(s => s.name);
    expect(names).toContain('random');
  });

  it('includes playerCountRange', () => {
    const result = listStrategies();
    expect(result.playerCountRange).toEqual({ min: 2, max: 10 });
  });

  it('each strategy has a description', () => {
    const result = listStrategies();
    for (const s of result.strategies) {
      expect(s.description).toBeTruthy();
    }
  });
});

// ── validate_state ──────────────────────────────────────────────────

describe('validateState', () => {
  it('valid CardChoiceState passes', () => {
    const result = validateState({ state: validCardState });
    expect(result.valid).toBe(true);
    expect(result.decision).toBe('card');
    expect(result.errors).toHaveLength(0);
  });

  it('valid RowChoiceState passes and auto-detects row', () => {
    const result = validateState({ state: validRowState });
    expect(result.valid).toBe(true);
    expect(result.decision).toBe('row');
    expect(result.errors).toHaveLength(0);
  });

  it('missing hand → errors array populated', () => {
    const { hand: _, ...noHand } = validCardState;
    const result = validateState({ state: noHand });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('hand'))).toBe(true);
  });

  it('card 105 → errors', () => {
    const state = { ...validCardState, hand: [105] };
    const result = validateState({ state });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('105'))).toBe(true);
  });

  it('card 0 → errors', () => {
    const state = { ...validCardState, hand: [0] };
    const result = validateState({ state });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('0'))).toBe(true);
  });

  it('board with 3 rows → errors', () => {
    const state = { ...validCardState, board: { rows: [[1], [2], [3]] } };
    const result = validateState({ state });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('4 rows'))).toBe(true);
  });

  it('warns when card appears in both hand and board', () => {
    const state = { ...validCardState, hand: [5, 17], board: { rows: [[5], [10], [20], [30]] } };
    const result = validateState({ state });
    expect(result.warnings.some(w => w.includes('5'))).toBe(true);
  });

  it('respects explicit decision override', () => {
    const result = validateState({ state: validCardState, decision: 'card' });
    expect(result.decision).toBe('card');
  });
});

// ── recommend_once ──────────────────────────────────────────────────

describe('recommendOnce', () => {
  it('card recommendation with "random" strategy returns card from hand', () => {
    const result = recommendOnce({ state: validCardState, strategy: 'random' });
    expect('ok' in result && result.ok).toBe(true);
    const rec = result as { ok: true; decision: string; recommendation: { card: number } };
    expect(rec.decision).toBe('card');
    expect((validCardState.hand as number[])).toContain(rec.recommendation.card);
  });

  it('row recommendation returns rowIndex 0-3', () => {
    const result = recommendOnce({ state: validRowState, strategy: 'random' });
    expect('ok' in result && result.ok).toBe(true);
    const rec = result as { ok: true; decision: string; recommendation: { rowIndex: number } };
    expect(rec.decision).toBe('row');
    expect(rec.recommendation.rowIndex).toBeGreaterThanOrEqual(0);
    expect(rec.recommendation.rowIndex).toBeLessThanOrEqual(3);
  });

  it('invalid strategy → DomainError with INVALID_STRATEGY', () => {
    const result = recommendOnce({ state: validCardState, strategy: 'nonexistent' });
    expect('ok' in result && result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('INVALID_STRATEGY');
  });

  it('invalid state → DomainError with INVALID_STATE', () => {
    const result = recommendOnce({ state: { hand: [999] }, strategy: 'random' });
    expect('ok' in result && result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('INVALID_STATE');
  });

  it('result includes stateValid and stateWarnings', () => {
    const result = recommendOnce({ state: validCardState, strategy: 'random' });
    const rec = result as { stateValid: boolean; stateWarnings: string[] };
    expect(rec.stateValid).toBe(true);
    expect(Array.isArray(rec.stateWarnings)).toBe(true);
  });
});
