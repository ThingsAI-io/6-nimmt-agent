/**
 * Structured logger for headless player actions.
 */

export interface LogEntry {
  event: string;
  [key: string]: unknown;
}

/**
 * Log an action as structured JSON to stdout.
 * Gated by verbose — not emitted in silent mode.
 */
export function log(entry: LogEntry, verbose: boolean = true): void {
  if (!verbose) return;
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ ...entry, timestamp }));
}

/**
 * Log an error event to stderr always — regardless of verbose flag.
 * Errors are never silenced because they are critical for debugging.
 */
export function logError(entry: LogEntry): void {
  const timestamp = new Date().toISOString();
  console.error(JSON.stringify({ ...entry, timestamp }));
}
