---
id: "0032"
slug: "commit-staged-loop-iterations-and-validate-commit-results"
title: "Commit staged loop iterations and validate commit results"
status: "open"
created_at: "2026-11-10T09:06:53.948Z"
updated_at: "2026-11-10T09:06:53.948Z"
dependencies:
  - "0031"
---

# Commit staged loop iterations and validate commit results

Add optional commit after review and unconditional staging, completing the full
`cr loop -rc` workflow. Successful commits must consume staged work and leave the
initialized project clean; preserve resulting work on any failure.

## Tasks

1. [ ] Add commit CLI, preflight, and startup-index tests
2. [ ] Add commit ordering, postcondition, and end-to-end workflow tests
3. [ ] Implement optional commit execution and Git postconditions
4. [ ] Complete user documentation and verify modified files

## Task details

### 1. Add commit CLI, preflight, and startup-index tests

Scope: `tests/commands/loop.test.ts` and temporary Git/fake-runner suites under
`tests/commands/loop/`.

Expected outcome: `-c`/`--auto-commit` enables commit independently of review;
`-rc` and equivalent flag combinations enable both. Default remains both disabled.
Reject boolean flag values and malformed combined options. Resolve commit
settings independently and preflight every distinct enabled effective combination
once before implementation; disabled-stage combinations never probe.

Validation: cover all four review/commit combinations and a bad commit setting
stopping before implementation even when implementation/review settings are valid.
With auto-commit, reject any initially staged changes outside the initialized
subtree, including nested Coderail projects inside a larger Git repo. Without it,
continue preserving allowed outside staged changes. Outside unstaged/untracked
changes remain allowed with either mode and are never staged by the loop.

### 2. Add commit ordering, postcondition, and end-to-end workflow tests

Scope: fake commit sessions issuing controlled Git operations in temporary repos.

Expected outcome: exact order is implement, optional review, stage, optional
commit, reselect. A reopened original or new follow-up does not suppress commit
of a successful review iteration. Commit only when staging leaves a staged diff;
otherwise skip the invocation instead of creating an empty commit. Accept one or
more new commits from the commit skill.

Validation: a successful commit requires successful session completion, at least
one new commit when staged changes existed, and a clean initialized project scope
(no remaining staged/unstaged/untracked project work). Cover session success with
no commit, leftover staged work, newly dirty project state, native Git failure,
log-write failure, cancellation, and permitted outside dirty work. Every failure
stops before any later iteration and preserves work/index/created commits.

Exercise full `--limit 1 -rc` with review reopening the ticket: review, staging,
and commit finish before the successful limit stop, with an unfinished-ticket
summary. Exercise same-run reselection of reopened/deferred work, shared
preflight deduplication across three stages, empty/blocked queues, no empty
commit, and commit-disabled accumulation. Assert commit JSONL routing, completion
lines/durations, and process cleanup through the shared stage executor.

### 3. Implement optional commit execution and Git postconditions

Scope: `src/commands/loop.ts`, `src/commands/loop/run-loop.ts`,
`src/commands/loop/git.ts`, and existing private prompt/reporting helpers.

Expected outcome: implement commit/combined flags, include enabled commit
settings in startup preflight, and add the outside-index startup restriction.
After optional review and unconditional scoped staging, inspect the staged diff;
invoke the commit skill only when nonempty. Prompt supplies the staged scope and
preserves initially unstaged/untracked changes under the existing commit skill.
Use the same selected harness, fresh session, cwd, signal, streamed execution,
and async disposal. Do not modify the commit skill's immutable staged-scope rule.

Capture the pre-commit Git state needed to require new commits and clean project
postconditions. A successful session alone is insufficient. Report
`Committing...` and contextual status/duration completion; log `step: 'commit'`
under the selected ticket's file. Failure/cancellation halts immediately with no
rollback, automatic retry, amend, recovery, or push. Count implementation attempts
only; limit enforcement waits for the entire current iteration to finish.

Validation: tasks 1–2 pass for commit-only and combined modes. Successful commit
consumes all staged project work, preserves allowed outside dirty content, and
never begins after failed review/staging or an abort.

### 4. Complete user documentation and verify modified files

Scope: `README.md`, loop help text, and all source/test files changed here.

Expected outcome: document the complete flag matrix, combined short flags,
review-before-stage-before-commit ordering, unconditional staging, extra outside
index restriction, empty-diff skip, commit postconditions, settings/preflight,
interruption behavior, logs, and final summaries. Pushing remains user-controlled.

Validation: run `cr verify ./src/<path-to-file>.ts` for every modified source file
and `cr verify ./tests/<path-to-file>.test.ts` for every modified test file; fix
failures and repeat until passing. Record passing commands/results and confirm
the complete idea's workflow matrix uses no live authenticated model calls.

## References

- [Approved workflow](../../plans/loop-command/IDEA.md#agreed-workflow)
- [Startup cleanliness and independent flags](../../plans/loop-command/IDEA.md#agreed-cli-behavior)
- [Commit postconditions and edge cases](../../plans/loop-command/IDEA.md#agreed-edge-case-contracts)
- [Verification matrix](../../plans/loop-command/IDEA.md#agreed-verification-expectations)
- [Loop command](../../../src/commands/loop.ts)
- [Commit skill](../../../assets/instructions/skills/commit/SKILL.md)
- [Repository verification instructions](../../../AGENTS.md)
- Prerequisite: ticket 0031 (review integration), transitively 0030 (base loop).
- Settings and runner contracts: tickets 0029 and 0028.
