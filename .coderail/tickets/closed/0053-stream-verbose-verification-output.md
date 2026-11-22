---
id: "0053"
slug: "stream-verbose-verification-output"
title: "Stream verbose verification output"
status: "closed"
created_at: "2026-11-22T16:20:59.258Z"
updated_at: "2026-11-22T16:44:22.613Z"
dependencies: []
reason: "done"
---

# Stream verbose verification output

By default, `cr verify` shows each verification command and streams its output while it runs. This applies to file checks, preparation, and cleanup.

## Tasks

1. [x] Add regression coverage for live output and output modes
2. [x] Stream complete lines from the shared command executor
3. [x] Enable live output by default

## Task details

### 1. Add regression coverage for live output and output modes

Extend the verification runner and CLI tests. Use a child that emits a complete line to each pipe and waits for a parent-controlled release signal. Drain the CLI pipes concurrently and release the child only after both markers arrive on stderr. Give the fixture a bounded wait and always tear it down on failure.

Expected outcome:

- The live check proves the command heading precedes its output and both streams are visible on stderr before the child exits. Final file and command statuses appear on stdout.
- Runner coverage exercises independent stream decoding, split chunks, LF and CRLF, final unterminated lines, and line order within each stream. Assertions allow either order between streams.
- CLI coverage exercises live preparation and cleanup output in default mode and a shared expanded command whose output and heading appear once while both files receive statuses.
- Mode coverage exercises default streaming, quiet suppression of command output, short status reporting, and dry-run planned statuses with no child execution. `--short` also suppresses live headings and child output with `--verbose`.

Validation:

- Confirm the live-output regression detects the existing buffered behavior and passes after tasks 2 and 3.
- Run `cr verify ./tests/commands/verify/run-checks.test.ts` and `cr verify ./tests/commands/verify.test.ts` once the implementation is in place.

### 2. Stream complete lines from the shared command executor

In `run-checks.ts`, expose optional notifications for command start and output lines through `executeCommand`, and pass them through `runChecks` on cache misses. Invoke the start notification before launching a real child. Preserve the existing buffered path for callers that do not request streaming.

Expected outcome:

- Read stdout and stderr concurrently with independent decoders. Emit a line when LF arrives, consume CRLF as one delimiter, and flush a final unterminated line at EOF. Preserve order within each stream.
- Await both readers and the child status before returning. Preserve failure results, execution diagnostics, and cancellation behavior while settling the child and its readers.
- Dry runs return planned results without launching or emitting notifications. Reused results retain statuses for each matching file and do not trigger notifications again.

Validation:

- Check framing, cache reuse, buffered output, cancellation, and dry-run behavior with the runner tests. Run `cr verify ./src/commands/verify/run-checks.ts` and `cr verify ./tests/commands/verify/run-checks.test.ts`.

### 3. Enable live output by default

In `verify.ts`, enable live reporting for normal and verbose executions. Pass the same notifications to file checks and both hook phases. Publish the command heading and each live line through `Log.info`.

Expected outcome:

- Command headings and live child lines appear on stderr. Existing statuses remain on stdout, including preparation and cleanup results and per-file statuses for cached commands.
- The completion report does not replay streamed output. Execution errors remain visible under the applicable output mode, and existing failure, exit-code, and cleanup behavior still applies.
- Quiet mode suppresses command output while retaining detailed statuses. Short mode prints file statuses and preparation or cleanup failures. Dry runs print planned statuses for commands without launching them.

Validation:

- Run `cr verify ./src/commands/verify.ts` and `cr verify ./tests/commands/verify.test.ts`. Reverify any files changed after an earlier check.

## References

- [Agreed idea](../../plans/stream-verbose-verification-output/IDEA.md)
- [Verify command](../../../src/commands/verify.ts)
- [Shared verification runner](../../../src/commands/verify/run-checks.ts)
- [Verify CLI tests](../../../tests/commands/verify.test.ts)
- [Runner tests](../../../tests/commands/verify/run-checks.test.ts)
- [Per-file verification instructions](../../../AGENTS.md)
