---
title: "Work Management"
status: "archived"
---

Define one Git-derived review boundary across tickets, orchestrations, and
manual commits. A user or agent can inspect the current context before starting
work and return to the same branch to review its aggregate changes.

## Agreed behavior

- `cr work` shows the work name, current branch, configured upstream, merge
  base, HEAD, and review range. `cr work --json` exposes the same context for
  agents. Both work branches and regular branches use the same comparison.
- `cr work start <work-name>` creates and switches to a dedicated work branch
  with the current **local** branch as its upstream. It requires a clean
  working tree, an existing current local branch with a commit, and an unused
  destination. Starting from an existing work branch fails. Both commands
  have help.
- Work branches use `coderail/work/<work-name>`. The `coderail/work/` prefix
  identifies work branches in status. Archive history keeps its existing
  `coderail/archive-history` ref.
- Normalize new work names with the shared
  [`Text.slugify`](../../../src/utils/text.ts), which treats `/` as a word
  separator. `cr work start internal/archive-history` creates
  `coderail/work/internal-archive-history`. Status reports the suffix of the
  current work branch. Reject an empty slug or an existing destination,
  including collisions from two inputs reducing to the same slug.
- The base is the merge base of HEAD and the configured upstream. HEAD is the
  end of the range. With no upstream or common ancestor, the range is
  unavailable. The boundary covers committed changes and follows the current
  local refs. For ordinary histories, `git diff @{upstream}...HEAD` shows the
  corresponding aggregate patch. The reported commit IDs can also be passed
  to `git diff <base> <head>` to use the reported endpoints directly.
- Git is the sole source of work state. Coderail creates no work metadata,
  fetches no refs, and has no integration with ticket or orchestration state.
  Publishing, merging, rebasing, and deleting branches use standard Git
  commands. `git push -u` can change the upstream and therefore the boundary.

## Edge cases and output

- Both commands operate in a Git working tree, including an uninitialized
  Coderail project, a linked worktree, or a subdirectory selected with `--cwd`.
  Outside a Git working tree, report a command error. Help works without a
  repository.
- Status succeeds on detached HEAD and unborn branches. Detached HEAD has a
  commit and no branch or upstream. An unborn branch has a branch name and no
  HEAD commit. Start rejects both before creating a branch. Status remains
  available in a dirty working tree. Start rejects staged, unstaged, and
  untracked changes that Git reports, including submodule changes. Ignored
  files alone do not prevent starting work.
- Use a single JSON object with `work`, `branch`, `upstream`, `baseCommit`,
  `headCommit`, and `reviewRange`. Each value is a string or `null` when
  absent. Preserve full Git object IDs and represent the range as
  `<baseCommit>..<headCommit>`. In text, display `none` for absent work and
  `unavailable` for missing Git details. Abbreviate object IDs using Git's
  unique abbreviations. An equal base and HEAD still produces a range.
- Keep the upstream name visible when configured but its tracking ref is
  missing. In that case, or when the histories have no common ancestor, report
  a missing base and range. Use Git's selected merge base if there are
  multiple. Git execution failures surface as command errors rather than
  successful reports with missing fields.
- Validate start before switching. Let Git create and switch in one operation
  with explicit direct tracking of `refs/heads/<current-branch>`, so Git
  configuration and a same-named tag cannot change the selected upstream.
  Report the new branch on success. Use the CLI's standard error and usage
  handling.

## Command structure

- Register `work` in [`src/commands/cr.ts`](../../../src/commands/cr.ts).
  [`src/commands/work.ts`](../../../src/commands/work.ts) owns status
  arguments, help, dispatch to `start`, and text and JSON rendering.
  [`src/commands/work/start.ts`](../../../src/commands/work/start.ts) owns the
  start command's arguments, help, and success output. The reviewed stubs show
  the command split, argument parsing, help, and dispatch. Both handlers use
  the existing command contract. The execution path uses the runtime working
  directory and abort signal, with parseable JSON on stdout and a
  trailing newline.
- `src/work.ts` owns Git state inspection, branch classification, validation,
  and switching. The two command handlers call
  `getWorkStatus(cwd: string, signal: AbortSignal): Promise<WorkStatus>` and
  `startWork(cwd: string, workName: string, signal: AbortSignal): Promise<string>`
  respectively. `WorkStatus` has the six fields above. `startWork` returns the
  new branch name. Both reject on execution errors. Keep Git execution and
  classification helpers private. Work classification needs only the work
  branch prefix. The existing archive and Verify code use private Git runners.
  Work needs to interpret expected nonzero statuses for queries such as
  `git merge-base`, while the existing runners throw on those statuses.
- Document usage, review semantics, and `git push -u` in
  [`docs/COMMANDS.md`](../../../docs/COMMANDS.md).

## Verification expectations

- Exercise the CLI in temporary Git repositories. Verify that start switches
  to the expected branch, configures direct tracking of the previous local
  branch, and leaves its tip untouched. Include nested directories or linked
  worktrees and a repository without Coderail initialization.
- Check that dirty, detached, unborn, nested-work, duplicate, and invalid
  starts fail before changing HEAD or creating a branch. Exercise staged,
  unstaged, untracked, and ignored files. Cover normalization, slug collisions,
  and recognition of the work prefix alongside the existing archive ref.
- Compare reported endpoints with Git for regular and work branches with
  advancing or diverging upstreams, equal tips, no upstream, a missing tracking
  ref, and unrelated histories. Cover detached and unborn status, and verify
  that dirty file changes leave the reported endpoints unchanged.
- Verify text and raw JSON output, valid help outside Git, argument errors,
  and execution errors. Confirm status leaves Git refs and configuration
  untouched.

## Readiness

The work prefix, work-name normalization, CLI stubs, status contract, and Git
module interface are approved. The command handlers use the two work operations
above. Subprocess handling and Git query details are implementation choices
within the work module.
