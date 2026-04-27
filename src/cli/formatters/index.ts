import type { OutputFormat } from './types.js';
import { formatJson } from './json.js';
import { formatTable } from './table.js';
import { formatCsv } from './csv.js';

export type * from './types.js';
export { formatJson } from './json.js';
export { formatTable } from './table.js';
export { formatCsv } from './csv.js';

export function format(data: Parameters<typeof formatJson>[0] | Parameters<typeof formatCsv>[0], fmt: OutputFormat): string {
  switch (fmt) {
    case 'json': return formatJson(data as Parameters<typeof formatJson>[0]);
    case 'table': return formatTable(data as Parameters<typeof formatTable>[0]);
    case 'csv': return formatCsv(data as Parameters<typeof formatCsv>[0]);
  }
}
