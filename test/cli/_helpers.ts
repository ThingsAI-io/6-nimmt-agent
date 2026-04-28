import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const CLI_PATH = resolve(__dirname, '../../src/cli/index.ts');

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(args: string[], options?: { input?: string }): CliResult {
  try {
    const result = execFileSync(
      process.execPath,
      ['--import', 'tsx/esm', CLI_PATH, ...args],
      {
        encoding: 'utf-8',
        input: options?.input,
        timeout: 30_000,
        env: { ...process.env, NO_COLOR: '1' },
      },
    );
    return { stdout: result, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}
