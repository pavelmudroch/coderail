---
title: Execute verification checks with result reuse
status: closed
depends-on: 0003
reason: done
duplicate-of: 
---

# Execute verification checks with result reuse

Run matching checks sequentially, skip rules with unavailable file dependencies, and reuse completed command results across files. Depends on ticket 0003's compiled rules.

## Tasks

1. [x] Cover dependency checks, execution, and reuse
2. [x] Implement sequential checks and per-file outcomes

## Task details

### 1. Cover dependency checks, execution, and reuse

Scope: add `tests/commands/verify/run-checks.test.ts` using small child processes and filesystem markers.

Expected outcome:

- Cover missing/directory/symlink dependencies, symlink ancestors, non-directory parents, propagated I/O errors, literal expanded dependency paths, and dependency changes caused by earlier commands.
- Prove sequential file/rule/command ordering and execution from the project root.
- Cover success/failure reuse, argument-array cache identity, first failure stopping only its file, and commands first reached by later files remaining eligible.
- Cover launch errors, complete stdout-then-stderr buffering, per-file callback delivery, skipped/ok/fail outcomes, and invocation counters.
- Cover empty commands/lists and cancellation propagating rather than becoming cached failures.

Validation: markers prove actual execution counts and ordering; cached results replay identical command outcomes/output and do not increment execution count.

### 2. Implement sequential checks and per-file outcomes

Scope: create `src/commands/verify/run-checks.ts` exporting the design's `CommandResult`, `FileResult`, and `runChecks` contracts. Keep dependency helpers local.

Expected outcome:

- For each file, visit matching rules in configuration order and check expanded required paths relative to the project root when each rule is reached.
- Require regular files without symlink traversal. Missing files, directories, symlinks, and non-directory parents skip the rule; propagate other I/O errors.
- Execute nonempty arrays through `Deno.Command` with project-root `cwd`, the abort signal, null stdin, and piped stdout/stderr. Zero exit is `ok`; nonzero exit or launch error is `fail`, retaining launch diagnostics.
- Cache completed success/failure by `JSON.stringify(command)`; preserve argument boundaries and exclude empty, unreached, or cancelled commands. Use fixed inherited environment and no persistent cache or concurrency.
- Stop each file at its first failure, continue subsequent files, classify files with no executed/reused commands as `skipped`, and report each completed file once.
- Decode full output streams and save stdout followed by stderr. Return distinct executed-command count and failed-file count.

Validation: run `cr test ./src/commands/verify/run-checks.ts` and `cr test ./tests/commands/verify/run-checks.test.ts`.

## References

- [Design: check execution contract](../../plans/verify-command/DESIGN.md#check-execution-contract)
- [Verify decisions](../../plans/verify-command/IDEA.md)
- Dependency: ticket 0003, compiled rules and expansion
