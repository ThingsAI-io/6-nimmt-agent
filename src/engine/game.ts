/**
 * Game lifecycle: pure, immutable operations for 6 Nimmt! game management.
 */
import type {
  Board,
  CardNumber,
  GameState,
  PlayerState,
  PlayCardMove,
  PlacementResult,
  TurnHistoryEntry,
  TurnResolutionResult,
} from './types';
import type { MustPickRow } from './board';
import { createDeck, cattleHeads } from './card';
import { determinePlacement, placeCard, collectRow } from './board';

// ── Helpers ────────────────────────────────────────────────────────────

function isMustPickRow(
  result: PlacementResult | MustPickRow,
): result is MustPickRow {
  return 'kind' in result;
}

// ── createGame ─────────────────────────────────────────────────────────

export function createGame(playerIds: string[], seed: string): GameState {
  if (playerIds.length < 2 || playerIds.length > 10) {
    throw new Error(
      `Invalid player count: ${playerIds.length}. Must be 2–10.`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Duplicate player IDs.');
  }
  if (!seed) {
    throw new Error('Seed must be non-empty.');
  }

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    hand: [],
    collected: [],
    score: 0,
  }));

  const emptyRow: readonly CardNumber[] = [];
  const board: Board = {
    rows: [emptyRow, emptyRow, emptyRow, emptyRow],
  };

  return {
    players,
    board,
    deck: createDeck(seed, 0),
    round: 1,
    turn: 0,
    phase: 'round-over',
    seed,
    turnHistory: [],
    initialBoardCards: board,
  };
}

// ── dealRound ──────────────────────────────────────────────────────────

export function dealRound(state: GameState): GameState {
  if (state.phase !== 'round-over') {
    throw new Error(
      `Cannot deal: phase is "${state.phase}", expected "round-over".`,
    );
  }

  const playerCount = state.players.length;
  const deck = createDeck(state.seed, state.round);

  // Deal 10 cards to each player (sequential from deck), then 4 for board
  const hands: CardNumber[][] = [];
  for (let p = 0; p < playerCount; p++) {
    const hand = deck.slice(p * 10, (p + 1) * 10);
    hand.sort((a, b) => a - b);
    hands.push(hand);
  }

  const boardStart = playerCount * 10;
  const boardCards = deck.slice(boardStart, boardStart + 4);
  const board: Board = {
    rows: [
      [boardCards[0]],
      [boardCards[1]],
      [boardCards[2]],
      [boardCards[3]],
    ],
  };

  const remainder = deck.slice(boardStart + 4);

  const players: PlayerState[] = state.players.map((p, i) => ({
    ...p,
    hand: hands[i],
    collected: [],
  }));

  return {
    ...state,
    players,
    board,
    deck: remainder,
    turn: 1,
    phase: 'awaiting-cards',
    turnHistory: [],
    initialBoardCards: board,
  };
}

// ── resolveTurn ────────────────────────────────────────────────────────

