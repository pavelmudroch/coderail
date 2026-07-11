---
name: ticket-implement
description: Guidance for implementing a project ticket through task decomposition, delegation, verification, and iteration.
---
Call `cr ticket activate <ticket-id>` when starting implementation.
Do not move ticket files or edit ticket lifecycle frontmatter by hand.

The <ticket-id> can be:
- numeric prefix in file name, e.g. for `0001-some-feature.md` the ticket id is `0001`
- ticket file name without extension
- ticket file path absolute or relative to current working directory

The `cr` tool handles all ticket id representations

## Implementation steps

### 1. Understand

Understand the ticket goal and constraints. Clarify any ambiguities before proceeding.

### 2. Delegate

Find first non completed (unchecked - [ ]) task to work on. Optionally delegate to worker agents when useful.
All tasks must be done in serial order from first (1.) to last (n.).

### 3. Review

Review results, verify against the task verification criteria (if any), and iterate until acceptable.
Mark task as completed (checked - [x]) when acceptable.

Always run `cr test <paths ...>` with paths of changed files to verify changes pass.
Or when git diff was clean you can use `cr test --changed` to run tests on changed files.

If provided path is directory, this will run tests for all files recursively in that directory.

To see full failed test output run `cr --verbose test <paths ...>` or `cr --verbose test --changed`.

### 4. Summarize

Summarize the result and verification performed.
Mention remaining risks or unverified areas.
Call `cr ticket close <ticket-id>` script when all tasks are completed and ticket is delivered.
Do not close a ticket until verification evidence is recorded in the summary.

## Rules

- Do not accept worker output without review.
- Do not expand scope during implementation.
- Keep user-facing updates concise.
- If blocked, report blocker and smallest useful next step.

## CR tool

If additional guidance for `cr` tool needed, use <skill>cr</skill>.
