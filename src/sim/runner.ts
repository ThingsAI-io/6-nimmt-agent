/**
 * GameRunner: single-game simulator for 6 Nimmt!
 */
import { randomUUID } from 'node:crypto';
import type { CardNumber, GameState, RowChoiceState } from '../engine/types';
import type { Strategy, TurnResolution } from '../engine/strategies/types';
import {
  createGame,
  dealRound,
  resolveTurn,
  scoreRound,
  isGameOver,
  toCardChoiceState,
  strategies,
  cattleHeads,
  deriveSeedState,
  xoshiro256ss,
} from '../engine';
import type { SimConfig, GameResult, PlayerResult } from './types';

// ── Helpers ────────────────────────────────────────────────────────────

function createPlayerRng(seed: string, playerId: string): () => number {
  const state = deriveSeedState(seed + '/' + playerId);
  return () => Number(xoshiro256ss(state) >> 11n) / 2 ** 53;
}

/** Pick the row with fewest total cattle heads (tiebreak: lowest index). */
function fewestHeadsRow(gameState: GameState): 0 | 1 | 2 | 3 {
  let bestIndex = 0;
  let bestPenalty = Infinity;
  for (let i = 0; i < 4; i++) {
    const p = gameState.board.rows[i].reduce(
      (sum, c) => sum + cattleHeads(c),
      0,
    );
    if (p < bestPenalty) {
      bestPenalty = p;
      bestIndex = i;
    }
  }
  return bestIndex as 0 | 1 | 2 | 3;
}

