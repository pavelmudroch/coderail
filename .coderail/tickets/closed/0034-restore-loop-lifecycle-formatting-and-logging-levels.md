---
id: "0034"
slug: "restore-loop-lifecycle-formatting-and-logging-levels"
title: "Restore loop lifecycle formatting and logging levels"
status: "closed"
created_at: "2026-11-10T13:11:57.311Z"
updated_at: "2026-11-10T13:24:56.047Z"
dependencies:
  - "0032"
reason: "done"
---

# Restore loop lifecycle formatting and logging levels

Restore the agreed preflight, step, iteration, and final loop output while routing
permanent lines through the required logging levels. REVIEW.md supersedes the
older IDEA.md agreement to retain every step completion line in quiet mode.

## Tasks

1. [x] Add lifecycle formatting, failure, and logging-level regression tests
2. [x] Restore lifecycle layout and route summaries through the correct log methods
3. [x] Verify modified source and test files

## Task details

### 1. Add lifecycle formatting, failure, and logging-level regression tests

Scope: `tests/commands/loop/run-loop.test.ts`; update existing output assertions
and reporting hooks as needed without weakening orchestration assertions.

Expected outcome: assert `Preflight:` and validation details, one overall
`Preflight complete [ ok | fail ]` line across distinct validation probes,
numbered ticket iteration headings, indented `Implement/Review/Stage/Commit
complete [ ok | fail ]` lines, readable elapsed durations such as `2m 32s`, and
`Iteration N: ticket ID complete [ ok | fail ]` summaries. Use controlled elapsed
time where needed to verify minute/second formatting without slow real waits.

Validation: cover successful runs, multiple preflight probes, preflight rejection,
implementation/review/staging/commit failures, cancellation, and review reopening
a ticket. Require detailed step failure reasons and the final attempt count,
stop reason, and unfinished ticket when applicable. Ordinary limit/queue stops
remain successful; iteration completion does not imply ticket closure.

Assert both selected log methods and actual visible output across quiet, normal,
and verbose levels, including non-interactive operation:

- Final `Loop complete [ ok | fail ] ...` uses `Log.output` in every mode.
- Iteration completion/status summaries use `Log.info` (normal and verbose).
- All other permanent lifecycle lines use `Log.notice` (verbose only), including
  headings, validation details, overall preflight completion, step completions,
  and any commit-skipped detail.

Quiet retains the final summary; normal adds iteration status; verbose adds the
full lifecycle layout. Preserve active-step spinners where enabled, disable
animation non-interactively, and keep native agent output out of lifecycle logs.
Use the real log-level filtering in visibility assertions so a stub that ignores
levels cannot falsely establish correct routing.

### 2. Restore lifecycle layout and route summaries through the correct log methods

Scope: `src/commands/loop/run-loop.ts` and its reporting contract/callers only
where needed. Keep changes focused on lifecycle reporting.

Expected outcome: implement task 1's layout and duration formatting. Aggregate
preflight status across all required distinct probes, including failures; emit
iteration success/failure summaries with ticket identity and elapsed time.
Preserve detailed failure reasons and the final attempt count, stop reason,
and unfinished ticket. Route final, iteration, and other permanent lifecycle
lines through `Log.output`, `Log.info`, and `Log.notice`, respectively. Ensure
an injectable reporting hook does not bypass production routing or erase the
category needed to test it. Update affected existing reporting-hook assertions.

Preserve spinner behavior, agent-output separation, enabled-stage order, logging
to JSONL, and failure/stop semantics. Do not change global logging behavior to
force loop visibility. README and help documentation changes remain deferred per
REVIEW.md; the revised routing here supersedes the previous quiet-mode contract.

Validation: task 1's formatting/routing matrix passes, with failures reported at
the required levels and no later stage started after failure. Review reopening
still produces an iteration result plus unfinished-ticket context in the final
summary when appropriate. Existing loop workflow regressions remain passing.

### 3. Verify modified source and test files

Scope: each source/test file changed for this ticket.

Expected outcome: resolve verification failures and record passing commands/results.

Validation: run `cr verify ./src/commands/loop/run-loop.ts` and
`cr verify ./tests/commands/loop/run-loop.test.ts`; run the corresponding per-file
`cr verify` command for any additional modified source/test file. Fix and repeat
until passing, as required by AGENTS.md.

## References

- [Current output and routing agreement](../../plans/loop-command/REVIEW.md#agreed-changes)
- [Deferred documentation](../../plans/loop-command/REVIEW.md#deferred-documentation)
- [Original layout examples; quiet-mode rules superseded by REVIEW.md](../../plans/loop-command/IDEA.md#agreed-output-and-interruption)
- [Loop orchestration and reporting](../../../src/commands/loop/run-loop.ts)
- [Loop reporting and workflow regressions](../../../tests/commands/loop/run-loop.test.ts)
- [Logging API](../../../src/log.ts)
- [Spinner](../../../src/log/spinner.ts)
- [Repository verification instructions](../../../AGENTS.md)
- Prerequisite: [0032 — Complete commit workflow](../closed/0032-commit-staged-loop-iterations-and-validate-commit-results.md), which depends on the base loop and review workflow.
- Independent companion: [0033 — Harness process-tree shutdown](0033-stop-harness-process-trees-on-cancellation-and-failure.md).

## Verification results

- `cr verify ./src/commands/loop/run-loop.ts` — passed.
- `cr verify ./tests/commands/loop/run-loop.test.ts` — passed.
- `cr verify -s ./src/commands/loop/run-loop.ts ./tests/commands/loop/run-loop.test.ts` — passed.
- All 19 workflow/reporting tests passed; source coverage reported 100%.
- Real logging filters covered quiet, normal, verbose, interactive and
  non-interactive output, failure details, cancellation, reopened tickets, and
  commit skips. Controlled elapsed time verified minute/second formatting.
