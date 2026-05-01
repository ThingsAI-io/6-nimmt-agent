/**
 * Benchmark MCS scoring modes: self vs relative.
 * 5-player game: mcs(self,N=50) vs mcs(relative,N=50) vs mcs(self,N=100) vs mcs(relative,N=100) vs random.
 *
 * Usage: npx tsx scripts/bench-scoring.ts [--games 100] [--seed scoreSeed]
 */

import { runGame } from '../src/sim/runner.js';

const GAMES = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') ?? '100', 10);
const SEED = process.argv.find((_, i, a) => a[i - 1] === '--seed') ?? 'scoring-bench-2026';

const CONFIGS = [
  { label: 'mcs(N=50,self)',  strategy: 'mcs', options: { mcPerCard: 50, scoring: 'self' } as Record<string, unknown> },
  { label: 'mcs(N=50,rel)',   strategy: 'mcs', options: { mcPerCard: 50, scoring: 'relative' } as Record<string, unknown> },
  { label: 'mcs(N=100,self)', strategy: 'mcs', options: { mcPerCard: 100, scoring: 'self' } as Record<string, unknown> },
  { label: 'mcs(N=100,rel)',  strategy: 'mcs', options: { mcPerCard: 100, scoring: 'relative' } as Record<string, unknown> },
  { label: 'random',          strategy: 'random', options: {} as Record<string, unknown> },
];

const stats = CONFIGS.map(() => ({ wins: 0, totalScore: 0, totalRank: 0 }));

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

console.log(`\nMCS Scoring Mode Benchmark — ${GAMES} games, seed: "${SEED}"`);
console.log(`Completed in ${(elapsed / 1000).toFixed(1)}s\n`);
console.log(`${'Strategy'.padEnd(20)} ${'Win%'.padStart(7)} ${'AvgScore'.padStart(9)} ${'AvgRank'.padStart(8)}`);
console.log(`${'─'.repeat(20)} ${'─'.repeat(7)} ${'─'.repeat(9)} ${'─'.repeat(8)}`);

for (let i = 0; i < CONFIGS.length; i++) {
  const s = stats[i];
  const winRate = ((s.wins / GAMES) * 100).toFixed(1);
  const avgScore = (s.totalScore / GAMES).toFixed(1);
  const avgRank = (s.totalRank / GAMES).toFixed(2);
  console.log(
    `${CONFIGS[i].label.padEnd(20)} ${winRate.padStart(6)}% ${avgScore.padStart(9)} ${avgRank.padStart(8)}`
  );
}

console.log(`\nKey: N = mcPerCard, self = minimize own penalty, rel = relative scoring`);
console.log(`Lower score = better. Rank 1 = winner.`);
