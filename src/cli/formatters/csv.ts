import type { SimulateResult, StrategiesResult } from './types.js';

export function formatCsv(data: SimulateResult | StrategiesResult): string {
  if ('results' in data && 'gamesPlayed' in data) {
    return formatSimulateCsv(data as SimulateResult);
  }

  if ('strategies' in data && 'usage' in data) {
    return formatStrategiesCsv(data as StrategiesResult);
  }

  return '';
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatSimulateCsv(data: SimulateResult): string {
  const header = 'seat,playerId,strategy,wins,winRate,avgScore,medianScore,minScore,maxScore,scoreStdDev';
  const rows = data.perSeat.map((r) =>
    [
      r.seatIndex,
      escapeCsvField(r.playerId),
      escapeCsvField(r.strategy),
      r.wins,
      r.winRate,
      r.avgScore,
      r.medianScore,
      r.minScore,
      r.maxScore,
      r.scoreStdDev,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

function formatStrategiesCsv(data: StrategiesResult): string {
  const header = 'name,description';
  const rows = data.strategies.map((s) =>
    [escapeCsvField(s.name), escapeCsvField(s.description)].join(','),
  );
  return [header, ...rows].join('\n');
}
