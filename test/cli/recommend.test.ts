import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './_helpers.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const TEMP_DIR = resolve(__dirname, '../../');

const cardState = {
  hand: [3, 17, 42, 55, 67],
  board: { rows: [[5], [10], [20], [30]] },
  playerScores: { p0: 0, p1: 0 },
  playerCount: 2,
  round: 1,
  turn: 1,
  turnHistory: [],
  initialBoardCards: { rows: [[5], [10], [20], [30]] },
};

const rowState = {
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

function writeTempState(name: string, data: object): string {
  const filePath = resolve(TEMP_DIR, name);
  writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  return filePath;
}

const tempFiles: string[] = [];

afterEach(() => {
  for (const f of tempFiles) {
    if (existsSync(f)) unlinkSync(f);
  }
  tempFiles.length = 0;
});

describe('CLI: recommend', () => {
  it('card recommendation via --state-file returns valid JSON', () => {
    const filePath = writeTempState('_test_card_state.json', cardState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'random', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.meta.command).toBe('recommend');
    expect(data.decision).toBe('card');
    expect(data.strategy).toBe('random');
    expect(cardState.hand).toContain(data.recommendation.card);
    expect(data.stateValid).toBe(true);
  });

  it('row recommendation via --state-file returns valid JSON', () => {
    const filePath = writeTempState('_test_row_state.json', rowState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'random', '--decision', 'row', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.decision).toBe('row');
    expect(data.recommendation.rowIndex).toBeGreaterThanOrEqual(0);
    expect(data.recommendation.rowIndex).toBeLessThanOrEqual(3);
  });

  it('auto-detects row decision when triggeringCard is present', () => {
    const filePath = writeTempState('_test_auto_row.json', rowState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'random', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.decision).toBe('row');
  });

  it('auto-detects card decision when triggeringCard is absent', () => {
    const filePath = writeTempState('_test_auto_card.json', cardState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'random', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.decision).toBe('card');
  });

  it('INVALID_STATE: missing required fields', () => {
    const badState = { hand: [1, 2, 3] }; // missing board, playerScores, etc.
    const filePath = writeTempState('_test_bad_state.json', badState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'random', '--format', 'json',
    ]);
    expect(exitCode).toBe(1);

    const data = JSON.parse(stdout);
    expect(data.error).toBe(true);
    expect(data.code).toBe('INVALID_STATE');
    expect(data.message).toContain('Missing required fields');
  });

  it('INVALID_STATE: --decision row with card state missing row fields', () => {
    const filePath = writeTempState('_test_incompat.json', cardState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'random', '--decision', 'row', '--format', 'json',
    ]);
    expect(exitCode).toBe(1);

    const data = JSON.parse(stdout);
    expect(data.error).toBe(true);
    expect(data.code).toBe('INVALID_STATE');
    expect(data.message).toContain('Missing required fields');
  });

  it('state from file works end-to-end', () => {
    const filePath = writeTempState('_test_file_state.json', cardState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'random', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.recommendation).toBeDefined();
    expect(data.recommendation.card).toBeDefined();
  });

  it('INVALID_STRATEGY for recommend', () => {
    const filePath = writeTempState('_test_bad_strat.json', cardState);
    tempFiles.push(filePath);

    const { stdout, exitCode } = runCli([
      'recommend', '--state-file', filePath, '--strategy', 'bogus', '--format', 'json',
    ]);
    expect(exitCode).toBe(1);

    const data = JSON.parse(stdout);
    expect(data.error).toBe(true);
    expect(data.code).toBe('INVALID_STRATEGY');
  });
}, { timeout: 60_000 });
