/**
 * Benchmark: 1×mcs(relative) vs 3×mcs(self) vs 1×random (all N=100)
 * Tests whether relative scoring gives an edge when outnumbered by self-scoring peers.
 */
import { runGame } from '../src/sim/runner.js';

const GAMES = 100;
const SEED = 'rel-vs-self-2026';

const CONFIGS = [
  { label: 'mcs(rel)', strategy: 'mcs', options: { mcPerCard: 100, scoring: 'relative' } as Record<string, unknown> },
  { label: 'mcs(self-1)', strategy: 'mcs', options: { mcPerCard: 100, scoring: 'self' } as Record<string, unknown> },
  { label: 'mcs(self-2)', strategy: 'mcs', options: { mcPerCard: 100, scoring: 'self' } as Record<string, unknown> },
  { label: 'mcs(self-3)', strategy: 'mcs', options: { mcPerCard: 100, scoring: 'self' } as Record<string, unknown> },
  { label: 'random', strategy: 'random', options: {} as Record<string, unknown> },
];

const stats = CONFIGS.map(() => ({ wins: 0, totalScore: 0, totalRank: 0 }));

for (let g = 0; g < GAMES; g++) {
  const result = runGame({
    players: CONFIGS.map((cfg, i) => ({ id: `p${i}`, strategy: cfg.strategy, strategyOptions: cfg.options })),
    seed: `${SEED}-${g}`,
  });
  for (const pr of result.playerResults) {
    const idx = parseInt(pr.id.slice(1), 10);
    stats[idx].totalScore += pr.finalScore;
    stats[idx].totalRank += pr.rank;
    if (pr.rank === 1) stats[idx].wins++;
  }
}

console.log('Strategy          | Win% | AvgScore | AvgRank');
console.log('------------------|------|----------|--------');
for (let i = 0; i < CONFIGS.length; i++) {
  const s = stats[i];
  console.log(
    `${CONFIGS[i].label.padEnd(18)}| ${((s.wins / GAMES) * 100).toFixed(1).padStart(4)}%| ${(s.totalScore / GAMES).toFixed(1).padStart(8)}| ${(s.totalRank / GAMES).toFixed(2).padStart(6)}`
  );
}
