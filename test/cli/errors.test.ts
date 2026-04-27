import { describe, it, expect } from 'vitest';
import { runCli } from './_helpers.js';

describe('CLI: error handling', () => {
  it('INVALID_STRATEGY: unknown strategy with suggestion', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', 'rnadom,random', '--format', 'json',
    ]);
    expect(exitCode).toBe(1);

    const data = JSON.parse(stdout);
    expect(data.error).toBe(true);
    expect(data.code).toBe('INVALID_STRATEGY');
    expect(data.message).toContain('rnadom');
    expect(Array.isArray(data.validValues)).toBe(true);
  });

  it('INVALID_STRATEGY: completely unknown strategy', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', 'nonexistent,random', '--format', 'json',
    ]);
    expect(exitCode).toBe(1);

    const data = JSON.parse(stdout);
    expect(data.error).toBe(true);
    expect(data.code).toBe('INVALID_STRATEGY');
  });

  it('INVALID_PLAYER_COUNT: only 1 strategy', () => {
    const { stdout, exitCode } = runCli([
      'simulate', '--strategies', 'random', '--format', 'json',
    ]);
    expect(exitCode).toBe(1);

    const data = JSON.parse(stdout);
    expect(data.error).toBe(true);
    expect(data.code).toBe('INVALID_PLAYER_COUNT');
  });

  it('INVALID_FORMAT: unsupported format', () => {
    const { stdout, stderr, exitCode } = runCli([
      'simulate', '--strategies', 'random,random', '--format', 'xml',
    ]);
    expect(exitCode).toBe(1);

    // Format error may be output as text since the format itself is invalid
    const output = stdout + stderr;
    expect(output).toContain('INVALID_FORMAT');
  });

  it('exit code 1 for validation errors', () => {
    const { exitCode } = runCli([
      'simulate', '--strategies', 'random', '--format', 'json',
    ]);
    expect(exitCode).toBe(1);
  });
}, { timeout: 30_000 });
