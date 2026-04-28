import type {
  SimulateResult,
  StrategiesResult,
  PlayResult,
  RecommendResult,
  CliError,
} from './types.js';

type FormattableData = SimulateResult | StrategiesResult | PlayResult | RecommendResult | CliError;

export function formatTable(data: FormattableData): string {
  if ('error' in data && data.error) {
    return `Error [${data.code}]: ${data.message}`;
  }

  if ('results' in data && 'gamesPlayed' in data) {
    return formatSimulateTable(data as SimulateResult);
  }

  if ('strategies' in data && 'usage' in data) {
    return formatStrategiesTable(data as StrategiesResult);
  }

  if ('rounds' in data) {
    return formatPlayTable(data as PlayResult);
  }

  if ('recommendation' in data) {
    return formatRecommendTable(data as RecommendResult);
  }

  return JSON.stringify(data, null, 2);
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function formatSimulateTable(data: SimulateResult): string {
  const lines: string[] = [];

  // Per-seat breakdown (always shown)
  const seatHeaders = ['Seat', 'Player', 'Strategy', 'Wins', 'Win Rate', 'Avg Score', 'Median', 'Min', 'Max', 'StdDev'];
  const seatRows = data.perSeat.map((r) => [
    String(r.seatIndex),
    r.playerId,
    r.strategy,
    String(r.wins),
    (r.winRate * 100).toFixed(1) + '%',
    r.avgScore.toFixed(1),
    String(r.medianScore),
    String(r.minScore),
    String(r.maxScore),
    r.scoreStdDev.toFixed(1),
  ]);
  lines.push(renderTable(seatHeaders, seatRows));

  // Pooled summary (only if there are fewer unique strategies than seats)
  const uniqueStrategies = new Set(data.perSeat.map((r) => r.strategy));
  if (uniqueStrategies.size < data.perSeat.length) {
    lines.push('');
    lines.push('--- Pooled by Strategy ---');
    const headers = ['Strategy', 'Players', 'Wins', 'Win Rate', 'Avg Score', 'Median', 'Min', 'Max', 'StdDev'];
    const rows = data.results.map((r) => [
      r.strategy,
      String(r.playerCount),
      String(r.wins),
      (r.winRate * 100).toFixed(1) + '%',
      r.avgScore.toFixed(1),
      String(r.medianScore),
      String(r.minScore),
      String(r.maxScore),
      r.scoreStdDev.toFixed(1),
    ]);
    lines.push(renderTable(headers, rows));
  }

  return lines.join('\n');
}

function formatStrategiesTable(data: StrategiesResult): string {
  const headers = ['Name', 'Description'];
  const rows = data.strategies.map((s) => [s.name, s.description]);
  return renderTable(headers, rows);
}

function formatPlayTable(data: PlayResult): string {
  const lines: string[] = [];
  lines.push(`Seed: ${data.seed}`);
  lines.push(`Strategies: ${data.strategies.join(', ')}`);
  lines.push('');

  for (const round of data.rounds) {
    lines.push(`--- Round ${round.round} ---`);
    lines.push(`Board: ${round.initialBoard.map((row) => `[${row.join(', ')}]`).join(' ')}`);

    for (const turn of round.turns) {
      lines.push(`  Turn ${turn.turn}:`);
      for (const play of turn.plays) {
        lines.push(`    ${play.playerId} (${play.strategy}) plays ${play.card}`);
      }
      for (const placement of turn.placements) {
        const overflow = placement.overflow ? ' [OVERFLOW]' : '';
        lines.push(`    Card ${placement.card} -> row ${placement.rowIndex}${overflow}`);
      }
    }

    const scoreHeaders = ['Seat', 'Player', 'Strategy', 'Round Penalty', 'Total'];
    const scoreRows = round.scores.map((s) => [
      String(s.seatIndex),
      s.playerId,
      s.strategy,
      String(s.roundPenalty),
      String(s.totalScore),
    ]);
    lines.push(renderTable(scoreHeaders, scoreRows));
    lines.push('');
  }

  lines.push('=== Final Results ===');
  const finalHeaders = ['Rank', 'Player', 'Strategy', 'Score'];
  const finalRows = data.finalResults.map((r) => [
    String(r.rank),
    r.playerId,
    r.strategy,
    String(r.finalScore),
  ]);
  lines.push(renderTable(finalHeaders, finalRows));

  return lines.join('\n');
}

function formatRecommendTable(data: RecommendResult): string {
  const lines: string[] = [];
  lines.push(`Decision: ${data.decision}`);
  lines.push(`Strategy: ${data.strategy}`);

  if (data.decision === 'card') {
    const rec = data.recommendation as { card: number; confidence: number | null; alternatives: { card: number; confidence: number }[] };
    lines.push(`Recommended card: ${rec.card}`);
    if (rec.confidence !== null) {
      lines.push(`Confidence: ${(rec.confidence * 100).toFixed(1)}%`);
    }
    if (rec.alternatives.length > 0) {
      lines.push('Alternatives:');
      for (const alt of rec.alternatives) {
        lines.push(`  Card ${alt.card} (${(alt.confidence * 100).toFixed(1)}%)`);
      }
    }
  } else {
    const rec = data.recommendation as { rowIndex: number; confidence: number | null; alternatives: { rowIndex: number; confidence: number }[] };
    lines.push(`Recommended row: ${rec.rowIndex}`);
    if (rec.confidence !== null) {
      lines.push(`Confidence: ${(rec.confidence * 100).toFixed(1)}%`);
    }
    if (rec.alternatives.length > 0) {
      lines.push('Alternatives:');
      for (const alt of rec.alternatives) {
        lines.push(`  Row ${alt.rowIndex} (${(alt.confidence * 100).toFixed(1)}%)`);
      }
    }
  }

  if (data.stateWarnings.length > 0) {
    lines.push('Warnings:');
    for (const w of data.stateWarnings) {
      lines.push(`  - ${w}`);
    }
  }

  return lines.join('\n');
}

function renderTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) => {
    const dataMax = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0);
    return Math.max(h.length, dataMax);
  });

  const headerLine = headers.map((h, i) => padRight(h, colWidths[i])).join(' | ');
  const separatorLine = colWidths.map((w) => '-'.repeat(w)).join('-+-');
  const dataLines = rows.map((row) =>
    row.map((cell, i) => {
      // Right-align numbers
      if (/^[\d.]+%?$/.test(cell)) {
        return padLeft(cell, colWidths[i]);
      }
      return padRight(cell, colWidths[i]);
    }).join(' | '),
  );

  return [headerLine, separatorLine, ...dataLines].join('\n');
}
