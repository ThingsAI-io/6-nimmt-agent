/**
 * Benchmark MCS strategy variants head-to-head in a 5-player game.
 * MCS(N=10) vs MCS(N=20) vs MCS(N=50) vs MCS(N=100) vs Random.
 * Each MCS variant uses elastic budget (mcMax = 10×mcPerCard, never clips).
 *
 * Usage: npx tsx scripts/bench-mcs.ts [--games 100] [--seed benchSeed]
 */

import { runGame } from '../src/sim/runner.js';

const GAMES = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') ?? '100', 10);
const SEED = process.argv.find((_, i, a) => a[i - 1] === '--seed') ?? 'mcs-bench-2026';

const CONFIGS = [
  { label: 'mcs(N=10)',  strategy: 'mcs', options: { mcPerCard: 10 } as Record<string, unknown> },
  { label: 'mcs(N=20)',  strategy: 'mcs', options: { mcPerCard: 20 } as Record<string, unknown> },
  { label: 'mcs(N=50)',  strategy: 'mcs', options: { mcPerCard: 50 } as Record<string, unknown> },
  { label: 'mcs(N=100)', strategy: 'mcs', options: { mcPerCard: 100 } as Record<string, unknown> },
  { label: 'random',     strategy: 'random', options: {} as Record<string, unknown> },
];

// Track per-player stats
const stats = CONFIGS.map(() => ({ wins: 0, totalScore: 0, totalRank: 0 }));

// Measure ms/turn for each strategy in isolation (run solo vs 4 randoms)
function measureMsPerTurn(cfg: typeof CONFIGS[0]): number {
  const games = 10;
  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    runGame({
      players: [
        { id: 'p0', strategy: cfg.strategy, strategyOptions: cfg.options },
        { id: 'p1', strategy: 'random' },
        { id: 'p2', strategy: 'random' },
        { id: 'p3', strategy: 'random' },
        { id: 'p4', strategy: 'random' },
      ],
      seed: `timing-${cfg.label}-${g}`,
    });
  }
  const elapsed = Date.now() - t0;
  // ~10 turns per game, divide total by (turns × games) for ms per turn
  return elapsed / (10 * games);
}

// Measure ms/turn for each config (solo timing to isolate)
console.log('Measuring per-turn timing...');
const timings = CONFIGS.map(cfg => measureMsPerTurn(cfg));

// Main benchmark: head-to-head
const start = Date.now();

for (let g = 0; g < GAMES; g++) {
  const result = runGame({
    players: CONFIGS.map((cfg, i) => ({
      id: `p${i}`,
      strategy: cfg.strategy,
      strategyOptions: cfg.options,
    })),
    seed: `${SEED}-${g}`,
  });

  for (const pr of result.playerResults) {
    const idx = parseInt(pr.id.slice(1), 10);
    stats[idx].totalScore += pr.finalScore;
    stats[idx].totalRank += pr.rank;
    if (pr.rank === 1) stats[idx].wins++;
  }
}

const elapsed = Date.now() - start;

// Output results
console.log(`\nMCS Head-to-Head Benchmark — ${GAMES} games, seed: "${SEED}"`);
console.log(`Completed in ${(elapsed / 1000).toFixed(1)}s\n`);
console.log(`${'Strategy'.padEnd(16)} ${'Win%'.padStart(7)} ${'AvgScore'.padStart(9)} ${'AvgRank'.padStart(8)} ${'ms/turn'.padStart(8)}`);
console.log(`${'─'.repeat(16)} ${'─'.repeat(7)} ${'─'.repeat(9)} ${'─'.repeat(8)} ${'─'.repeat(8)}`);

for (let i = 0; i < CONFIGS.length; i++) {
  const s = stats[i];
  const winRate = ((s.wins / GAMES) * 100).toFixed(1);
  const avgScore = (s.totalScore / GAMES).toFixed(1);
  const avgRank = (s.totalRank / GAMES).toFixed(2);
  const msPerTurn = timings[i].toFixed(2);
  console.log(
    `${CONFIGS[i].label.padEnd(16)} ${winRate.padStart(6)}% ${avgScore.padStart(9)} ${avgRank.padStart(8)} ${msPerTurn.padStart(8)}`
  );
}

console.log(`\nKey: N = mcPerCard (simulations per candidate card)`);
console.log(`Budget: mcMax = 10×N (elastic, never clips)`);
console.log(`Lower score = better. Rank 1 = winner.`);
console.log(`ms/turn = avg wall-clock time per turn for that strategy (measured in isolation).`);
