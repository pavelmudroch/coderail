---
id: "0063"
slug: "show-git-work-context-and-review-range"
title: "Show Git work context and review range"
status: "closed"
created_at: "2026-11-27T09:39:49.115Z"
updated_at: "2026-11-27T09:46:30.403Z"
dependencies: []
reason: "done"
---

# Show Git work context and review range

Deliver `cr work` so users and agents can inspect the current checkout and identify the exact commits that bound its aggregate review.

## Tasks

1. [x] Specify status behavior in temporary Git repositories
2. [x] Implement Git-derived work status
3. [x] Register, render, and document work status

## Task details

### 1. Specify status behavior in temporary Git repositories

Add CLI coverage in `tests/commands/work.test.ts` using temporary repositories and the existing command test conventions. Exercise a checkout without Coderail initialization and a nested directory selected with `--cwd`.

**Expected outcome**

- Cover regular and work branches, the work suffix, the distinct archive branch, and dirty checkouts. Snapshot refs and configuration around status calls.
- Compare endpoints with Git for advancing and diverging upstreams and equal tips. Cover missing upstream configuration, a configured upstream whose ref is missing, unrelated histories, detached HEAD, and unborn branches.
- Assert the raw JSON shape and trailing newline, text labels and Git abbreviations, top-level and work help outside Git, invalid arguments, and command errors outside Git and on an unexpected Git failure.

**Validation**

- Run the focused tests. Once implemented, fixtures verify full IDs against Git, preserve the name of a missing upstream, and confirm that dirty files leave the endpoints unchanged and status leaves refs and configuration untouched.

### 2. Implement Git-derived work status

Add `WorkStatus` and `getWorkStatus(cwd: string, signal: AbortSignal): Promise<WorkStatus>` to `src/work.ts`. Keep the Git runner and work-prefix classification private. Use the supplied working directory and abort signal for Git subprocesses.

**Expected outcome**

- Resolve branch, configured upstream, and HEAD from local Git state. Classify only `coderail/work/` branches as work and report their suffix.
- Use Git's selected merge base when the upstream ref and HEAD resolve. Return `baseCommit` and `reviewRange` as null when the comparison is unavailable, and form `<baseCommit>..<headCommit>` even when the endpoints match.
- Distinguish expected query statuses from execution failures. Support linked worktrees and nested directories and reject invocations outside a Git working tree.

**Validation**

- Type-check the module and confirm the status fixtures agree with Git on branch, upstream, merge base, and HEAD. Exercise an unexpected Git failure and confirm it exits through the command error path.

### 3. Register, render, and document work status

Register `work` in `src/commands/cr.ts` and wire the reviewed `src/commands/work.ts` stub to the status operation using the runtime working directory and abort signal. Document status in `docs/COMMANDS.md`.

**Expected outcome**

- Preserve the reviewed argument, help, and dispatch behavior. Emit one newline-terminated JSON object with string or null values for `work`, `branch`, `upstream`, `baseCommit`, `headCommit`, and `reviewRange`.
- In text, use `none` for absent work, `unavailable` for missing Git details, and Git's unique abbreviations for object IDs. Keep Git subprocess plumbing private to `src/work.ts`.
- Explain the committed review boundary, how to compare with the upstream three-dot diff or the two reported endpoints, and how `git push -u` can change the upstream.

**Validation**

- Run the focused work and root command tests. Confirm help works without a repository and JSON stdout parses directly.

## References

- [Work Management idea](../../plans/work-management/IDEA.md)
- [Root command](../../../src/commands/cr.ts)
- [Reviewed work command stub](../../../src/commands/work.ts)
- [Root command tests](../../../tests/commands/cr.test.ts)
- [Archive history ref](../../../src/archive/history.ts)
- [Command guide](../../../docs/COMMANDS.md)
