import { describe, it, expect } from 'vitest';
import { runCli } from './_helpers.js';

describe('CLI: short aliases', () => {
  it('-s same as --strategies', () => {
    const full = runCli(['simulate', '--strategies', 'random,random', '--games', '3', '--seed', 'alias', '--format', 'json', '--dry-run']);
    const short = runCli(['simulate', '-s', 'random,random', '--games', '3', '--seed', 'alias', '--format', 'json', '--dry-run']);

    expect(full.exitCode).toBe(0);
    expect(short.exitCode).toBe(0);
    expect(JSON.parse(full.stdout).strategies).toEqual(JSON.parse(short.stdout).strategies);
  });

  it('-n same as --games', () => {
    const full = runCli(['simulate', '--strategies', 'random,random', '--games', '7', '--seed', 'alias', '--dry-run']);
    const short = runCli(['simulate', '--strategies', 'random,random', '-n', '7', '--seed', 'alias', '--dry-run']);

    expect(full.exitCode).toBe(0);
    expect(short.exitCode).toBe(0);
    expect(JSON.parse(full.stdout).games).toEqual(JSON.parse(short.stdout).games);
  });

  it('-S same as --seed', () => {
    const full = runCli(['simulate', '--strategies', 'random,random', '--games', '3', '--seed', 'alias-seed', '--format', 'json', '--dry-run']);
    const short = runCli(['simulate', '--strategies', 'random,random', '--games', '3', '-S', 'alias-seed', '--format', 'json', '--dry-run']);

    expect(full.exitCode).toBe(0);
    expect(short.exitCode).toBe(0);
    expect(JSON.parse(full.stdout).seed).toEqual(JSON.parse(short.stdout).seed);
  });

  it('-f same as --format', () => {
    const full = runCli(['simulate', '--strategies', 'random,random', '--games', '3', '--seed', 'alias', '--format', 'json']);
    const short = runCli(['simulate', '--strategies', 'random,random', '--games', '3', '--seed', 'alias', '-f', 'json']);

    expect(full.exitCode).toBe(0);
    expect(short.exitCode).toBe(0);
    // Both should produce parseable JSON
    expect(JSON.parse(full.stdout).gamesPlayed).toBe(JSON.parse(short.stdout).gamesPlayed);
  });
}, { timeout: 60_000 });
