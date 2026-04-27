export interface MetaEnvelope {
  meta: {
    command: string;
    version: string;
    timestamp: string;
    durationMs: number;
  };
}

export interface SimulateResult extends MetaEnvelope {
  gamesPlayed: number;
  strategies: string[];
  seed: string;
  results: StrategyResultRow[];
}

export interface StrategyResultRow {
  strategy: string;
  seatIndices: number[];
  playerIds: string[];
  playerCount: number;
  wins: number;
  winRate: number;
  avgScore: number;
  medianScore: number;
  minScore: number;
  maxScore: number;
  scoreStdDev: number;
}

export interface StrategiesResult extends MetaEnvelope {
  strategies: { name: string; description: string }[];
  usage: {
    simulateExample: string;
    playerCountRange: { min: number; max: number };
    strategyNamesCaseSensitive: boolean;
  };
}

export interface PlayResult extends MetaEnvelope {
  seed: string;
  strategies: string[];
  rounds: PlayRound[];
  finalResults: PlayFinalResult[];
}

export interface PlayRound {
  round: number;
  initialBoard: number[][];
  turns: PlayTurn[];
  scores: PlayScore[];
}

export interface PlayTurn {
  turn: number;
  plays: { seatIndex: number; playerId: string; strategy: string; card: number }[];
  placements: { card: number; rowIndex: number; overflow: boolean; collectedCards?: number[] }[];
  rowPicks: { playerId: string; rowIndex: number; collectedCards: number[] }[];
}

export interface PlayScore {
  seatIndex: number;
  playerId: string;
  strategy: string;
  roundPenalty: number;
  totalScore: number;
}

export interface PlayFinalResult {
  seatIndex: number;
  playerId: string;
  strategy: string;
  finalScore: number;
  rank: number;
}

export interface RecommendResult extends MetaEnvelope {
  decision: 'card' | 'row';
  strategy: string;
  recommendation: CardRecommendation | RowRecommendation;
  stateValid: boolean;
  stateWarnings: string[];
}

export interface CardRecommendation {
  card: number;
  confidence: number | null;
  alternatives: { card: number; confidence: number }[];
}

export interface RowRecommendation {
  rowIndex: number;
  confidence: number | null;
  alternatives: { rowIndex: number; confidence: number }[];
}

export interface CliError {
  error: true;
  code: string;
  message: string;
  validValues?: string[];
}

export type OutputFormat = 'table' | 'json' | 'csv';
