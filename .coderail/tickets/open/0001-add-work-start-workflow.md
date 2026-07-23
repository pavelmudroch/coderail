---
id: 0001
slug: add-work-start-workflow
title: Add work start workflow
status: open
created_at: 2026-07-23T13:52:22Z
updated_at: 2026-07-23T13:52:22Z
dependencies: 
---

# Add work start workflow

Add the `cr work start` command and the shared work-state foundation, allowing a
clean checkout to begin tracked branch-local work without carrying inherited
temporary workflow state.

## Tasks

1. [ ] Add focused tests for `work start` dispatch, validation, and cleanup preservation
2. [ ] Add `work` command routing and validated work-state helpers
3. [ ] Implement `cr work start` branch creation and record setup
4. [ ] Preserve `work.ini` during general cleanup

## Task details

### 1. Add focused tests for `work start` dispatch, validation, and cleanup preservation

Establish command-level coverage before implementation.

Expected outcome:

- Tests cover help, unknown subcommands, and invalid start arguments.
- Tests cover Git, initialization, clean-worktree, named-branch, and duplicate-branch prerequisites.
- Tests cover generated `work.ini`, inherited workflow removal, nested starts, and `cr clean` preservation.

Validation:

- `sh test/commands/work.test.sh` exercises isolated repositories.
- `sh test/commands/clean.test.sh` proves dry-run and real cleanup preserve `work.ini`.

### 2. Add `work` command routing and validated work-state helpers

Add the top-level dispatcher and helpers for the strict three-key work record.

Expected outcome:

- `cr work start` and `cr work finish` route consistently and reject invalid usage.
- Work records reject duplicate, missing, empty, multiline, and malformed values without sourcing file contents.

Validation:

- The command tests from task 1 pass for routing and invalid records.

### 3. Implement `cr work start` branch creation and record setup

Create the work branch and its durable record from a clean named branch.

Expected outcome:

- A valid title uses the existing ticket slug rules to create `coderail/<slug>`.
- The new branch contains an unstaged `work.ini` with exact `base_branch`, `work_branch`, and `work_name` values.
- Inherited managed workflow files are removed while permanent configuration remains.

Validation:

- `sh test/commands/work.test.sh` passes start and nested-start scenarios.

### 4. Preserve `work.ini` during general cleanup

Keep the active work record while retaining the established handling of permanent configuration files.

Expected outcome:

- Normal `cr clean` does not delete `.coderail/work.ini`.

Validation:

- `sh test/commands/clean.test.sh` passes.

## References

- `.coderail/SPEC.md`
