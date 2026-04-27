import { describe, it, expect } from 'vitest';
import { runGame } from '../../src/sim';
import type { SimConfig } from '../../src/sim';
import { strategies } from '../../src/engine';
import type { Strategy, TurnResolution } from '../../src/engine';
import type { CardChoiceState, RowChoiceState } from '../../src/engine';

type LifecycleEvent =
  | { type: 'onGameStart' }
  | { type: 'chooseCard'; turn: number }
  | { type: 'chooseRow'; turn: number }
  | { type: 'onTurnResolved'; turn: number }
  | { type: 'onRoundEnd' };

/**
 * Create a spy strategy factory that delegates to the real random strategy
 * but records lifecycle events.
 */
function createSpyStrategyFactory(log: LifecycleEvent[]): () => Strategy {
  return () => {
    const realFactory = strategies.get('random')!;
    const real = realFactory();
    let currentTurn = 0;

    return {
      name: 'spy',
      chooseCard(state: CardChoiceState) {
        currentTurn = state.turn;
        log.push({ type: 'chooseCard', turn: state.turn });
        return real.chooseCard(state);
      },
      chooseRow(state: RowChoiceState) {
        log.push({ type: 'chooseRow', turn: state.turn });
        return real.chooseRow(state);
      },
      onGameStart(config: {
        playerId: string;
        playerCount: number;
        rng: () => number;
      }) {
        log.push({ type: 'onGameStart' });
        real.onGameStart?.(config);
      },
      onTurnResolved(resolution: TurnResolution) {
        log.push({ type: 'onTurnResolved', turn: resolution.turn });
        real.onTurnResolved?.(resolution);
      },
      onRoundEnd(scores: readonly { id: string; score: number }[]) {
        log.push({ type: 'onRoundEnd' });
        real.onRoundEnd?.(scores);
      },
    };
  };
}

describe('Lifecycle hook invocation order', () => {
  // We monkey-patch the strategies registry temporarily
  const originalGet = strategies.get.bind(strategies);
  const originalHas = strategies.has.bind(strategies);

  function runWithSpy(
    log: LifecycleEvent[],
    seed: string,
    playerCount = 2,
  ) {
    const spyFactory = createSpyStrategyFactory(log);

    // Monkey-patch strategies map to return our spy for 'spy' strategy
    const patchedStrategies = strategies as Map<string, () => Strategy>;
    patchedStrategies.set('spy', spyFactory);

    try {
      const config: SimConfig = {
        players: [
          { id: 'spy-player', strategy: 'spy' },
          ...Array.from({ length: playerCount - 1 }, (_, i) => ({
            id: `p${i}`,
            strategy: 'random',
          })),
        ],
        seed,
      };
      return runGame(config);
    } finally {
      patchedStrategies.delete('spy');
    }
  }

  it('onGameStart is called exactly once per game', () => {
    const log: LifecycleEvent[] = [];
    runWithSpy(log, 'lifecycle-once');

    const gameStarts = log.filter((e) => e.type === 'onGameStart');
    expect(gameStarts).toHaveLength(1);
  });

  it('onGameStart is the first lifecycle event', () => {
    const log: LifecycleEvent[] = [];
    runWithSpy(log, 'lifecycle-first');

    expect(log[0].type).toBe('onGameStart');
  });

  it('onTurnResolved is called after each turn (10 times per round)', () => {
    const log: LifecycleEvent[] = [];
    const result = runWithSpy(log, 'lifecycle-turns');

    const turnResolved = log.filter((e) => e.type === 'onTurnResolved');
    // 10 turns per round × number of rounds
    expect(turnResolved).toHaveLength(result.rounds * 10);
  });

  it('onRoundEnd is called after each round', () => {
    const log: LifecycleEvent[] = [];
    const result = runWithSpy(log, 'lifecycle-rounds');

    const roundEnds = log.filter((e) => e.type === 'onRoundEnd');
    expect(roundEnds).toHaveLength(result.rounds);
  });

  it('lifecycle order: onGameStart → turns/onTurnResolved → onRoundEnd', () => {
    const log: LifecycleEvent[] = [];
    runWithSpy(log, 'lifecycle-order');

    // First event must be onGameStart
    expect(log[0].type).toBe('onGameStart');

    // After onGameStart, we should see alternating blocks of:
    // [chooseCard, ..., onTurnResolved] × 10, then onRoundEnd
    let i = 1; // skip onGameStart
    while (i < log.length) {
      // Each round: 10 turns, then onRoundEnd
      for (let turn = 0; turn < 10 && i < log.length; turn++) {
        // chooseCard happens once per turn for the spy player
        expect(log[i].type).toBe('chooseCard');
        i++;

        // Possibly chooseRow (only if spy must pick a row)
        if (i < log.length && log[i].type === 'chooseRow') {
          i++;
        }

        // onTurnResolved
        expect(log[i].type).toBe('onTurnResolved');
        i++;
      }

      // onRoundEnd
      if (i < log.length) {
        expect(log[i].type).toBe('onRoundEnd');
        i++;
      }
    }
  });

  it('chooseCard is called 10 times per round for the spy player', () => {
    const log: LifecycleEvent[] = [];
    const result = runWithSpy(log, 'lifecycle-cards');

    const cardChoices = log.filter((e) => e.type === 'chooseCard');
    expect(cardChoices).toHaveLength(result.rounds * 10);
  });
});
