# Plan Review: CLI Specification Alignment
> Reviewed against: spec/cli.md
> Plan version: commit ee1a61c

## Coverage Matrix

| Spec element | Plan task(s) | Status | Notes |
|---|---|---:|---|
| §1 Explicit long names | T5A, T5C | Partial | Long names appear in T5C for `simulate`, but not called out as a design requirement. |
| §1 Short aliases (-s/-n/-S/-f/-v) | — | **Missing** | Plan never mentions aliases or tests for them. |
| §1 Structured output (json/table/csv) | T5A, T5B, T5-TEST | Covered | Explicitly planned and snapshot-tested. |
| §1 Composable subcommands | T5A | Covered | Three subcommands explicitly planned. |
| §1 AI-friendly argument names | T5A, T5C | Missing | No task explicitly verifies self-documenting names. |
| §2 `simulate` command + all args | T5A, T5C | Covered | Explicit. |
| §2 Default `games=100` | — | **Missing** | Not specified in T5A/T5C/T5-TEST. |
| §2 `strategies` command JSON schema | T5C, T5-TEST | Partial | "list output" too vague; `usage` block not mentioned. |
| §2 `strategies.usage.simulateExample` | — | **Missing** | Not planned. |
| §2 `strategies.usage.playerCountRange` | — | **Missing** | Not planned. |
| §2 `strategies.usage.strategyNamesCaseSensitive` | — | **Missing** | Not planned. |
| §2 `play` command + full JSON schema | T5C, T5-TEST | Covered | Explicitly called out. |
| §3 `simulate` JSON output schema (all fields) | T5B | Covered | Exact schema requirement. |
| §4 Exit codes 0/1/2 | T5A, T5-TEST | Covered | Explicit. |
| §4 JSON errors on **stdout** when `--format json` | T5A, T5-TEST | Partial | JSON errors planned, but stdout-vs-stderr not explicitly tested. |
| §4 `INVALID_STRATEGY` error code | T5C, T5-TEST | Covered | Explicit. |
| §4 `INVALID_PLAYER_COUNT` | T5C, T6-E2E | Covered | Explicit. |
| §4 `INVALID_SEED` | — | **Missing** | No validation or test task. |
| §4 `INVALID_FORMAT` | — | **Missing** | No validation or test task. |
| §4 `ENGINE_ERROR` | T5A | Partial | Exit code exists, but not bound to JSON error code/schema. |
| §4 "Did you mean?" suggestions | T5C, T5-TEST | Covered | Explicit. |
| §4 `validValues` in errors | — | Partial | Implied by suggestions, not explicitly required/tested. |
| §4 AI-self-correction context | — | Missing | Design principle not translated into acceptance criteria. |
| §5 Module structure (all 7 files) | T5A, T5B, T5C | Covered | All files planned. |
| `bin` field for `npx 6nimmt` | T0 | Partial | Points to `src/cli/index.ts` — wrong for published npx usage without TS runtime. |

## Gaps Found

1. **[Blocking] Missing short aliases for CLI flags.**
   `-s/-n/-S/-f/-v` not planned or tested. Implementation can pass acceptance while violating spec.

2. **[Blocking] `simulate --games` default (100) is not planned or tested.**
   Wrong default changes CLI behavior and breaks spec-compliant automation.

3. **[Blocking] `strategies` JSON schema is underspecified.**
   `usage` block (`simulateExample`, `playerCountRange`, `strategyNamesCaseSensitive`) not mentioned.

4. **[Blocking] Error taxonomy is incomplete.**
   `INVALID_SEED`, `INVALID_FORMAT`, and structured `ENGINE_ERROR` can be omitted with no test failure.

5. **[Blocking] `bin` setup likely wrong for published CLI.**
   T0 points `bin` to `src/cli/index.ts` — needs to be built JS artifact for `npx` to work.

6. **[Non-Blocking] JSON error stdout/stderr routing not tested.**
   Spec requires JSON errors on stdout when `--format json`.

7. **[Non-Blocking] AI-self-correction error context not in deliverables.**
   `validValues` and actionable message context not explicitly required/tested.

8. **[Non-Blocking] Commander wiring too vague.**
   T5A only names global `--format`; alias registration and help text verification missing.

## Recommendations

- **Amend T5A**: require long names + short aliases, commander alias registration, defaults in help.
- **Amend T5C**: require `games=100` default, full `strategies` JSON schema with `usage`, all error codes.
- **Amend T5-TEST**: alias tests, default-value tests, schema tests for `strategies.usage.*`, error tests for all 5 error codes, stdout/stderr routing assertions.
- **Amend T0/T6-E2E**: fix `bin` to target built artifact, add E2E test against packaged CLI path.
