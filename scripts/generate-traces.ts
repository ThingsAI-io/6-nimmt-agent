/**
 * Generate full-game-traces.json using the reference model.
 * Strategy: play lowest card each turn; row-pick = fewest cattle heads (tiebreak: lowest index).
 *
 * Usage: npx tsx scripts/generate-traces.ts
 */
import {
  createDeck,
  dealRound,
  determinePlacement,
  resolveOverflow,
  cattleHeads,
  type Board,
  type CardNumber,
  type Play,
  type Row,
} from '../test/reference/reference-model.js';

// ── Types for the trace schema ──────────────────────────────────────────

interface Resolution {
  playerId: string;
  card: number;
  rowIndex: number;
  causedOverflow: boolean;
}

interface RowPick {
  playerId: string;
  card: number;
  pickedRowIndex: number;
  collectedCards: number[];
  cattleHeadsCollected: number;
}

interface TurnTrace {
  turn: number;
  plays: { playerId: string; card: number }[];
  resolutions: Resolution[];
  rowPicks: RowPick[];
  boardAfter: number[][];
}

interface RoundScore {
  id: string;
  penalty: number;
  totalScore: number;
}

interface RoundTrace {
  round: number;
  deckOrder: number[];
  dealtHands: Record<string, number[]>;
  initialBoard: number[][];
  turns: TurnTrace[];
  roundScores: RoundScore[];
}

interface FinalResult {
  id: string;
  finalScore: number;
  rank: number;
}

interface GameTrace {
  id: string;
  seed: string;
  playerCount: number;
  rounds: RoundTrace[];
  finalResults: FinalResult[];
  winners: string[];
}

// ── Deterministic strategies ────────────────────────────────────────────

/** Pick row with fewest cattle heads; tiebreak: lowest index */
function pickRowFewestCattle(board: Board): number {
  let best = 0;
  let bestPen = Infinity;
  for (let i = 0; i < 4; i++) {
    const pen = board[i].reduce((s, c) => s + cattleHeads(c), 0);
    if (pen < bestPen) {
      bestPen = pen;
      best = i;
    }
  }
  return best;
}

// ── Game trace generation ───────────────────────────────────────────────

