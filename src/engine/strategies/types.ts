import type { CardNumber, CardChoiceState, RowChoiceState, Board } from '../types';

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

/**
 * Strategy interface — the contract between the game runner/player and a decision engine.
 *
 * Lifecycle (all optional hooks are called by the runner/player when available):
 *   onGameStart → [onRoundStart → onTurnResolved* → onRoundEnd]* → onGameEnd
 *
 * Strategies may implement any subset of these hooks. Stateless strategies
 * (dummy-min, dummy-max) can ignore all lifecycle and just implement chooseCard/chooseRow.
 * Stateful strategies (mcs, bayesian) use lifecycle to build card-counting state.
 * Future RL strategies may use onGameEnd for long-term learning signals.
 */
export interface Strategy {
  readonly name: string;

  /** Returns the resolved options (including defaults) for logging/debugging. */
  getOptions?(): Record<string, unknown>;

  /** Choose which card to play from hand. Called every turn. */
  chooseCard(state: CardChoiceState): CardNumber;

  /** Choose which row to take when our card is lower than all row tails. */
  chooseRow(state: RowChoiceState): 0 | 1 | 2 | 3;

  /** Called once at game start with player identity, count, and RNG source. */
  onGameStart?(config: {
    playerId: string;
    playerCount: number;
    rng: () => number;
  }): void;

  /** Called at the start of each round with the dealt hand and initial board. */
  onRoundStart?(info: {
    round: number;
    hand: readonly CardNumber[];
    board: Board;
  }): void;

  /** Called after each turn resolves with all played cards and resulting board. */
  onTurnResolved?(resolution: TurnResolution): void;

  /** Called at end of each round with current scores. */
  onRoundEnd?(scores: readonly { id: string; score: number }[]): void;

  /** Called once when the game ends with final scores. Useful for RL reward signals. */
  onGameEnd?(result: {
    scores: readonly { id: string; score: number }[];
    rounds: number;
    won: boolean;
  }): void;
}
