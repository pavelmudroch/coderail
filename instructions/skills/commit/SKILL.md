---
name: commit
description: Commit changes to the Git repository
disable-model-invocation: true
---

Create one or more commits from currently staged Git changes.

Treat the staged diff at invocation time as the complete commit input. Never include originally unstaged or untracked changes.

## Inspect

Inspect:

```sh
git status --short
git diff --cached
git diff
git log -10 --oneline
```

If nothing is staged, stop.

Use recent history to follow repository conventions.

## Group

Group changes by logical purpose, not by file.

Use one commit per coherent change. Split independent features, fixes, refactors, docs, tests, tooling, cleanup, or other unrelated concerns.

A single file may belong to multiple commits. Split hunks when needed.

Keep related implementation, tests, docs, and configuration together.

When splitting:

* preserve the original staged diff as the source of truth
* never include originally unstaged or untracked changes
* avoid `git add .` and `git add -A`
* use explicit paths or patch-based staging
* after each commit, stage only the remaining original changes for the next group

Before each commit, verify with:

```sh
git diff --cached
```

## Commit messages

Use Conventional Commits:

```text
<type>[optional scope]: <description>
```

Types: `feat`, `fix`, `docs`, `chore`, `tests`, `refactor`, `style`.

Keep the description concise and intent-focused.

Add body or footer when useful using additional `-m` arguments.

## Verify

After all commits:

```sh
git status --short
git log --oneline -n <number-of-created-commits>
```

Verify that:

* all originally staged changes were committed
* originally unstaged and untracked changes remain untouched
* unrelated changes were separated
* each commit is logically coherent

Summarize created commits and their contents.