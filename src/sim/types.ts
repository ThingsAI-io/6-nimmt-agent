export interface SimConfig {
  readonly players: readonly {
    id: string;
    strategy: string;
    strategyOptions?: Record<string, unknown>;
  }[];
  readonly seed?: string;
}

export interface GameResult {
  readonly seed: string;
  readonly rounds: number;
  readonly playerResults: readonly PlayerResult[];
}

export interface PlayerResult {
  readonly id: string;
  readonly strategy: string;
  readonly finalScore: number;
  readonly rank: number;
}

export interface BatchResult {
  readonly gamesPlayed: number;
  readonly config: SimConfig;
  readonly perStrategy: ReadonlyMap<string, StrategyStats>;
  readonly gameResults: readonly GameResult[];
}

export interface StrategyStats {
  readonly wins: number;
  readonly winRate: number;
  readonly avgScore: number;
  readonly avgWinningScore: number | null;
  readonly medianScore: number;
  readonly minScore: number;
  readonly maxScore: number;
  readonly scoreStdDev: number;
}

// ── ELO Types ─────────────────────────────────────────────────────────

export interface EloConfig {
  /** Starting rating for new strategies. Default: 1500 */
  readonly initialRating: number;
  /** Development coefficient (K-factor). Default: 32 */
  readonly K: number;
  /** Scaling factor in expected score formula. Default: 400 */
  readonly D: number;
}

/** Per-strategy ELO tracking state */
export interface EloRating {
  readonly strategy: string;
  readonly rating: number;
  readonly gamesPlayed: number;
  readonly history: readonly number[];
}

/** Snapshot of all ratings at a point in time */
export interface EloSnapshot {
  readonly ratings: ReadonlyMap<string, EloRating>;
  readonly totalGames: number;
  readonly config: EloConfig;
}

/** Single game result for ELO processing */
export interface EloGameInput {
  readonly players: readonly {
    readonly strategy: string;
    readonly penaltyScore: number;
  }[];
}

// ── Competition Types ─────────────────────────────────────────────────

export interface CompetitionConfig {
  /** Strategy pool: each entry is a strategy name with optional options. */
  readonly pool: readonly {
    readonly strategy: string;
    readonly strategyOptions?: Record<string, unknown>;
  }[];
  /** Minimum players per game. Default: 3 */
  readonly minPlayers: number;
  /** Maximum players per game. Default: 6 */
  readonly maxPlayers: number;
  /** Total number of games to play. */
  readonly games: number;
  /** Base random seed for reproducibility. */
  readonly seed: string;
  /** ELO configuration overrides. */
  readonly eloConfig?: Partial<EloConfig>;
}

export interface CompetitionResult {
  readonly gamesPlayed: number;
  readonly config: CompetitionConfig;
  readonly perStrategy: ReadonlyMap<string, StrategyStats>;
  readonly elo: EloSnapshot;
  readonly gameResults: readonly GameResult[];
}
