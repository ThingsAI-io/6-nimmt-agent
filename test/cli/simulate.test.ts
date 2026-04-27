import { describe, it, expect } from 'vitest';
import { runCli } from './_helpers.js';

describe('CLI: simulate', () => {
  it('produces valid JSON with correct schema', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', 'random,random', '--games', '5', '--seed', 'test', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.meta).toBeDefined();
    expect(data.meta.command).toBe('simulate');
    expect(data.meta.version).toBe('1.0.0');
    expect(typeof data.meta.timestamp).toBe('string');
    expect(typeof data.meta.durationMs).toBe('number');
    expect(data.gamesPlayed).toBe(5);
    expect(data.strategies).toEqual(['random', 'random']);
    expect(data.seed).toBe('test');
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);

    const row = data.results[0];
    expect(row).toHaveProperty('strategy');
    expect(row).toHaveProperty('wins');
    expect(row).toHaveProperty('winRate');
    expect(row).toHaveProperty('avgScore');
    expect(row).toHaveProperty('medianScore');
    expect(row).toHaveProperty('minScore');
    expect(row).toHaveProperty('maxScore');
    expect(row).toHaveProperty('scoreStdDev');
  });

  it('supports 5 players', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', 'random,random,random,random,random',
      '--games', '10', '--seed', 'abc', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.gamesPlayed).toBe(10);
    expect(data.strategies).toHaveLength(5);
  });

  it('--dry-run outputs config without running', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', 'random,random', '--games', '5', '--seed', 'dry', '--dry-run',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.dryRun).toBe(true);
    expect(data.strategies).toEqual(['random', 'random']);
    expect(data.games).toBe(5);
    expect(data.seed).toBe('dry');
  });

  it('--games defaults to 100 when omitted (via dry-run)', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', 'random,random', '--seed', 'x', '--dry-run',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.games).toBe(100);
  });

  it('accepts JSON array format for strategies', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', '["random","random"]', '--games', '3', '--seed', 'json-arr', '--format', 'json',
    ]);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.strategies).toEqual(['random', 'random']);
    expect(data.gamesPlayed).toBe(3);
  });

  it('same seed produces same results (determinism)', () => {
    const args = [
      'simulate', '--strategies', 'random,random', '--games', '5', '--seed', 'deterministic', '--format', 'json',
    ];
    const run1 = JSON.parse(runCli(args).stdout);
    const run2 = JSON.parse(runCli(args).stdout);

    expect(run1.results).toEqual(run2.results);
  });
}, { timeout: 60_000 });
