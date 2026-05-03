/**
 * Multi-player ELO rating system for 6 Nimmt! strategy benchmarking.
 *
 * Standard chess ELO with pairwise decomposition for multi-player games:
 * - Initial rating: 1500
 * - K-factor: 32 (constant, no elastic period)
 * - D (scaling): 400 (400-point diff → 10:1 expected odds)
 * - N-player normalization: ÷(N−1) to stabilize across 2–10 player games
 *
 * Note: This differs from BGA's ELO (elastic K=60→40, K×N/2 scaling, 600 cap).
 * We use standard chess ELO for reproducibility and academic comparability.
 *
 * See spec/strategies/elo.md for the full specification.
 */
import type { EloConfig, EloSnapshot, EloGameInput } from './types';

// ── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_ELO_CONFIG: EloConfig = {
  initialRating: 1500,
  K: 32,
  D: 400,
};

// ── Core Functions ────────────────────────────────────────────────────

/**
 * Compute player's expected score against all opponents (pairwise sum).
 * Returns value in [0, N-1] where N-1 is the number of opponents.
 */
export function computeExpectedScore(
  playerRating: number,
  opponentRatings: readonly number[],
  D: number = DEFAULT_ELO_CONFIG.D,
): number {
  let expected = 0;
  for (const oppRating of opponentRatings) {
    expected += 1 / (1 + 10 ** ((oppRating - playerRating) / D));
  }
  return expected;
}

/**
 * Compute player's actual score from game ranks (pairwise sum).
 * Win = 1, Tie = 0.5, Loss = 0 against each opponent.
 * Returns value in [0, N-1].
 */
export function computeActualScore(
  playerRank: number,
  allRanks: readonly number[],
  playerIndex: number,
): number {
  let actual = 0;
  for (let j = 0; j < allRanks.length; j++) {
    if (j === playerIndex) continue;
    if (playerRank < allRanks[j]) actual += 1;
    else if (playerRank === allRanks[j]) actual += 0.5;
    // playerRank > allRanks[j] → 0 (loss)
  }
  return actual;
}

/**
 * Convert penalty scores to fractional ranks (1 = best, lowest penalty).
 * Ties get the average of the ranks they would span.
 *
 * Example: scores [5, 10, 10, 20] → ranks [1, 2.5, 2.5, 4]
 */
export function rankFromScores(penaltyScores: readonly number[]): number[] {
  const n = penaltyScores.length;
  const indexed = penaltyScores.map((score, i) => ({ score, i }));
  indexed.sort((a, b) => a.score - b.score);

  const ranks = new Array<number>(n);
  let pos = 0;
  while (pos < n) {
    // Find the range of tied scores
    let end = pos + 1;
    while (end < n && indexed[end].score === indexed[pos].score) end++;

    // Average rank for tied positions (1-indexed)
    const avgRank = (pos + 1 + end) / 2;
    for (let k = pos; k < end; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    pos = end;
  }

  return ranks;
}

/**
 * Create an initial ELO snapshot with no ratings tracked yet.
 */
export function createEloSnapshot(config?: Partial<EloConfig>): EloSnapshot {
  return {
    ratings: new Map(),
    totalGames: 0,
    config: { ...DEFAULT_ELO_CONFIG, ...config },
  };
}

/**
 * Process one game result through the ELO system.
 *
 * Each player seat is tracked under its strategy name. When multiple seats
 * share a strategy, each seat's result contributes independently to the
 * strategy's rating (averaged across seats).
 */
export function updateRatings(
  snapshot: EloSnapshot,
  game: EloGameInput,
): EloSnapshot {
  const { config } = snapshot;
  const n = game.players.length;
  if (n < 2) return snapshot;

  // Compute fractional ranks from penalty scores
  const penaltyScores = game.players.map((p) => p.penaltyScore);
  const ranks = rankFromScores(penaltyScores);

  // Get current ratings for each seat (initialize if new strategy)
  const ratings = new Map(snapshot.ratings);
  const seatRatings = game.players.map((p) => {
    const existing = ratings.get(p.strategy);
    return existing?.rating ?? config.initialRating;
  });

  // Compute rating deltas per seat
  const deltas = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const strategy = game.players[i].strategy;
    const opponentRatings = seatRatings.filter((_, j) => j !== i);
    const expected = computeExpectedScore(seatRatings[i], opponentRatings, config.D);
    const actual = computeActualScore(ranks[i], ranks, i);

    // Normalize by (N-1) to stabilize K across player counts
    const delta = (config.K * (actual - expected)) / (n - 1);

    if (!deltas.has(strategy)) deltas.set(strategy, []);
    deltas.get(strategy)!.push(delta);
  }

  // Apply average delta per strategy
  for (const [strategy, stratDeltas] of deltas) {
    const avgDelta =
      stratDeltas.reduce((sum, d) => sum + d, 0) / stratDeltas.length;
    const existing = ratings.get(strategy);
    const oldRating = existing?.rating ?? config.initialRating;
    const newRating = oldRating + avgDelta;

    ratings.set(strategy, {
      strategy,
      rating: newRating,
      gamesPlayed: (existing?.gamesPlayed ?? 0) + 1,
      history: [...(existing?.history ?? []), newRating],
    });
  }

  return {
    ratings,
    totalGames: snapshot.totalGames + 1,
    config,
  };
}
