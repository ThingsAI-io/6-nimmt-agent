import type { CardNumber, CardChoiceState, RowChoiceState } from '../types';

/** Resolution data passed to onTurnResolved(). Structurally identical to TurnHistoryEntry. */
export interface TurnResolution {
  readonly turn: number;
  readonly plays: readonly { playerId: string; card: CardNumber }[];
  readonly resolutions: readonly {
    playerId: string;
    card: CardNumber;
    rowIndex: number;
    causedOverflow: boolean;
    collectedCards?: readonly CardNumber[];
  }[];
  readonly rowPicks: readonly {
    playerId: string;
    rowIndex: number;
    collectedCards: readonly CardNumber[];
  }[];
  readonly boardAfter: readonly CardNumber[][];
}

export interface Strategy {
  readonly name: string;
  chooseCard(state: CardChoiceState): CardNumber;
  chooseRow(state: RowChoiceState): 0 | 1 | 2 | 3;
  onGameStart?(config: {
    playerId: string;
    playerCount: number;
    rng: () => number;
  }): void;
  onTurnResolved?(resolution: TurnResolution): void;
  onRoundEnd?(scores: readonly { id: string; score: number }[]): void;
}
