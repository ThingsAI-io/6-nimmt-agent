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
 * Respects existing timestamp if present; adds one otherwise.
 */
export function log(entry: LogEntry, verbose: boolean = true): void {
  if (!verbose) return;
  if (!entry.timestamp) {
    entry = { ...entry, timestamp: new Date().toISOString() };
  }
  console.log(JSON.stringify(entry));
}

/**
 * Log an error event to stderr always — regardless of verbose flag.
 * Errors are never silenced because they are critical for debugging.
 * Respects existing timestamp if present; adds one otherwise.
 */
export function logError(entry: LogEntry): void {
  if (!entry.timestamp) {
    entry = { ...entry, timestamp: new Date().toISOString() };
  }
  console.error(JSON.stringify(entry));
}
