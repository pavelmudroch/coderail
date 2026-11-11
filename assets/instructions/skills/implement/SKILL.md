---
name: implement
description: Implement the next ready ticket.
disable-model-invocation: true
---

## Goal

Implement the specified or next ready ticket, complete all tasks, resolve issues autonomously, pass verification, and close the ticket.

## Boundary

- Accept `<ticket>` as a numeric ID, filename, or ticket path.
- Follow numbered task order by default. Reorder or interleave tasks when justified by dependencies or implementation needs. Preserve explicit prerequisites.
- Treat tasks as scope and validation checkpoints, not strict test-first execution steps.
- Preserve unrelated changes.
- When invoked by `cr loop`, preserve the index: do not stage, unstage, reset, or commit. Let the loop own staging.
- Verify only files changed by this implementation; exclude the ticket file.
- Follow repository-specific verification requirements, including required files and separate invocations.
- Continue autonomously through recoverable failures. Investigate causes and attempt safe solutions without requesting confirmation.
- Stop only when progress requires a user decision, unsafe changes, or actions outside the ticket scope.
- Never mark unvalidated tasks complete or close an incomplete or failing ticket.

## Completion

1. Use the provided `<ticket>` or retrieve the next ready ticket with `cr ticket next -l 1`. Stop if none exists.
2. Activate the ticket with `cr ticket activate <ticket>` and use the returned path.
3. Read the ticket and its tasks. If another ticket already implements its scope, close it with `cr ticket close --reason=duplicate --duplicate-of=<duplicate-ticket> <ticket>` and stop.
4. Implement every task, validate its criteria, and mark it `[x]` only when satisfied. Leave incomplete tasks `[ ]`.
5. Run `cr verify -s <changed-files...>` once with all relevant changed source and test files. Prefer a combined invocation to reuse checks and preparation unless separate invocations are required.
6. Inspect failures with `cr verify <failed-file>`, fix their causes, and repeat relevant checks and the final aggregate verification. Treat any failed check as failure, including failures hidden by later successful commands.
7. If blocked, investigate and attempt safe solutions within scope. Report unresolved issues and stop without closing the ticket when no safe solution remains.
8. Close the ticket with `cr ticket close --reason=done <ticket>` only after completing all tasks and passing verification.