import type { SimulateResult, StrategiesResult, CompeteResult } from './types.js';

export function formatCsv(data: SimulateResult | StrategiesResult | CompeteResult): string {
  if ('elo' in data && 'pool' in data) {
    return formatCompeteCsv(data as CompeteResult);
  }

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
  const header = 'seat,playerId,strategy,wins,winRate,avgScore,avgWinningScore,medianScore,minScore,maxScore,scoreStdDev';
  const rows = data.perSeat.map((r) =>
    [
      r.seatIndex,
      escapeCsvField(r.playerId),
      escapeCsvField(r.strategy),
      r.wins,
      r.winRate,
      r.avgScore,
      r.avgWinningScore ?? '',
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

function formatCompeteCsv(data: CompeteResult): string {
  const header = 'strategy,elo,gamesPlayed,ratingStdDev,wins,winRate,avgScore,medianScore,minScore,maxScore,scoreStdDev';
  const eloMap = new Map(data.elo.map((e) => [e.strategy, e]));
  const rows = data.results.map((r) => {
    const e = eloMap.get(r.strategy);
    return [
      escapeCsvField(r.strategy),
      e?.rating.toFixed(1) ?? '',
      e?.gamesPlayed ?? '',
      e?.ratingStdDev.toFixed(1) ?? '',
      r.wins,
      r.winRate,
      r.avgScore,
      r.medianScore,
      r.minScore,
      r.maxScore,
      r.scoreStdDev,
    ].join(',');
  });
  return [header, ...rows].join('\n');
}
