/**
 * Core types for the 6 Nimmt! game engine.
 * All state types are deeply readonly (immutable engine contract).
 */

// ── Card ───────────────────────────────────────────────────────────────

/** Branded number type for valid card values (1–104). */
export type CardNumber = number & { readonly __brand: 'CardNumber' };

/** A single board row — immutable array of CardNumbers. */
export type Row = readonly CardNumber[];

/** The board: always exactly 4 rows. */
export interface Board {
  readonly rows: readonly [Row, Row, Row, Row];
}

// ── Player ─────────────────────────────────────────────────────────────

export interface PlayerState {
  readonly id: string;
  readonly hand: readonly CardNumber[];
  readonly collected: readonly CardNumber[];
  readonly score: number;
}

// ── Game phases ────────────────────────────────────────────────────────

export type GamePhase =
  | 'round-over'
  | 'awaiting-cards'
  | 'resolving'
  | 'awaiting-row-pick';

// ── Pending row pick ───────────────────────────────────────────────────

export interface PendingRowPick {
  readonly playerId: string;
  readonly triggeringCard: CardNumber;
  readonly revealedThisTurn: readonly PlayCardMove[];
}

// ── Game state ─────────────────────────────────────────────────────────

export interface GameState {
  readonly players: readonly PlayerState[];
  readonly board: Board;
  readonly deck: readonly CardNumber[];
  readonly round: number;
  readonly turn: number;
  readonly phase: GamePhase;
  readonly seed: string;
  readonly turnHistory: readonly TurnHistoryEntry[];
  readonly initialBoardCards: Board;
  readonly pendingRowPick?: PendingRowPick;
}

// ── Moves ──────────────────────────────────────────────────────────────

export interface PlayCardMove {
  readonly playerId: string;
  readonly card: CardNumber;
}

export interface PickRowMove {
  readonly playerId: string;
  readonly rowIndex: number;
}

// ── Placement ──────────────────────────────────────────────────────────

export interface PlacementResult {
  readonly rowIndex: number;
  readonly causedOverflow: boolean;
  readonly collectedCards?: readonly CardNumber[];
}

// ── Turn resolution ────────────────────────────────────────────────────

export interface TurnResolutionResult {
  readonly resolutions: ReadonlyArray<{
    readonly playerId: string;
    readonly card: CardNumber;
    readonly rowIndex: number;
    readonly causedOverflow: boolean;
    readonly collectedCards?: readonly CardNumber[];
  }>;
  readonly rowPicks: ReadonlyArray<{
    readonly playerId: string;
    readonly rowIndex: number;
  }>;
  readonly collected: Readonly<Record<string, CardNumber[]>>;
  readonly boardAfter: Board;
}

// ── Turn history ───────────────────────────────────────────────────────

export interface TurnHistoryEntry {
  readonly turn: number;
  readonly plays: readonly PlayCardMove[];
  readonly resolutions: TurnResolutionResult['resolutions'];
  readonly rowPicks: TurnResolutionResult['rowPicks'];
  readonly boardAfter: Board;
}

// ── Visible state for agents ───────────────────────────────────────────

/** Visible state for card selection (what the agent sees when picking a card). */
export interface CardChoiceState {
  readonly hand: readonly CardNumber[];
  readonly board: Board;
  readonly playerScores: Readonly<Record<string, number>>;
  readonly playerCount: number;
  readonly round: number;
  readonly turn: number;
  readonly turnHistory: readonly TurnHistoryEntry[];
  readonly initialBoardCards: Board;
}

/** Visible state for row pick (what the agent sees when forced to pick a row). */
export interface RowChoiceState {
  readonly board: Board;
  readonly triggeringCard: CardNumber;
  readonly revealedThisTurn: readonly PlayCardMove[];
  readonly resolutionIndex: number;
  readonly hand: readonly CardNumber[];
  readonly playerScores: Readonly<Record<string, number>>;
  readonly playerCount: number;
  readonly round: number;
  readonly turn: number;
  readonly turnHistory: readonly TurnHistoryEntry[];
}
