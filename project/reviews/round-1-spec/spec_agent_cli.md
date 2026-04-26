# CLI Specification Review — AI Agent UX

> **Reviewed spec version:** [`ff62ef1`](https://github.com/ThingsAI-io/6-nimmt-agent/commit/ff62ef1)

> **Reviewer:** AI Agent UX Specialist
> **Scope:** `spec/cli.md`, `spec/simulator.md`, `spec/strategies.md`
> **Focus:** Usability for an LLM-based agent operating in an agentic loop

---

## Executive Summary

The CLI spec is well-structured and demonstrates strong design instincts (composable commands, structured JSON output, explicit long names). However, several issues will cause real problems for an AI agent: **the `--players` argument conflates player count with strategy assignment**, the **JSON output aggregates duplicate strategy names making per-seat results unrecoverable**, and **there is no specified error output contract**, meaning an agent cannot reliably distinguish or recover from failures. Fixing these three areas alone would dramatically reduce agent error rates.

---

## Findings

### CRITICAL — Will Cause Agent Errors

#### C1. `--players` is ambiguous — conflates identity with strategy

**Current spec:** `--players "bayesian,random,random,random,random"` — a comma-separated list of strategy names, one per seat.

**What goes wrong:** An LLM will reasonably interpret `--players` as specifying *who* the players are (names, IDs, count) rather than *what strategy each seat uses*. The word "players" is a noun describing entities, not their behavior. Furthermore, the alias `-p` reinforces the "people" interpretation.

When an agent runs `strategies` and gets back `["random", "bayesian"]`, it must then figure out that `--players` expects a *repeated* list of these names to fill seats. Nothing about the argument name suggests repetition or seat-mapping.

**Recommendation:** Rename to `--strategies` (alias `-s`). This is self-documenting: "strategies" clearly means "which strategy for each seat." The current `-s` alias is used by `--seed`; reassign seed to `-S` or `--seed` only (seeds are rarely typed by hand).

Alternatively, if you want to keep player count and strategies orthogonal, split into `--player-count` (or `-n` for number) and `--strategy` (repeatable flag), but the single-list approach is fine if named correctly.

---

#### C2. JSON output aggregates duplicate strategies — per-seat results lost

**Current spec (cli.md §3):**
```json
{
  "results": {
    "bayesian": { "wins": 620, ... },
    "random": { "wins": 380, ... }
  }
}
```

**What goes wrong:** With `--players "random,random,random,random,bayesian"`, four random players are collapsed into a single `"random"` key. The agent cannot determine:
- How *each individual* random player performed (was seat 1 random luckier than seat 3?)
- Per-seat win counts (the `wins: 380` is aggregate, but `winRate: 0.095` looks per-player — inconsistency)
- Whether the aggregation is sum vs average for different fields

The `winRate` value of `0.095` in the example seems to already be per-player (380 wins / 4 players / 1000 games = 0.095), but this is never documented. An agent would calculate `380/1000 = 0.38` and get confused.

Furthermore, using strategy names as object keys means the JSON schema is dynamic — the set of keys in `results` depends on runtime input. This is hostile to typed parsing.

**Recommendation:**
1. Switch `results` from a dynamic-key object to an array:
```json
{
  "results": [
    {
      "strategy": "bayesian",
      "seatIndices": [4],
      "playerCount": 1,
      "wins": 620,
      "winRate": 0.62,
      ...
    },
    {
      "strategy": "random",
      "seatIndices": [0, 1, 2, 3],
      "playerCount": 4,
      "wins": 380,
      "winRatePerPlayer": 0.095,
      "winRateAggregate": 0.38,
      ...
    }
  ]
}
```
2. Explicitly document whether `wins` is total across all players using that strategy or per-player.
3. Consider including `seatIndices` so the agent can correlate seats to strategies.

---

#### C3. No error output contract — agent cannot handle failures

**Current spec:** No mention of error responses, exit codes, or error output format.

**What goes wrong:** When an agent provides an invalid strategy name (e.g., a typo like `"bayesain"`), it has no way to:
- Know the command failed (no exit code spec)
- Parse the error (stderr? unstructured text? JSON?)
- Understand *what* went wrong (invalid strategy name vs invalid player count vs seed issue)
- Extract actionable information (what are the valid strategy names?)

In an agentic loop, this causes cascading failures: the agent retries blindly, invents workarounds, or halts entirely.

**Recommendation:** Add a full error contract section to cli.md:

```
Exit codes:
  0 — success
  1 — invalid arguments (bad strategy name, wrong player count, etc.)
  2 — runtime error (engine failure, unexpected exception)

When --output-format json is set, errors MUST also be JSON on stdout:
{
  "error": true,
  "code": "INVALID_STRATEGY",
  "message": "Unknown strategy 'bayesain'. Valid strategies: random, bayesian",
  "validValues": ["random", "bayesian"]
}
```

Key principle: **errors should include enough context for the agent to self-correct without a second round-trip.**

---

### IMPORTANT — Friction / Confusion Risk

#### I1. No schema contract for `strategies` command output

**Current spec:** "Outputs all registered strategy names with descriptions." No JSON schema shown.

**What goes wrong:** The agent needs to parse the output of `strategies` to construct a valid `simulate` command. Without a defined schema, the agent must guess the output structure. Is it `["random", "bayesian"]`? Or `[{"name": "random", "description": "..."}]`? Or something else?

**Recommendation:** Define the JSON schema explicitly:
```json
{
  "strategies": [
    {
      "name": "random",
      "description": "Picks a card uniformly at random. Baseline strategy.",
      "version": "1.0.0"
    }
  ]
}
```

Include enough metadata that the agent can select strategies intelligently (e.g., description, whether it's a baseline, computational cost).

---

#### I2. Comma-separated string format is error-prone

**Current spec:** `--players "bayesian,random,random,random,random"` — comma-separated, quoted string.

**What goes wrong:** LLMs frequently produce malformed comma-separated lists:
- Extra spaces: `"bayesian, random, random"` — will this parse or fail?
- Trailing comma: `"bayesian,random,"` — silent empty player or error?
- JSON array syntax: `'["bayesian","random"]'` — agent confuses formats
- No quotes: `--players bayesian,random` — shell splitting issues?

**Recommendation:**
1. **At minimum:** Document whitespace handling explicitly (trim? error?). Accept and trim spaces around commas.
2. **Better:** Also accept `--players` as a repeatable flag: `--players bayesian --players random --players random` — impossible to malformat.
3. **Best:** Accept JSON array format as an alternative: `--players '["bayesian","random","random"]'` — auto-detect by checking if value starts with `[`. LLMs are very reliable at producing valid JSON arrays.

---

#### I3. `play` command JSON schema not specified

**Current spec:** "Outputs full game log: every turn, every placement, every pickup." No JSON schema.

**What goes wrong:** The `play` command is described as "useful for debugging strategies" — this is exactly what an agent would use to understand *why* a strategy is performing poorly. Without a defined output schema, the agent cannot reliably parse turn-by-turn results.

**Recommendation:** Define the full JSON schema for `play` output, including:
- Per-turn card selections for each player
- Board state after each placement
- Row pickups and penalty assignments
- Final scores

---

#### I4. `strategies` output doesn't guide argument construction

**Current spec:** The `strategies` command lists names and descriptions.

**What goes wrong:** After discovering strategies, the agent must construct a `simulate` command. But the `strategies` output doesn't tell the agent:
- What format `--players` expects (comma-separated? repeatable?)
- How many players are required (min 2, max 10 — specified in simulator.md but not discoverable via CLI)
- Whether strategy names are case-sensitive
- Example invocation

**Recommendation:** Include argument format hints in `strategies` output:
```json
{
  "strategies": [...],
  "usage": {
    "simulateExample": "6nimmt simulate --players random,random,random,random --games 100",
    "playerCountRange": { "min": 2, "max": 10 },
    "strategyNamesCaseSensitive": true
  }
}
```

---

#### I5. Alias conflicts and conventions

**Current spec aliases:** `-p` (players), `-n` (games), `-s` (seed), `-f` (output-format), `-v` (verbose).

**What goes wrong:**
- `-n` conventionally means "count" or "number" in most Unix tools — this is fine for `--games`, but if `--players` is renamed to `--strategies`, `-n` could be confused with player count.
- `-f` conventionally means "file" or "force" (think `rm -f`, `tar -f`). Using it for `--output-format` may confuse an LLM that has internalized Unix conventions. `-o` for "output" or `--format` (no alias) would be more conventional.
- `-s` for `--seed` conflicts with the more natural `-s` for `--strategies` (if renamed per C1).

**Recommendation:**
- `--strategies` → `-s` (natural fit)
- `--seed` → `-S` or no short alias (rarely used interactively)
- `--output-format` → rename to `--format` with alias `-o` (for "output") or no alias
- `-n` for `--games` is fine
- `-v` for `--verbose` is fine (universal convention)

---

### SUGGESTION — Improvement Opportunities

#### S1. Add `--dry-run` flag for argument validation

**Recommendation:** `6nimmt simulate --players random,random --games 100 --dry-run` should validate all arguments and output the resolved configuration without running any games:
```json
{
  "dryRun": true,
  "resolvedConfig": {
    "players": ["random", "random"],
    "games": 100,
    "seed": "auto-generated-abc123"
  }
}
```

This lets the agent verify its command construction before committing to a potentially long simulation.

---

#### S2. Add JSON-formatted `--help`

**Recommendation:** `6nimmt simulate --help --format json` should output machine-parseable help:
```json
{
  "command": "simulate",
  "description": "Run a batch of games",
  "arguments": [
    {
      "name": "--strategies",
      "alias": "-s",
      "type": "string",
      "required": true,
      "format": "comma-separated strategy names",
      "validValues": ["random", "bayesian"],
      "example": "bayesian,random,random,random"
    }
  ]
}
```

This enables full self-discovery — an agent can learn the CLI interface from the CLI itself.

---

#### S3. Add `--player-count` convenience shorthand

**Recommendation:** For the common case of "1 strategy vs N copies of another," allow:
```
6nimmt simulate --strategies bayesian --opponents random --player-count 5
```
This is less error-prone than manually typing `bayesian,random,random,random,random`. The explicit list form remains available for heterogeneous matchups.

---

#### S4. Include metadata in JSON output for traceability

**Recommendation:** Add a `meta` envelope to all JSON output:
```json
{
  "meta": {
    "command": "simulate",
    "version": "1.0.0",
    "timestamp": "2025-01-15T10:30:00Z",
    "durationMs": 1234
  },
  "results": { ... }
}
```

This helps the agent log and correlate results across multiple invocations.

---

#### S5. Document the `--verbose` JSON structure

**Current spec:** `--verbose` is described as "Log each game result individually" with no schema.

**What goes wrong:** An agent enabling verbose mode for deeper analysis gets an undefined output structure. Does it interleave game results in the JSON? Is it NDJSON (one JSON object per line)? Does it change the top-level schema?

**Recommendation:** Specify whether verbose output:
- Changes the JSON schema (adds a `games` array?)
- Uses NDJSON (newline-delimited JSON) for streaming
- Is only for human-readable table format (in which case, document that `--verbose` with `--format json` either errors or has a specific schema)

---

#### S6. Simulator types don't match CLI JSON output

**Current spec:** The simulator `SimConfig.players` is `readonly { id: string; strategy: string }[]` (objects with id+strategy), but the CLI `--players` input is just strategy names and the JSON output `players` field is `["bayesian", "random", ...]` (flat string array).

**What goes wrong:** If an agent reads the simulator types (e.g., from generated typedocs), it might expect the CLI to accept or output `{id, strategy}` objects.

**Recommendation:** Document the CLI's role as a projection layer — it generates player IDs (e.g., `"player-0"`, `"player-1"`) from seat position and maps flat strategy names to the simulator's richer type. Alternatively, expose player IDs in the CLI JSON output so results can be correlated to specific seats.

---

## Recommended Changes Summary

| # | Severity | Current | Recommendation | Impact |
|---|----------|---------|----------------|--------|
| C1 | CRITICAL | `--players` for strategy list | Rename to `--strategies` (`-s`) | Eliminates primary source of agent confusion |
| C2 | CRITICAL | `results` keyed by strategy name | Use array with explicit `strategy` field + document aggregation semantics | Enables unambiguous parsing; fixes dynamic-key schema |
| C3 | CRITICAL | No error contract | Add exit codes, JSON error format, actionable error messages with valid values | Enables agent self-correction on failure |
| I1 | IMPORTANT | `strategies` output unspecified | Define JSON schema for strategies listing | Enables reliable discovery → command construction |
| I2 | IMPORTANT | Comma-separated string only | Accept trimmed spaces; optionally accept JSON array or repeatable flag | Reduces malformation errors |
| I3 | IMPORTANT | `play` output unspecified | Define full JSON schema for game log | Enables agent debugging workflows |
| I4 | IMPORTANT | No usage hints in discovery | Include format hints, player count range, and example in `strategies` output | Closes the discovery → construction gap |
| I5 | IMPORTANT | `-f` for format, `-s` for seed | Reassign aliases: `-s` → strategies, `-S` or none → seed, `-o` or none → format | Aligns with Unix conventions LLMs expect |
| S1 | SUGGESTION | No dry-run | Add `--dry-run` for argument validation | Prevents wasted simulation runs |
| S2 | SUGGESTION | No machine-readable help | Add `--help --format json` | Enables full self-discovery |
| S3 | SUGGESTION | Manual strategy repetition | Add `--opponents` + `--player-count` shorthand | Convenience for common 1-vs-N pattern |
| S4 | SUGGESTION | No output metadata | Add `meta` envelope with command, version, timestamp, duration | Traceability in multi-step loops |
| S5 | SUGGESTION | `--verbose` structure undefined | Specify verbose JSON schema or NDJSON format | Prevents agent parsing failures |
| S6 | SUGGESTION | SimConfig types ≠ CLI contract | Document CLI as projection layer; expose seat IDs | Reduces type confusion across layers |
