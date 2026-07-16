---
id: 0002
slug: stage-loop-infrastructure-beneath-ignored-directories
title: Stage loop infrastructure beneath ignored directories
status: closed
created_at: 2026-07-16T14:48:22Z
updated_at: 2026-07-16T14:54:38Z
dependencies: 
close_reason: done
---

# Stage loop infrastructure beneath ignored directories

Allow the ticket loop to stage its newly created ignore file when an ancestor
rule ignores the loop directory, without changing user-managed ignore policy.

## Tasks

1. [x] Add first-use ignored-directory regression coverage
2. [x] Force-stage only new loop infrastructure

## Task details

### 1. Add first-use ignored-directory regression coverage

Extend the ticket-loop tests with a repository whose tracked root
`.gitignore` ignores `.coderail/loop/`.

Expected outcome:

- First-use setup stages `.coderail/loop/.gitignore`.
- The planned transcript remains ignored and the agent is invoked.
- A failed first handoff leaves only the generated infrastructure file staged.

Validation:

- The regression fails with the current normal `git add`.
- `sh test/commands/ticket/loop.test.sh` passes after the implementation.

### 2. Force-stage only new loop infrastructure

Change the loop's existing newly-created-ignore branch to force-add the exact
ignore file, then retain the transcript ignored-path check before invocation.

Expected outcome:

- A higher-level ignore rule no longer blocks first use.
- Existing nested ignore files are neither changed nor force-staged.
- No transcript or unrelated path is force-staged.

Validation:

- `sh test/commands/ticket/loop.test.sh`

## References

- `.coderail/SPEC.md`
- `.coderail/REVIEW.md`
