# Round 3 Agentic Simulation — Findings Summary

> Extracted from the [full simulation walkthrough](simulation.md).

---

## 🔴 Blocking (2)

| ID | Finding | Impact |
|----|---------|--------|
| **F1** | **Missing `recommend` CLI command.** The CLI has `simulate`, `strategies`, `play` — all offline. No command exists for "given this visible state and strategy, what move should I make?" | Agent cannot use the engine for live BGA gameplay at all. |
| **F2** | **No state validation utility.** When the BGA skill constructs a `CardChoiceState` from the DOM, there's no way to validate internal consistency (hand size vs turn, card uniqueness, row ordering). Stale/partial DOM reads produce silently wrong recommendations. | Garbage-in-garbage-out — invalid states produce nonsensical moves with no error signal. |

---

## 🟡 Important (7)

| ID | Finding | Impact |
|----|---------|--------|
| **F3** | **Strategy state not preserved across `recommend` calls.** Bayesian strategy uses `onGameStart()`, `onTurnResolved()`, `onRoundEnd()` lifecycle hooks to accumulate knowledge. Stateless `recommend` can't call these. Strategy must be fully reconstructible from `CardChoiceState` alone. | Bayesian strategy effectiveness degraded in live play vs simulation. |
| **F4** | **`resolvedCardsThisRound` lacks turn boundaries.** Flat array of `{playerId, card}` without turn numbers. Strategies can't distinguish which cards were played simultaneously. | Weakens opponent modeling — simultaneous plays constrain distributions differently than sequential ones. |
| **F5** | **BGA skill must handle non-turn events.** `waitForMyTurn()` assumes clean turn cycling. BGA fires player disconnects, timer warnings, game cancellations, chat. | Agent hangs or crashes on unexpected BGA events. |
| **F6** | **BGA DOM → `RowChoiceState` translation is non-trivial.** `resolutionIndex` and `revealedThisTurn` are engine-internal concepts with no direct DOM equivalent. | Fragile BGA skill implementation, potential for incorrect `RowChoiceState` construction. |
| **F7** | **`recommend` state input could exceed shell argument limits.** Full `CardChoiceState` JSON can be 1–2KB. | Broken CLI calls on some platforms. Need `--state-file` or stdin support. |
| **F8** | **`seatIndex` vs `id` naming inconsistency.** `play` output uses numeric `seatIndex`, `CardChoiceState` uses string `id`. | Confusion when mapping between offline and online modes. |
| **F9** | **No way to feed turn resolution back to engine.** After BGA resolves a turn, the agent sees opponents' cards but can't notify the strategy via `onTurnResolved()`. | Reinforces F3 — strategy must derive everything from visible state. |

---

## 🟢 Minor (6)

| ID | Finding | Impact |
|----|---------|--------|
| **F10** | **`play` output uses `number[][]` for board, engine uses `{ rows: [{ cards }] }`.** Two JSON representations of the same data. | Inconsistent schemas across commands. |
| **F11** | **No BGA-specific error codes in CLI.** Missing `INVALID_STATE`, `MISSING_STATE`, `INCOMPATIBLE_DECISION`. | Agent can't self-correct on `recommend` errors. |
| **F12** | **No `--timeout` flag on `recommend`.** BGA has turn timers (~90s). No way to cap engine computation time. | Agent risks timing out on BGA if strategy is slow. |
| **F13** | **`CardChoiceState.initialBoardCards` requires memory.** BGA DOM doesn't show initial board cards after turn 1. BGA skill must cache or derive. | Added complexity in BGA skill state management. |
| **F14** | **No stdin support specified for CLI.** Agent must construct shell commands with large JSON arguments instead of piping. | Shell escaping issues, argument length limits (see also F7). |
| **F15** | **BGA credential handling not specified.** No defined storage mechanism for login credentials. | Security concern; blocks BGA skill implementation. |

---

## Summary

- **2 blocking** issues prevent the agent from functioning in live BGA play
- **7 important** issues affect correctness, reliability, or strategy quality
- **6 minor** issues affect developer experience and robustness

**Top priority:** Define the `recommend` command (F1) and a state validation mechanism (F2). These are prerequisites for any live BGA integration.
