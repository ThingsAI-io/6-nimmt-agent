/**
 * Benchmark MCS strategy variants head-to-head in a 5-player game.
 * MCS(N=10) vs MCS(N=20) vs MCS(N=50) vs MCS(N=100) vs Random.
 *
 * Usage: npx tsx scripts/bench-mcs.ts [--games 100] [--seed benchSeed]
 */

import { runGame } from '../src/sim/runner.js';

const GAMES = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') ?? '100', 10);
const SEED = process.argv.find((_, i, a) => a[i - 1] === '--seed') ?? 'mcs-bench-2026';

const PLAYERS = [
  { label: 'mcs(N=10)',  strategy: 'mcs', strategyOptions: { mcPerCard: 10 } },
  { label: 'mcs(N=20)',  strategy: 'mcs', strategyOptions: { mcPerCard: 20 } },
  { label: 'mcs(N=50)',  strategy: 'mcs', strategyOptions: { mcPerCard: 50 } },
  { label: 'mcs(N=100)', strategy: 'mcs', strategyOptions: { mcPerCard: 100 } },
  { label: 'random',     strategy: 'random' },
];

// Track per-player stats
const stats = PLAYERS.map(() => ({ wins: 0, totalScore: 0, totalRank: 0 }));

const start = Date.now();

for (let g = 0; g < GAMES; g++) {
  const result = runGame({
    players: PLAYERS.map((p, i) => ({
      id: `p${i}`,
      strategy: p.strategy,
      strategyOptions: p.strategyOptions,
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
console.log(`${'Strategy'.padEnd(16)} ${'Win%'.padStart(7)} ${'AvgScore'.padStart(9)} ${'AvgRank'.padStart(8)}`);
console.log(`${'─'.repeat(16)} ${'─'.repeat(7)} ${'─'.repeat(9)} ${'─'.repeat(8)}`);

for (let i = 0; i < PLAYERS.length; i++) {
  const s = stats[i];
  const winRate = ((s.wins / GAMES) * 100).toFixed(1);
  const avgScore = (s.totalScore / GAMES).toFixed(1);
  const avgRank = (s.totalRank / GAMES).toFixed(2);
  console.log(
    `${PLAYERS[i].label.padEnd(16)} ${winRate.padStart(6)}% ${avgScore.padStart(9)} ${avgRank.padStart(8)}`
  );
}

console.log(`\nKey: N = mcPerCard (simulations per candidate card)`);
console.log(`Lower score = better. Rank 1 = winner.`);
