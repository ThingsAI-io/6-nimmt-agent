# Round 8: Code Draft v1 — PR #1 Review Comments

**Source:** Copilot PR reviewer on PR #1  
**Date:** 2026-04-28  
**Reviewer:** copilot-pull-request-reviewer  

---

## F1: `causedOverflow` semantics for Rule 4 (Critical)

**File:** `src/engine/game.ts:193`  
**Issue:** In Rule 4 (must-pick-row), `causedOverflow` is set to `true`. The reviewer argues this conflicts with fixture semantics where rule-4 picks are not overflows — overflow should only apply when a card naturally exceeds a row's 5-card limit.  
**Action:** Revert to `causedOverflow: false` for rule-4 path.  
**Disposition:** ACCEPT — the spec distinguishes Rule 4 (player forced to pick) from overflow (6th card placed). They are separate events.

## F2: Missing validation on `rowPickFn` return value (Important)

**File:** `src/engine/game.ts:181`  
**Issue:** `rowPickFn` return value is used as an array index without validation. An out-of-range or non-integer value would cause undefined behavior in `collectRow()`.  
**Action:** Add bounds check: `pickedRow` must be integer in [0, 3].  
**Disposition:** ACCEPT — defensive programming for strategy/tool interop.

## F3: Vitest projects missing `test/sim/**` and `test/strategies/**` (Important)

**File:** `vitest.config.ts:57`  
**Issue:** The Vitest project list omits sim and strategy test directories, so `npm test` won't run them.  
**Action:** Add missing projects or simplify config to use Vitest discovery.  
**Disposition:** ACCEPT — tests should run consistently locally and in CI.

## F4: Version mismatch `0.1.0` vs `1.0.0` (Minor)

**File:** `package.json:3`  
**Issue:** `package.json` says `0.1.0` but CLI/MCP report `1.0.0` and tests assert `1.0.0`.  
**Action:** Bump `package.json` to `1.0.0` for consistency.  
**Disposition:** ACCEPT — trivial alignment.

## F5: `ensureResults()` re-runs all games individually (Minor/Perf)

**File:** `test/sim/statistical.test.ts:37`  
**Issue:** Test helper runs `runBatch` then re-runs 1000 games via `runGame` individually, tripling work.  
**Action:** Use `batch.gameResults` for per-game assertions instead of re-running.  
**Disposition:** ACCEPT — now that `BatchResult.gameResults` is exposed, this is redundant.

## F6: Empty hand fallback produces `Infinity` (Important)

**File:** `src/mcp/tools/stateless.ts:238`  
**Issue:** `Math.min(...hand)` returns `Infinity` when hand is empty, producing an invalid recommendation.  
**Action:** Guard against empty hand — return INVALID_STATE error.  
**Disposition:** ACCEPT — edge case that should be caught by validation.

## F7: Harness protection blocks initial fixture landing (Minor/CI)

**File:** `.github/workflows/ci.yml:63`  
**Issue:** The harness-protection job fails when protected paths don't yet exist on main (initial landing). Should allow initial creation.  
**Action:** Update logic to skip check when base branch doesn't have protected files yet.  
**Disposition:** ACCEPT — already worked around with `harness-amendment` trailer, but the logic improvement prevents future issues.

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| F1 | Critical | To fix |
| F2 | Important | To fix |
| F3 | Important | To fix |
| F4 | Minor | To fix |
| F5 | Minor | To fix |
| F6 | Important | To fix |
| F7 | Minor | To fix |
