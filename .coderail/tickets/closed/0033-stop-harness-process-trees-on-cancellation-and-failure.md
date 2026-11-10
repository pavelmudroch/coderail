---
id: "0033"
slug: "stop-harness-process-trees-on-cancellation-and-failure"
title: "Stop harness process trees on cancellation and failure"
status: "closed"
created_at: "2026-11-10T13:11:57.090Z"
updated_at: "2026-11-10T13:18:17.596Z"
dependencies:
  - "0028"
reason: "done"
---

# Stop harness process trees on cancellation and failure

Ensure stopping a harness session also stops its descendant tool processes, so
abandoned work cannot continue and inherited output pipes cannot keep runner
cleanup pending indefinitely. Deliver the process-lifecycle fix agreed in REVIEW.md.

## Tasks

1. [x] Add process-tree cleanup regression tests
2. [x] Implement complete harness process-tree shutdown
3. [x] Verify modified source and test files

## Task details

### 1. Add process-tree cleanup regression tests

Scope: `tests/harness/runner/runner.test.ts`, with connector integration cases in
`tests/harness/execution.test.ts` where needed to verify the shared contract.
Use a real local fixture harness that spawns a long-lived child tool process and
reports both PIDs after the descendant is ready. Exercise descendants inheriting
stdout/stderr, including a harness parent that exits while the descendant still
holds the pipes open.

Expected outcome: cover abort-signal cancellation, explicit async disposal,
early iterator exit, and execution/protocol failure. Cover a consumer/log-writing
failure during streaming that triggers runner disposal; use the loop regression
suite as an integration reference without taking ownership of its reporting work.
Test repeated disposal and shutdown races without requiring authenticated agents.

Validation: assert the parent and descendant terminate, pending iteration and
async cleanup settle, and `result()` rejects rather than reports success. Use
bounded waits and fixture cleanup so a regression fails promptly without leaking
processes. Verify original execution errors remain actionable. Existing successful
stream draining and final-answer behavior must continue passing.

### 2. Implement complete harness process-tree shutdown

Scope: `src/harness/runner/runner.ts` and focused private lifecycle helpers only
if needed. Both connectors use this shared runner.

Expected outcome: give each session a reliable cleanup boundary that includes
its descendant tool processes. Invoke cleanup for cancellation, async disposal,
early iterator exit, and execution/stream-consumption failures. Handle the case
where parent exit status arrives before inherited output streams close; parent
exit must not prevent descendant shutdown. Await process and stream cleanup,
remove cancellation listeners, wake pending consumers, and reject interrupted
completion. Shutdown must remain idempotent and tolerate already-exited processes.

Validation: task 1's process-tree regressions pass for every stop path; successful
sessions still drain both streams and expose their final answer. Logging failures
must not leave descendants running or disposal waiting on inherited pipes.
Do not introduce automatic retries or change connector prompts/protocols.

### 3. Verify modified source and test files

Scope: each source/test file changed for this ticket.

Expected outcome: resolve verification failures and record passing commands/results.

Validation: run `cr verify ./src/harness/runner/runner.ts` and
`cr verify ./tests/harness/runner/runner.test.ts`; run the corresponding per-file
`cr verify` command for any additional modified source/test file, including
`cr verify ./tests/harness/execution.test.ts` if changed. Fix and repeat until
passing, as required by AGENTS.md.

## References

- [Agreed process-tree fix](../../plans/loop-command/REVIEW.md#agreed-changes)
- [Runner contract and interruption context](../../plans/loop-command/IDEA.md)
- [Shared runner](../../../src/harness/runner/runner.ts)
- [Runner regression suite](../../../tests/harness/runner/runner.test.ts)
- [Connector execution regressions](../../../tests/harness/execution.test.ts)
- [Loop logging-failure disposal coverage](../../../tests/commands/loop/run-loop.test.ts)
- [Repository verification instructions](../../../AGENTS.md)
- Prerequisite: [0028 — Fresh harness sessions](../closed/0028-run-fresh-non-interactive-codex-and-claude-sessions.md).
- Independent companion: [0034 — Loop lifecycle output](0034-restore-loop-lifecycle-formatting-and-logging-levels.md).

## Implementation and validation

Sessions now start in a detached process group. Shutdown kills the entire group,
including descendants whose parent has already exited. Unsuccessful parent exit
triggers cleanup immediately rather than waiting for inherited streams to close.
Existing draining, cancellation listeners, iterator wakeups, and idempotent disposal
remain shared by both connectors.

Real-process regressions cover abort, concurrent/repeated disposal, early iterator
return, consumer/logging failure, protocol failure, unsuccessful parent exit, and
abort/disposal after successful parent exit with inherited pipes still open.
The parent-failure regression reproduced the original cleanup timeout before the fix.

Passing verification:

- `cr verify ./src/harness/runner/runner.ts`
- `cr verify ./tests/harness/runner/runner.test.ts`
- `cr verify -s ./src/harness/runner/runner.ts ./tests/harness/runner/runner.test.ts`
- Runner: 15 tests, 100% coverage, mutation verification passed (no survivors).
- `deno test -A tests/harness/codex.test.ts tests/harness/claude.test.ts tests/commands/loop/run-loop.test.ts`: 45 passed.
- `git diff --check`
