---
id: "0064"
slug: "start-a-work-branch-with-direct-local-tracking"
title: "Start a work branch with direct local tracking"
status: "closed"
created_at: "2026-11-27T09:39:52.432Z"
updated_at: "2026-11-27T09:54:52.383Z"
dependencies:
  - "0063"
reason: "done"
---

# Start a work branch with direct local tracking

Deliver `cr work start <work-name>` so users can create a dedicated branch whose review boundary follows the local branch they started from. Build on the work command and Git handling in ticket 0063.

## Tasks

1. [x] Specify branch start behavior in temporary Git repositories
2. [x] Implement validated branch creation and switching
3. [x] Wire and document the start command

## Task details

### 1. Specify branch start behavior in temporary Git repositories

Add CLI coverage in `tests/commands/work/start.test.ts` using temporary repositories, including a linked worktree or a nested directory selected with `--cwd` and a repository without Coderail initialization.

**Expected outcome**

- Assert that start switches to the normalized branch, directly tracks the previous local branch, and leaves its tip untouched. Exercise conflicting tracking configuration and a same-named tag.
- Cover staged, unstaged, untracked, and submodule changes, and confirm ignored files alone permit start. Cover detached or unborn HEAD, starting inside a work branch, slug collisions, an empty slug, and existing destinations.
- Exercise start help outside Git, invalid arguments, outside-Git errors, and the success message. After a successful start, confirm `cr work --json` reports the new work name and upstream.

**Validation**

- Run the focused tests. Failed starts must preserve HEAD and branch refs, and successful starts must configure a local upstream even when Git's default tracking would choose differently.

### 2. Implement validated branch creation and switching

Add `startWork(cwd: string, workName: string, signal: AbortSignal): Promise<string>` in `src/work.ts`, reusing the private Git operations and work-prefix classification from 0063.

**Expected outcome**

- Normalize via the shared `Text.slugify` utility, including slash-separated names. Reject an empty slug, an existing destination, a current work branch, a detached or unborn HEAD, and tracked or untracked changes that Git reports, including submodule changes.
- Validate the checkout and destination before mutation. Ask Git to create and switch in one operation with explicit direct tracking of `refs/heads/<current-branch>`. Return the new branch name on success and propagate Git errors and cancellation.

**Validation**

- Type-check the exported operation. Confirm the start fixtures see unchanged refs and HEAD on validation failures, direct local tracking on success, and `coderail/work/internal-archive-history` for `internal/archive-history`.

### 3. Wire and document the start command

Replace the placeholder in the reviewed `src/commands/work/start.ts` stub with a call to `startWork` using the runtime working directory and abort signal. Add start usage to the work section of `docs/COMMANDS.md`.

**Expected outcome**

- Preserve the reviewed argument and help behavior, use the CLI's standard error handling, and report the branch name on success.
- Document clean checkout requirements, name normalization and collisions, local upstream tracking, and standard Git commands for publishing, merging, rebasing, and deleting branches.

**Validation**

- Run the focused status and start tests. Confirm start help works outside Git and the documented start example creates a work branch that status can inspect.

## References

- [Work Management idea](../../plans/work-management/IDEA.md)
- [0063 — Show Git work context and review range](0063-show-git-work-context-and-review-range.md)
- [Reviewed start command stub](../../../src/commands/work/start.ts)
- [Shared slug utility](../../../src/utils/text.ts)
- [Command guide](../../../docs/COMMANDS.md)
