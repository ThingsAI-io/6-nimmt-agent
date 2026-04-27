import { describe, it, expect } from 'vitest';
import { runCli } from './_helpers.js';

describe('CLI: strategies', () => {
  it('returns JSON with strategies array and usage block', () => {
    const { stdout, exitCode } = runCli(['strategies', '--format', 'json']);
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.meta).toBeDefined();
    expect(data.meta.command).toBe('strategies');
    expect(Array.isArray(data.strategies)).toBe(true);
    expect(data.strategies.length).toBeGreaterThan(0);
    expect(data.usage).toBeDefined();
  });

  it('usage block has correct fields', () => {
    const { stdout } = runCli(['strategies', '--format', 'json']);
    const data = JSON.parse(stdout);

    expect(data.usage.simulateExample).toContain('simulate');
    expect(data.usage.playerCountRange).toEqual({ min: 2, max: 10 });
    expect(data.usage.strategyNamesCaseSensitive).toBe(true);
  });

  it('"random" strategy is listed with a description', () => {
    const { stdout } = runCli(['strategies', '--format', 'json']);
    const data = JSON.parse(stdout);

    const random = data.strategies.find((s: { name: string }) => s.name === 'random');
    expect(random).toBeDefined();
    expect(typeof random.description).toBe('string');
    expect(random.description.length).toBeGreaterThan(0);
  });
}, { timeout: 30_000 });
