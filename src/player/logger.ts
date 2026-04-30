/**
 * Structured logger for headless player actions.
 */

export interface LogEntry {
  event: string;
  [key: string]: unknown;
}

/**
 * Log an action as structured JSON to stdout.
 */
export function log(entry: LogEntry, verbose: boolean = true): void {
  if (!verbose) return;
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ ...entry, timestamp }));
}
