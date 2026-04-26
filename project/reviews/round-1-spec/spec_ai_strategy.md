# AI Strategy Review — 6 Nimmt! Engine Specification

> **Reviewed spec version:** [`ff62ef1`](https://github.com/ThingsAI-io/6-nimmt-agent/commit/ff62ef1)

**Reviewer:** AI Game Strategy Specialist
**Date:** 2025-07-15
**Scope:** `spec/engine.md`, `spec/strategies.md`, `spec/simulator.md`, `spec/rules/6-nimmt.md`

---

## Executive Summary

The specification defines a clean, well-separated architecture with immutable state and pure functions — an excellent foundation for a game engine. However, the visible state model (`CardChoiceState` / `RowChoiceState`) and the `Strategy` interface are designed for **stateless, myopic** decision-making and lack the information channels and extensibility required for expert-level AI strategies such as Bayesian inference, opponent modeling, or cross-game learning. The gap between the current spec and what an advanced AI agent needs is significant but bridgeable with targeted additions.

---

## Findings

### CRITICAL-1: `resolvedCardsThisRound` loses player attribution — Bayesian inference is impossible

**What's missing:** `resolvedCardsThisRound` is typed as `readonly CardNumber[]` — a flat list of card numbers with no player attribution. A Bayesian strategy needs to know **which player played which card** to maintain per-opponent hand distributions.

**Why it matters:** The core of Bayesian play in 6 Nimmt! is narrowing the probability distribution over each opponent's remaining hand. If I see Player B play card 78, I can eliminate 78 from B's hand and update my beliefs about B's remaining cards. With an anonymous flat list, all I know is "someone played 78" — I cannot attribute plays to opponents, making per-opponent inference impossible.

**Recommendation:** Change the type to:
```typescript
readonly resolvedCardsThisRound: readonly { playerId: string; card: CardNumber }[];
```
This mirrors the existing `revealedThisTurn` structure in `RowChoiceState` and maintains consistency.

**Severity: CRITICAL** — This blocks the primary advertised future strategy (Bayesian) from functioning.

---

### CRITICAL-2: Strategy interface has no mechanism for persistent state across turns

**What's missing:** The `Strategy` interface defines two pure functions (`chooseCard`, `chooseRow`) that receive state snapshots. There is no lifecycle hook, no mutable context object, and no way for a strategy to carry state from turn N to turn N+1 or from round N to round N+1.

**Why it matters:** Every non-trivial strategy needs memory:
- **Bayesian:** Must maintain and incrementally update probability distributions over opponent hands. Reconstructing these from `resolvedCardsThisRound` each turn is wasteful and fragile.
- **Opponent modeling:** Must accumulate behavioral profiles (does Player C tend to play high or low? do they dump cards early?) across many turns.
- **Adaptive/learning strategies:** Must carry learned parameters across rounds or even across games.

The current design forces strategies to be pure functions of visible state, which means either (a) advanced strategies must wastefully recompute everything from scratch each call, or (b) they resort to closures over mutable variables outside the interface — which works but is an undocumented escape hatch that breaks the spec's clean functional contract.

**Recommendation:** Add optional lifecycle hooks and a state context:
```typescript
interface Strategy {
  readonly name: string;
  chooseCard(state: CardChoiceState): CardNumber;
  chooseRow(state: RowChoiceState): 0 | 1 | 2 | 3;

  /** Called once before a game begins. */
  onGameStart?(playerCount: number, playerId: string): void;
  /** Called after each turn resolves with full public resolution details. */
  onTurnResolved?(resolution: TurnResolution): void;
  /** Called after each round is scored. */
  onRoundEnd?(scores: readonly { id: string; score: number }[]): void;
}
```
This keeps stateless strategies simple (just ignore the hooks) while enabling stateful ones via the strategy's own internal fields.

**Severity: CRITICAL** — Without this, the spec contradicts its own stated goal of supporting Bayesian and neural-net strategies.

---

### IMPORTANT-1: No card-tracking information for computing "unseen card" distributions

**What's missing:** Neither `CardChoiceState` nor `RowChoiceState` provides:
- The initial board cards dealt at the start of the round (before any plays).
- The cards collected as penalties by any player during the round.
- An explicit "seen cards" or "remaining deck" set.

**Why it matters:** A human expert (and any competent AI) tracks the full set of cards that have been **observed** — starting board cards, all played cards, and cards removed via row pickups. From this, they compute the set of cards that could be in opponents' hands. The current `resolvedCardsThisRound` only captures played cards, not the 4 initial board cards or the cards that were in rows when they were picked up.

The board itself shows *current* state, but after a row is picked up and replaced, the original cards in that row are no longer visible. A strategy cannot reconstruct what cards have been removed from the board during the round.

**Recommendation:** Add a field tracking all cards that have become public knowledge:
```typescript
/** All cards observed this round: initial board cards, all played cards,
 *  and all cards collected from picked-up rows. */
readonly knownCards: readonly CardNumber[];
```
Alternatively (and more precisely), provide a structured round history:
```typescript
readonly roundHistory: readonly TurnRecord[];
interface TurnRecord {
  readonly turn: number;
  readonly plays: readonly { playerId: string; card: CardNumber }[];
  readonly rowPickups: readonly { playerId: string; rowCards: readonly CardNumber[] }[];
}
```

**Severity: IMPORTANT** — Without this, card-counting (the foundation of probability-based play) requires strategies to reconstruct state from partial information, which is error-prone and may lose data that the visible state doesn't preserve.

---

### IMPORTANT-2: `playerScores` lacks round-level penalty breakdown

**What's missing:** `playerScores` provides only `{ id: string; score: number }` — the cumulative total. There is no per-round penalty breakdown or penalty-this-round information.

**Why it matters:**
- **Risk calculus:** Knowing that Player A has 60 points (6 away from triggering game end) vs 10 points drastically changes optimal play. The cumulative score supports this. But knowing that Player A just took 15 points *this round* (vs 2 points) tells us whether they're on a bad streak (likely to continue making desperate plays) or just had one bad turn.
- **Endgame strategy:** When a player is near 66, the AI should shift from minimizing its own score to either (a) avoiding giving that player any excuse to end the round favorably, or (b) accelerating the game end if the AI is in a winning position.

The cumulative score partially supports this, but round-level penalty tracking (or at least "points collected this round per player") adds meaningful signal.

**Recommendation:** Extend `playerScores`:
```typescript
readonly playerScores: readonly {
  id: string;
  score: number;             // cumulative across rounds
  penaltyThisRound: number;  // cattle heads collected this round so far
}[];
```

**Severity: IMPORTANT** — Affects quality of endgame and risk-adjusted decision-making.

---

### IMPORTANT-3: `RowChoiceState` lacks resolution order context for partially-resolved turns

**What's missing:** During row-choice, the AI knows the `revealedThisTurn` set and sees the current board. However, it does not know the resolution order explicitly — i.e., which of the revealed cards have already been placed and which are still pending.

**Why it matters:** The board at row-choice time reflects partial resolution. Cards lower than the triggering card have already been placed. Cards higher than it have not. The AI can infer this from card values (since resolution is lowest-first), but this requires the strategy to reimplement engine logic. More importantly, if multiple row pickups happen in one turn, the board state after the first pickup doesn't clearly communicate what happened.

**Recommendation:** Add the resolution index to `RowChoiceState`:
```typescript
/** Index into the sorted plays — how many cards have been resolved before this one. */
readonly resolutionIndex: number;
```
Or more explicitly, separate already-resolved plays from pending ones:
```typescript
readonly resolvedPlays: readonly { playerId: string; card: CardNumber }[];
readonly pendingPlays: readonly { playerId: string; card: CardNumber }[];
```

**Severity: IMPORTANT** — The information is theoretically derivable but forces strategy implementations to duplicate engine logic, violating separation of concerns.

---

### IMPORTANT-4: No mechanism for strategy-level randomness with reproducibility

**What's missing:** Strategies like "random" need a source of randomness, but the `Strategy` interface provides no PRNG or seed. The spec mentions that `GameState` has a seed, but this is in the simulator-internal state — invisible to strategies.

**Why it matters:** If a random strategy uses `Math.random()`, games are not reproducible even with the same engine seed. This breaks the spec's stated goal of "deterministic reproducibility."

**Recommendation:** Either pass a seeded PRNG to strategies:
```typescript
chooseCard(state: CardChoiceState, rng: () => number): CardNumber;
```
Or provide it via the lifecycle hooks:
```typescript
onGameStart?(config: { playerId: string; playerCount: number; rng: () => number }): void;
```

**Severity: IMPORTANT** — Breaks the reproducibility guarantee for any stochastic strategy.

---

### SUGGESTION-1: Add player hand sizes to visible state

**What's available:** `playerCount` and `turn` number.
**What's derivable:** Since all players play one card per turn, hand sizes are `10 - turn + 1` for everyone. This is always the same for all players.

**Why it would help:** In variants or error cases, or simply for convenience, having explicit hand sizes per opponent avoids assumptions. In the standard rules this is low-value since all hands shrink equally, but it costs nothing and future-proofs the model.

**Recommendation:** Consider adding `readonly handSizes: readonly { id: string; size: number }[]` or simply document that all hand sizes are `11 - turn` in the current ruleset.

**Severity: SUGGESTION** — Low impact given standard rules, but cheap to include.

---

### SUGGESTION-2: Simulator lacks support for strategy parameter tuning and tournament modes

**What's missing:** The `SimConfig` only accepts a strategy *name* per player. There is no way to:
- Pass parameters to a strategy (e.g., risk tolerance for a heuristic, prior strength for a Bayesian).
- Run round-robin tournaments (all strategy pairs).
- Run evolutionary/iterative experiments where strategies adapt between games.

**Why it matters:** AI research requires parameter sweeps, ablation studies, and tournament-style evaluation. The current batch runner only supports "run N identical games and aggregate."

**Recommendation:** Extend `SimConfig` to support strategy parameters:
```typescript
readonly players: readonly {
  id: string;
  strategy: string;
  params?: Record<string, unknown>;  // strategy-specific configuration
}[];
```
And consider adding a `TournamentRunner` that automates round-robin matchups.

**Severity: SUGGESTION** — Not needed for MVP, but essential for serious strategy development.

---

### SUGGESTION-3: `GameResult` should include per-round detail for post-hoc analysis

**What's missing:** `GameResult` only records `rounds` (count) and `playerResults` (final scores). There is no per-round or per-turn history.

**Why it matters:** Strategy researchers need to analyze:
- How scores evolve over rounds (momentum analysis).
- Which turns caused big swings (critical decision identification).
- Whether a strategy performs differently early vs late in a game.
- Replay and visualization of specific games.

**Recommendation:** Add optional detailed logging:
```typescript
interface GameResult {
  // ...existing fields...
  readonly roundDetails?: readonly RoundDetail[];
}
interface RoundDetail {
  readonly roundNumber: number;
  readonly initialBoard: Board;
  readonly turns: readonly TurnDetail[];
  readonly penalties: readonly { playerId: string; penalty: number }[];
}
interface TurnDetail {
  readonly plays: readonly { playerId: string; card: CardNumber }[];
  readonly rowPickups: readonly { playerId: string; rowIndex: number; cards: readonly CardNumber[] }[];
}
```

**Severity: SUGGESTION** — Critical for strategy development workflow, but can be deferred past MVP.

---

### SUGGESTION-4: Consider an `AnalysisEngine` for strategy-assisting computations

**Why:** Multiple advanced strategies will need the same computations — unseen card sets, row overflow probabilities, expected penalties for each candidate play. Currently each strategy must implement these independently.

**Recommendation:** Provide a utility module (not part of the strategy interface, but available to strategies):
```typescript
// src/engine/analysis.ts
function unseenCards(state: CardChoiceState): Set<CardNumber>;
function placementOutcome(board: Board, card: CardNumber): PlacementResult;
function rowOverflowProbability(board: Board, row: number, unseenCards: Set<CardNumber>, opponentCount: number): number;
```

**Severity: SUGGESTION** — Reduces duplication across strategies and lowers the bar for implementing new ones.

---

### SUGGESTION-5: The spec should address simultaneous card selection explicitly

**What's underspecified:** The rules state all players select cards simultaneously (face-down), then reveal. The engine spec handles this correctly in the `resolveTurn()` flow. However, the `Strategy` interface doesn't explicitly prevent a strategy from seeing other players' choices before committing.

**Current protection:** The `CardChoiceState` doesn't include other players' selected cards, so information hiding is enforced by the state projection. This is correct but should be explicitly called out as a design invariant.

**Recommendation:** Add a brief note in `strategies.md` stating: "Strategies receive `CardChoiceState` which is projected *before* card reveal. A strategy's `chooseCard()` is never called with knowledge of other players' choices for the current turn."

**Severity: SUGGESTION** — The design is correct; the documentation should be explicit.

---

## Verdict

The specification establishes a **solid, well-architected foundation** with excellent separation of concerns, immutability, and reproducibility. For a **stateless baseline strategy** (random, simple greedy), the current design is sufficient and well-executed.

However, the spec **falls short of its stated ambition** of supporting Bayesian, opponent-modeling, and neural-net strategies. Two critical gaps — anonymous resolution history and a stateless strategy interface — must be resolved before any non-trivial AI work begins. Additionally, the lack of complete card-tracking information and strategy reproducibility controls are significant oversights for a project positioned as an AI research platform.

### Priority Roadmap

| Priority | Finding | Effort |
|----------|---------|--------|
| 🔴 Must fix before Bayesian work | CRITICAL-1: Player attribution in resolved cards | Small — type change |
| 🔴 Must fix before Bayesian work | CRITICAL-2: Strategy lifecycle hooks / state | Medium — interface extension |
| 🟡 Fix before advanced strategies | IMPORTANT-1: Complete card-tracking data | Medium — new field + projection logic |
| 🟡 Fix before advanced strategies | IMPORTANT-2: Round-level penalty info | Small — extend existing type |
| 🟡 Fix before advanced strategies | IMPORTANT-3: Resolution order in RowChoiceState | Small — add field |
| 🟡 Fix before advanced strategies | IMPORTANT-4: Reproducible strategy randomness | Small — pass PRNG |
| 🔵 Nice to have | SUGGESTION-1 through SUGGESTION-5 | Varies |

**Bottom line:** Fix CRITICAL-1 and CRITICAL-2 now (they're design-level changes that get harder to retrofit later). The IMPORTANT items can wait until the first advanced strategy is being designed, but should be part of the spec before that work begins.