function generateGame(
  id: string,
  seed: string,
  playerCount: number,
): GameTrace {
  const pids = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  const totalScores = new Map<string, number>();
  for (const pid of pids) totalScores.set(pid, 0);

  const rounds: RoundTrace[] = [];
  let roundNum = 0;

  // Game loop: keep playing rounds until someone hits 66+
  while (true) {
    // Check game-over before starting a new round (but not before round 1)
    if (roundNum > 0) {
      let gameOver = false;
      for (const s of totalScores.values()) {
        if (s >= 66) { gameOver = true; break; }
      }
      if (gameOver) break;
    }

    roundNum++;
    const deck = createDeck(seed, roundNum);
    const deckOrder = [...deck];
    const { hands, board } = dealRound(deck, playerCount);

    // Sort each hand ascending so "play lowest" picks hands[i][0], [1], etc.
    const sortedHands = hands.map(h => [...h].sort((a, b) => a - b));

    const dealtHands: Record<string, number[]> = {};
    for (let i = 0; i < playerCount; i++) {
      dealtHands[pids[i]] = [...sortedHands[i]];
    }

    const initialBoard: number[][] = board.map(r => [...r]);

    // Track per-round collected cards for scoring
    const roundCollected = new Map<string, CardNumber[]>();
    for (const pid of pids) roundCollected.set(pid, []);

    let currentBoard: Board = [
      [...board[0]], [...board[1]], [...board[2]], [...board[3]],
    ];

    const turns: TurnTrace[] = [];

    for (let t = 0; t < 10; t++) {
      // Each player plays their lowest remaining card
      const plays: Play[] = pids.map((pid, i) => ({
        playerId: pid,
        card: sortedHands[i][t],
      }));

      // Sort plays ascending by card (resolution order)
      const sorted = [...plays].sort((a, b) => a.card - b.card);

      const resolutions: Resolution[] = [];
      const rowPicks: RowPick[] = [];

      // Deep copy board for mutation
      const b: Board = [
        [...currentBoard[0]],
        [...currentBoard[1]],
        [...currentBoard[2]],
        [...currentBoard[3]],
      ];

      for (const { playerId, card } of sorted) {
        let rowIdx = determinePlacement(b, card);
        let causedOverflow = false;

        if (rowIdx === -1) {
          // Rule 4: must pick a row
          rowIdx = pickRowFewestCattle(b);
          const collectedCards = [...b[rowIdx]];
          const cattleSum = collectedCards.reduce((s, c) => s + cattleHeads(c), 0);
          roundCollected.get(playerId)!.push(...collectedCards);
          b[rowIdx] = [card];

          rowPicks.push({
            playerId,
            card,
            pickedRowIndex: rowIdx,
            collectedCards,
            cattleHeadsCollected: cattleSum,
          });

          resolutions.push({
            playerId,
            card,
            rowIndex: rowIdx,
            causedOverflow: false, // rule-4 pick, not overflow
          });
        } else {
          // Normal placement (rules 1-2) or overflow (rule 3)
          const { newRow, collected } = resolveOverflow(b[rowIdx], card);
          if (collected.length > 0) {
            causedOverflow = true;
            roundCollected.get(playerId)!.push(...collected);
          }
          b[rowIdx] = newRow;

          resolutions.push({
            playerId,
            card,
            rowIndex: rowIdx,
            causedOverflow,
          });
        }
      }

      currentBoard = b;

      // plays in output sorted ascending by card value
      const playsOut = sorted.map(p => ({ playerId: p.playerId, card: p.card }));

      turns.push({
        turn: t + 1,
        plays: playsOut,
        resolutions,
        rowPicks,
        boardAfter: currentBoard.map(r => [...r]),
      });
    }

    // Score the round
    const roundScores: RoundScore[] = [];
    for (const pid of pids) {
      const collected = roundCollected.get(pid)!;
      const penalty = collected.reduce((s, c) => s + cattleHeads(c), 0);
      totalScores.set(pid, totalScores.get(pid)! + penalty);
      roundScores.push({
        id: pid,
        penalty,
        totalScore: totalScores.get(pid)!,
      });
    }

    rounds.push({
      round: roundNum,
      deckOrder,
      dealtHands,
      initialBoard,
      turns,
      roundScores,
    });
  }

  // Final results with ranking
  const entries = pids.map(pid => ({
    id: pid,
    finalScore: totalScores.get(pid)!,
  }));
  entries.sort((a, b) => a.finalScore - b.finalScore);

  let rank = 1;
  const finalResults: FinalResult[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].finalScore > entries[i - 1].finalScore) {
      rank = i + 1;
    }
    finalResults.push({ ...entries[i], rank });
  }

  // Sort finalResults by player id for stable output
  finalResults.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const minScore = Math.min(...entries.map(e => e.finalScore));
  const winners = entries.filter(e => e.finalScore === minScore).map(e => e.id);

  return {
    id,
    seed,
    playerCount,
    rounds,
    finalResults,
    winners,
  };
}

// ── Validation ──────────────────────────────────────────────────────────

function validate(trace: GameTrace): void {
  const label = trace.id;

  for (const round of trace.rounds) {
    for (const turn of round.turns) {
      // Check ascending order within each row
      for (let ri = 0; ri < turn.boardAfter.length; ri++) {
        const row = turn.boardAfter[ri];
        for (let i = 1; i < row.length; i++) {
          if (row[i] <= row[i - 1]) {
            throw new Error(
              `${label} R${round.round} T${turn.turn}: row ${ri} not ascending: ${row}`,
            );
          }
        }
      }
    }
  }

  // Check game terminates (someone ≥66)
  const lastRound = trace.rounds[trace.rounds.length - 1];
  const maxScore = Math.max(...lastRound.roundScores.map(s => s.totalScore));
  if (maxScore < 66) {
    throw new Error(`${label}: game did not terminate (max score ${maxScore} < 66)`);
  }

  // Check scores are cumulative
  const cumScores = new Map<string, number>();
  for (const round of trace.rounds) {
    for (const rs of round.roundScores) {
      const prev = cumScores.get(rs.id) ?? 0;
      const expected = prev + rs.penalty;
      if (rs.totalScore !== expected) {
        throw new Error(
          `${label} R${round.round}: ${rs.id} totalScore=${rs.totalScore} != expected ${expected}`,
        );
      }
      cumScores.set(rs.id, expected);
    }
  }

  console.error(`✓ ${label}: ${trace.rounds.length} rounds, validated OK`);
}

// ── Main ────────────────────────────────────────────────────────────────

const game1 = generateGame('2-player-short-game', 'trace-seed-001', 2);
validate(game1);

const game2 = generateGame('10-player-full-game', 'trace-seed-002', 10);
validate(game2);

const output = [game1, game2];
console.log(JSON.stringify(output, null, 2));
