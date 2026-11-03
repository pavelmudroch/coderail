---
name: commit
description: Commit staged Git changes into logically coherent commits
disable-model-invocation: true
---

## Goal

Create one or more logically coherent commits from currently staged Git changes.

Group changes by purpose, not by file. Separate independent concerns into distinct commits. Keep related implementation, tests, documentation, and configuration together.

Follow repository conventions and use Conventional Commits:

`<type>[optional scope]: <description>`

Use `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, or `style`. Keep descriptions concise and intent-focused. Add bodies or footers when useful.

## Boundary

- Treat the initial staged diff as the complete and immutable commit scope.
- Never include initially unstaged or untracked changes.
- Preserve existing unstaged and untracked changes.
- Split individual files or hunks across commits when necessary.
- Stage only changes belonging to the current commit.
- Never use `git add .` or `git add -A`.
- Never modify source files to facilitate commits.
- Never amend existing commits.

## Completion

1. Inspect `git status --short`, `git diff --cached`, `git diff`, and `git log -10 --oneline`.
2. Stop if no changes are staged.
3. Identify independent change groups within the initial staged diff.
4. Isolate each group using explicit paths or patch-based staging.
5. Verify each staged group with `git diff --cached`.
6. Commit each group using Conventional Commits.
7. Verify the result with `git status --short` and `git log --oneline -n <count>`.
8. Confirm all initially staged changes were committed and all initially unstaged and untracked changes remain intact.
9. Summarize created commits and their contents.