/**
 * Shared CLI helpers: error formatting, strategy parsing, Levenshtein matching.
 */
import type { OutputFormat, CliError, MetaEnvelope } from './formatters/types.js';

export function didYouMean(input: string, valid: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;

  for (const candidate of valid) {
    const dist = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDist && dist <= Math.max(input.length, candidate.length) * 0.6) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function outputError(
  fmt: OutputFormat,
  code: string,
  message: string,
  validValues?: string[],
): void {
  if (fmt === 'json') {
    const err: CliError = { error: true, code, message, ...(validValues ? { validValues } : {}) };
    console.log(JSON.stringify(err, null, 2));
  } else {
    console.error(`Error [${code}]: ${message}`);
    if (validValues && validValues.length > 0) {
      console.error(`Valid values: ${validValues.join(', ')}`);
    }
  }
}

export function createMeta(command: string, startTime: number): MetaEnvelope['meta'] {
  return {
    command,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
}

export function parseStrategies(raw: string): string[] {
  if (raw.startsWith('[')) {
    return JSON.parse(raw) as string[];
  }
  return raw.split(',').map((s) => s.trim());
}