function isValidRowIndex(v: unknown): v is 0 | 1 | 2 | 3 {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

// ── Build TurnResolution from history ──────────────────────────────────

function buildTurnResolution(state: GameState): TurnResolution {
  const entry = state.turnHistory[state.turnHistory.length - 1];
  return {
    turn: entry.turn,
    plays: entry.plays,
    resolutions: entry.resolutions,
    rowPicks: entry.rowPicks.map((rp) => ({
      playerId: rp.playerId,
      rowIndex: rp.rowIndex,
      collectedCards: [...rp.collectedCards],
    })),
    boardAfter: entry.boardAfter.rows.map((row) => [...row]),
  };
}

// ── Build RowChoiceState manually ──────────────────────────────────────

function buildRowChoiceState(
  playerId: string,
  triggeringCard: CardNumber,
  sortedPlays: readonly { playerId: string; card: CardNumber }[],
  gameState: GameState,
): RowChoiceState {
  const player = gameState.players.find((p) => p.id === playerId)!;
  const playerScores: Record<string, number> = {};
  for (const p of gameState.players) {
    playerScores[p.id] = p.score;
  }
  return {
    board: gameState.board,
    triggeringCard,
    revealedThisTurn: sortedPlays.map((p) => ({
      playerId: p.playerId,
      card: p.card,
    })),
    resolutionIndex: 0,
    hand: player.hand,
    playerScores,
    playerCount: gameState.players.length,
    round: gameState.round,
    turn: gameState.turn,
    turnHistory: gameState.turnHistory,
  };
}

// ── Main runner ────────────────────────────────────────────────────────

export function runGame(config: SimConfig): GameResult {
  const { players } = config;

  // 1. Validate
  if (players.length < 2 || players.length > 10) {
    throw new Error(
      `Invalid player count: ${players.length}. Must be 2–10.`,
    );
  }
  for (const p of players) {
    if (!strategies.has(p.strategy)) {
      throw new Error(`Unknown strategy "${p.strategy}".`);
    }
  }

  // 2. Seed
  const seed = config.seed ?? randomUUID();

  // 3. Create game
  const playerIds = players.map((p) => p.id);
  let state = createGame(playerIds, seed);

  // 4. Instantiate strategies
  const strategyMap = new Map<string, Strategy>();
  for (const p of players) {
    const factory = strategies.get(p.strategy)!;
    strategyMap.set(p.id, factory());
  }

  // 5. onGameStart
  for (const p of players) {
    const strat = strategyMap.get(p.id)!;
    strat.onGameStart?.({
      playerId: p.id,
      playerCount: players.length,
      rng: createPlayerRng(seed, p.id),
    });
  }

  // 6. Game loop
  let roundCount = 0;

  while (true) {
    // 6a. Deal round
    state = dealRound(state);
    roundCount++;

    // 6b. 10 turns
    for (let t = 0; t < 10; t++) {
      // Collect card choices
      const plays: { playerId: string; card: CardNumber }[] = [];
      for (const p of players) {
        const strat = strategyMap.get(p.id)!;
        const player = state.players.find((ps) => ps.id === p.id)!;
        let card: CardNumber;

        try {
          const choiceState = toCardChoiceState(state, p.id);
          const chosen = strat.chooseCard(choiceState);
          if (player.hand.includes(chosen)) {
            card = chosen;
          } else {
            console.warn(
              `Strategy "${p.strategy}" (${p.id}) returned card ${chosen} not in hand; using lowest.`,
            );
            card = player.hand[0]; // hand is sorted ascending
          }
        } catch (err) {
          console.warn(
            `Strategy "${p.strategy}" (${p.id}) threw in chooseCard: ${err}; using lowest card.`,
          );
          card = player.hand[0];
        }

        plays.push({ playerId: p.id, card });
      }

      // Sort plays for building revealedThisTurn
      const sortedPlays = [...plays].sort((a, b) => a.card - b.card);

      // Resolve turn with rowPickFn
      state = resolveTurn(
        state,
        plays,
        (playerId: string, tempState: GameState): number => {
          const strat = strategyMap.get(playerId)!;
          const play = sortedPlays.find((sp) => sp.playerId === playerId)!;

          try {
            const rowChoice = buildRowChoiceState(
              playerId,
              play.card,
              sortedPlays,
              tempState,
            );
            const chosen = strat.chooseRow(rowChoice);
            if (isValidRowIndex(chosen)) {
              return chosen;
            }
            console.warn(
              `Strategy "${strat.name}" (${playerId}) returned invalid row ${chosen}; using fewest-heads.`,
            );
            return fewestHeadsRow(tempState);
          } catch (err) {
            console.warn(
              `Strategy "${strat.name}" (${playerId}) threw in chooseRow: ${err}; using fewest-heads.`,
            );
            return fewestHeadsRow(tempState);
          }
        },
      );

      // onTurnResolved
      const resolution = buildTurnResolution(state);
      for (const p of players) {
        const strat = strategyMap.get(p.id)!;
        try {
          strat.onTurnResolved?.(resolution);
        } catch {
          // lifecycle errors are non-fatal
        }
      }
    }

    // 6c. Score round
    state = scoreRound(state);

    // 6d. onRoundEnd
    const scores = state.players.map((p) => ({ id: p.id, score: p.score }));
    for (const p of players) {
      const strat = strategyMap.get(p.id)!;
      try {
        strat.onRoundEnd?.(scores);
      } catch {
        // lifecycle errors are non-fatal
      }
    }

    // 6e. Check game over
    if (isGameOver(state)) break;
  }

  // 7. Build result with rankings
  const strategyById = new Map(players.map((p) => [p.id, p.strategy]));

  const sortedByScore = state.players
    .map((p) => ({ id: p.id, score: p.score }))
    .sort((a, b) => a.score - b.score);

  // Assign ranks: lowest score = rank 1, ties share same rank
  const playerResults: PlayerResult[] = [];
  let currentRank = 1;
  for (let i = 0; i < sortedByScore.length; i++) {
    if (i > 0 && sortedByScore[i].score > sortedByScore[i - 1].score) {
      currentRank = i + 1;
    }
    playerResults.push({
      id: sortedByScore[i].id,
      strategy: strategyById.get(sortedByScore[i].id)!,
      finalScore: sortedByScore[i].score,
      rank: currentRank,
    });
  }

  return {
    seed,
    rounds: roundCount,
    playerResults,
  };
}
