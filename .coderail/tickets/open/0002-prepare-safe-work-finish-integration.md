---
id: 0002
slug: prepare-safe-work-finish-integration
title: Prepare safe work finish integration
status: open
created_at: 2026-07-23T13:52:22Z
updated_at: 2026-07-23T13:52:22Z
dependencies: 0001
---

# Prepare safe work finish integration

Implement the non-interactive part of `cr work finish`: validate and checkpoint
work, prepare a clean squash result on the recorded base branch, and retain only
non-Coderail integration changes.

## Tasks

1. [ ] Add focused tests for finish preconditions and safe squash outcomes
2. [ ] Validate and checkpoint recorded work before switching branches
3. [ ] Prepare and clean the squash result on the recorded base branch
4. [ ] Handle conflicts and no-op integration results safely

## Task details

### 1. Add focused tests for finish preconditions and safe squash outcomes

Define the observable finish behavior before implementation.

Expected outcome:

- Tests cover invalid or mismatched work records, wrong or detached branches, dirty states, ticket readiness, checkpointing, and dirty-base recovery.
- Tests cover normal staged code integration, nested workflow restoration, Coderail cleanup, conflicts, and empty integration results.

Validation:

- `sh test/commands/work.test.sh` passes in isolated repositories.

### 2. Validate and checkpoint recorded work before switching branches

Reject invalid work early and commit staged progress only after ticket readiness passes.

Expected outcome:

- `finish` accepts no arguments and rejects untracked or unstaged changes.
- Valid tickets satisfy the same rule as `cr clean` before the fixed checkpoint commit.
- The committed work record is re-read and verified before integration.
- Base checkout requires a clean worktree and returns to the work branch on failure when Git permits it.

Validation:

- The precondition and checkpoint cases in `sh test/commands/work.test.sh` pass.

### 3. Prepare and clean the squash result on the recorded base branch

Squash the work branch without committing and immediately discard incoming managed workflow state.

Expected outcome:

- The base index retains only non-Coderail changes after a conflict-free squash.
- Every managed path present on base is restored with its exact content and mode; child-only managed paths are removed.
- `.coderail/conf.ini` and `.coderail/test.map` retain their existing permanent-configuration behavior.

Validation:

- `sh test/commands/work.test.sh` passes normal, nested, and managed-add/edit/delete cleanup cases.

### 4. Handle conflicts and no-op integration results safely

Resolve only managed workflow conflicts to base state, and stop safely for every other conflict.

Expected outcome:

- Managed workflow conflicts are cleaned immediately in favor of base state.
- Other conflicts run `git reset --merge`, return to the work branch, and provide retry guidance.
- A cleaned index identical to base `HEAD` reports no integration changes and exits successfully without prompting.

Validation:

- `sh test/commands/work.test.sh` passes Coderail-only conflict, code-conflict recovery, and no-op integration cases.

## References

- `.coderail/SPEC.md`
- Depends on `0001-add-work-start-workflow`
