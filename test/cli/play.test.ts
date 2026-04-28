import { describe, it, expect } from 'vitest';
import { runCli } from './_helpers.js';

describe('CLI: play', () => {
  it('produces valid JSON with rounds and finalResults', () => {
    const { stdout, exitCode } = runCli([
      'play', '--strategies', 'random,random', '--seed', 'test', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.meta).toBeDefined();
    expect(data.meta.command).toBe('play');
    expect(data.seed).toBe('test');
    expect(data.strategies).toEqual(['random', 'random']);
    expect(Array.isArray(data.rounds)).toBe(true);
    expect(data.rounds.length).toBeGreaterThan(0);
    expect(Array.isArray(data.finalResults)).toBe(true);
  });

  it('rounds have turns with plays and placements', () => {
    const { stdout } = runCli([
      'play', '--strategies', 'random,random', '--seed', 'test', '--format', 'json',
    ]);
    const data = JSON.parse(stdout);

    const round = data.rounds[0];
    expect(round.round).toBe(1);
    expect(Array.isArray(round.turns)).toBe(true);
    expect(round.turns.length).toBeGreaterThan(0);

    const turn = round.turns[0];
    expect(Array.isArray(turn.plays)).toBe(true);
    expect(Array.isArray(turn.placements)).toBe(true);
  });

  it('finalResults have rank, finalScore, strategy fields', () => {
    const { stdout } = runCli([
      'play', '--strategies', 'random,random', '--seed', 'test', '--format', 'json',
    ]);
    const data = JSON.parse(stdout);

    for (const result of data.finalResults) {
      expect(result).toHaveProperty('rank');
      expect(result).toHaveProperty('finalScore');
      expect(result).toHaveProperty('strategy');
      expect(typeof result.rank).toBe('number');
      expect(typeof result.finalScore).toBe('number');
      expect(typeof result.strategy).toBe('string');
    }
  });

  it('game terminates within timeout', () => {
    const { exitCode } = runCli([
      'play', '--strategies', 'random,random,random', '--seed', 'hang-test', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);
  });
}, { timeout: 60_000 });
