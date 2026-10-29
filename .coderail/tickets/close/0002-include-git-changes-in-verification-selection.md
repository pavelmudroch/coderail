---
title: Include Git changes in verification selection
status: closed
depends-on: 0001
reason: done
duplicate-of: 
---

# Include Git changes in verification selection

Allow `--changed` to include staged, unstaged, and untracked regular files within the Coderail project. Depends on ticket 0001's selection module.

## Tasks

1. [x] Cover Git selection in temporary worktrees
2. [x] Add Git status discovery and selection

## Task details

### 1. Cover Git selection in temporary worktrees

Scope: extend `tests/commands/verify/select-files.test.ts` with temporary Git repositories.

Expected outcome:

- Cover staged/unstaged/untracked files, rename/copy records and their extra source-path record, deletions, spaces/newlines and other unusual filenames.
- Cover a Coderail project nested inside a larger worktree, invocation from a subdirectory, filtering outside-project changes, and union/deduplication with explicit paths.
- Cover changed symlinks and symlink ancestors, missing entries, non-worktrees, Git launch errors, and cancellation. Use controlled status records where necessary for copy coverage.

Validation: selected paths include destinations rather than rename/copy sources, exclude deleted and outside-project files, and remain sorted and unique.

### 2. Add Git status discovery and selection

Scope: complete the `changed` branch in `src/commands/verify/select-files.ts`, retaining ticket 0001's explicit selection behavior.

Expected outcome:

- Discover the enclosing Git worktree root, then run `git status --porcelain=v1 -z --untracked-files=all` from that root.
- Parse NUL-delimited records and consume rename/copy source records; select destination paths.
- Filter to the Coderail project, apply the same regular-file and symlink-component policy, ignore deleted/missing Git entries, and merge with explicit selections.
- Require Git only for changed selection; propagate missing executable/non-worktree errors and pass the abort signal to Git subprocesses.

Validation: run `cr test ./src/commands/verify/select-files.ts` and `cr test ./tests/commands/verify/select-files.test.ts`.

## References

- [Design: file selection contract](../../plans/verify-command/DESIGN.md#file-selection-contract)
- [Verify decisions](../../plans/verify-command/IDEA.md)
- Dependency: ticket 0001, explicit file selection
