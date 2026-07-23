# Scope Summary

## Problem / Goal

Provide a `cr work` lifecycle that starts named work on a dedicated branch and safely prepares its completed changes for squash integration.

## Context

Coderail's existing workflow is branch-oriented, stores temporary state in `.coderail`, and currently leaves integration policy to the user. `work` command files already exist as placeholders.

## Selected Approach

Add `start` and `finish` subcommands around a persisted, work-branch-committed record containing the original branch, work branch, and work name. Support nested work by creating a child work branch from the current work branch. Finish captures workflow context from the committed work branch, then produces a base-branch squash result containing only non-Coderail changes.

## Why This Approach

It automates repetitive branch and workflow-state handling while retaining a user decision for the final commit.

## Alternatives Considered

- Keep the current manual branch and integration workflow: simpler, but does not meet the requested automation goal.
- Reject any start when `work.ini` exists: simpler state handling, but prevents splitting an active work item into nested work.

## Constraints

- Start requires a Git repository with initialized `.coderail`, a named current branch, and a completely clean worktree. It rejects an existing target branch but may replace an inherited `work.ini` on the new branch.
- Finish only on the recorded work branch, with no untracked or unstaged changes and every ticket satisfied by the existing `cr clean` rules. It commits any staged changes with a default message before switching to the base branch.
- Start may use an existing `work.ini` from its base branch and overwrites it in the new child-work branch, enabling nested work. After creating the branch, it removes inherited stale Coderail workflow files before recording the new work state.
- Before squash merge, finish verifies the base branch has no tracked, staged, unstaged, or untracked changes; if it is not clean, it returns to the work branch and fails with cleanup guidance.
- Exclude child Coderail workflow changes from the squash result. For nested work, restore managed workflow files to their exact committed base-branch state, preserving the parent workflow.
- Automatically resolve conflicts affecting only managed Coderail workflow files in favor of the base branch.
- If a non-Coderail conflict remains, discard the partial squash result with `git reset --merge`, return to the work branch, and fail with guidance to merge the base branch into the work branch before retrying finish.
- Finish squash-merges into the recorded base branch without committing first.
- Workflow files must not be included in the integration commit.
- The user decides whether an automatic commit is created.
- `work.ini` remains committed on the completed work branch but is excluded from the integration result. Nested work preserves the parent branch's existing `work.ini`.
- Automatic commits accept an optional supported agent tool; otherwise they use `default_tool` and fail when no default is configured.
- fter a successful squash, exclude all child workflow changes from the integration result regardless of the automatic-commit decision. For nested work, restore the parent branch’s committed workflow state; otherwise remove the child workflow files from the result.
- f automatic commit generation or `git commit` fails, perform no rollback and preserve the cleaned non-Coderail squash result staged on the base branch. Full workflow context remains committed on the completed work branch.
- f the user declines automatic commit, retain the cleaned non-Coderail squash result staged on the base branch for manual commit.


## Non-goals

- Remote pushing, pull requests, and changing the repository's broader integration policy.

## Open Questions

- No material scope questions remain. Exact CLI syntax, slugification, default commit wording, agent-output parsing, and diagnostics belong in the specification.

## Readiness

Ready for specification.