export function resolveTurn(
  state: GameState,
  plays: PlayCardMove[],
  rowPickFn: (playerId: string, state: GameState) => number,
): GameState {
  if (state.phase !== 'awaiting-cards') {
    throw new Error(
      `Cannot resolve: phase is "${state.phase}", expected "awaiting-cards".`,
    );
  }

  const playerCount = state.players.length;
  if (plays.length !== playerCount) {
    throw new Error(
      `Expected ${playerCount} plays, got ${plays.length}.`,
    );
  }

  // Build player lookup
  const playerMap = new Map(state.players.map((p) => [p.id, p]));

  // Validate: one card per player, card in hand
  const seenPlayers = new Set<string>();
  for (const play of plays) {
    if (seenPlayers.has(play.playerId)) {
      throw new Error(`Duplicate play from player "${play.playerId}".`);
    }
    seenPlayers.add(play.playerId);

    const player = playerMap.get(play.playerId);
    if (!player) {
      throw new Error(`Unknown player "${play.playerId}".`);
    }
    if (!player.hand.includes(play.card)) {
      throw new Error(
        `Card ${play.card} not in hand of player "${play.playerId}".`,
      );
    }
  }

  // Sort plays ascending by card number
  const sortedPlays = [...plays].sort((a, b) => a.card - b.card);

  // Track mutable board and scores during resolution
  let board = state.board;
  const scoreDeltas = new Map<string, number>();
  const collectedMap = new Map<string, CardNumber[]>();
  for (const p of state.players) {
    scoreDeltas.set(p.id, 0);
    collectedMap.set(p.id, []);
  }

  const resolutions: TurnResolutionResult['resolutions'][number][] = [];
  const rowPicks: TurnResolutionResult['rowPicks'][number][] = [];

  // Resolve each card sequentially
  for (const play of sortedPlays) {
    const result = determinePlacement(board, play.card);

    if (isMustPickRow(result)) {
      // Rule 4: player must pick a row
      const tempState: GameState = { ...state, board };
      const pickedRow = rowPickFn(play.playerId, tempState);
      const { newBoard, collected } = collectRow(board, pickedRow, play.card);
      board = newBoard;

      const penalty = collected.reduce((s, c) => s + cattleHeads(c), 0);
      scoreDeltas.set(play.playerId, scoreDeltas.get(play.playerId)! + penalty);
      collectedMap.get(play.playerId)!.push(...collected);

      resolutions.push({
        playerId: play.playerId,
        card: play.card,
        rowIndex: pickedRow,
        causedOverflow: false,
        collectedCards: [...collected],
      });
      rowPicks.push({ playerId: play.playerId, rowIndex: pickedRow });
    } else if (result.causedOverflow) {
      // Overflow: collect 5 cards, place triggering card
      const collected = result.collectedCards!;
      board = placeCard(board, play.card, result.rowIndex);

      const penalty = collected.reduce((s, c) => s + cattleHeads(c), 0);
      scoreDeltas.set(play.playerId, scoreDeltas.get(play.playerId)! + penalty);
      collectedMap.get(play.playerId)!.push(...collected);

      resolutions.push({
        playerId: play.playerId,
        card: play.card,
        rowIndex: result.rowIndex,
        causedOverflow: true,
        collectedCards: [...collected],
      });
    } else {
      // Normal placement
      board = placeCard(board, play.card, result.rowIndex);

      resolutions.push({
        playerId: play.playerId,
        card: play.card,
        rowIndex: result.rowIndex,
        causedOverflow: false,
      });
    }
  }

  // Remove played cards from hands, update scores
  const playedCardByPlayer = new Map(
    plays.map((p) => [p.playerId, p.card]),
  );

  const players: PlayerState[] = state.players.map((p) => ({
    ...p,
    hand: p.hand.filter((c) => c !== playedCardByPlayer.get(p.id)),
    collected: [...p.collected, ...collectedMap.get(p.id)!],
    score: p.score + scoreDeltas.get(p.id)!,
  }));

  const isFinalTurn = state.turn === 10;

  const turnEntry: TurnHistoryEntry = {
    turn: state.turn,
    plays: sortedPlays.map((p) => ({ playerId: p.playerId, card: p.card })),
    resolutions,
    rowPicks,
    boardAfter: board,
  };

  return {
    ...state,
    players,
    board,
    turn: isFinalTurn ? state.turn : state.turn + 1,
    phase: isFinalTurn ? 'round-over' : 'awaiting-cards',
    turnHistory: [...state.turnHistory, turnEntry],
  };
}

// ── scoreRound ─────────────────────────────────────────────────────────

export function scoreRound(state: GameState): GameState {
  if (state.phase !== 'round-over') {
    throw new Error(
      `Cannot score round: phase is "${state.phase}", expected "round-over".`,
    );
  }
  if (state.turn !== 10) {
    throw new Error(
      `Cannot score round: turn is ${state.turn}, expected 10.`,
    );
  }

  return {
    ...state,
    round: state.round + 1,
    turn: 0,
  };
}

// ── isGameOver ─────────────────────────────────────────────────────────

export function isGameOver(state: GameState): boolean {
  return state.players.some((p) => p.score >= 66);
}

// ── getWinners ─────────────────────────────────────────────────────────

export function getWinners(state: GameState): string[] {
  const minScore = Math.min(...state.players.map((p) => p.score));
  return state.players.filter((p) => p.score === minScore).map((p) => p.id);
}
