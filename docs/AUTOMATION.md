# Automated implementation

[Overview and workflow](../README.md) · [Installation](INSTALLATION.md) · [Commands and configuration](COMMANDS.md) · [Automation](AUTOMATION.md)

## Table of contents

- [Getting started](#getting-started)
- [Models and optional stages](#models-and-optional-stages)
- [Working tree requirements](#working-tree-requirements)
- [Preflight and implementation](#preflight-and-implementation)
- [Review, staging, and commits](#review-staging-and-commits)
- [Limits and stopping conditions](#limits-and-stopping-conditions)
- [Logs and output](#logs-and-output)

## Getting started

Run `cr loop [codex|claude] [-l <positive-integer>] [-r] [-c] [-o model=<native-model>,effort=<native-effort>]`
from an initialized project or a subfolder. The omitted harness uses `default_harness`.
Install the selected `codex` or `claude` CLI on PATH and configure its authentication
and permissions for non-interactive execution. Install CodeRail's instructions
with `cr install <harness>` (or `cr install --local <harness>`) and configure project
verification before starting. Sessions use the native CLI configuration; CodeRail
does not add permission-bypass flags.

For example, implement one ticket and stage its changes:

```sh
cr loop codex --limit 1
```

## Models and optional stages

Saved `[loop.codex]` and `[loop.claude]` settings apply; common CLI values override
saved stage values. Stage-specific `implement-model`/`implement-effort`,
`review-model`/`review-effort`, and `commit-model`/`commit-effort` override common CLI values.
Use `-r`/`--auto-review` to enable CodeRail's built-in review instructions; no
separate review skill is required. Use `-c`/`--auto-commit` to enable the commit skill.
Implementation and commit prompts invoke the installed skills using native syntax:
`$implement` and `$commit` for Codex, `/implement` and `/commit` for Claude.
The flags are independent and accept no boolean values:

| Flags | Iteration stages |
| --- | --- |
| none | implement → stage |
| `-r` | implement → review → stage |
| `-c` | implement → stage → commit |
| `-rc`, `-cr`, or `-r -c` | implement → review → stage → commit |

The long flags can also be combined.

## Working tree requirements

The initialized project subtree must have no staged, unstaged, or untracked changes
at startup. Other Git subtrees may have unstaged or untracked changes in either mode.
Without auto-commit, outside staged changes are also allowed and preserved. With
auto-commit, any outside staged changes are rejected before preflight, including
in a parent Coderail project sharing the Git repository. For older
projects, run `cr init` manually to migrate the project ignore rules before looping.

## Preflight and implementation

Preflight runs a no-work probe for every distinct enabled implementation/review/commit
model and effort combination before any implementation. Identical combinations
share a probe; disabled review/commit settings are not probed. Each probe requires a
successful session and exactly `OK`; this checks that execution works, but does
not prove native effort application or rule out native model fallback. Every implementation runs in a fresh session, activates,
verifies, and closes its selected ticket. Optional review then runs in another
fresh session on the same harness, with the selected ticket context. It targets
current unstaged changes against the index and new untracked files inside the
initialized subtree, including changes to files with accumulated staged work.
Prior staged work is context; implementation and review must preserve the index.

## Review, staging, and commits

Review checks the selected ticket's requirements and acceptance criteria, runs
relevant checks, and records concrete findings. It reopens the original ticket for
required corrections within its scope and creates separate tickets for necessary
independent work, using the installed `ticket` skill for ticket changes. It defers
non-blocking findings and does not implement fixes.
The reviewer finishes with `pass` or `needs fix`; the loop checks ticket state
rather than parsing that decision. A successful review session with valid ticket
state proceeds normally, including when the original ticket was reopened. The
loop stages the initialized subtree, including recorded findings and ticket moves,
optionally commits, then selects the lowest-ID dependency-ready open ticket again.
Reopened tickets and ready follow-ups can run immediately; dependents of reopened work wait.
Staging runs with every flag combination. Auto-commit runs in a fresh session on
the same harness only when staging leaves a staged diff, skipping empty commits.
The commit skill receives the staged diff as its immutable scope and preserves
initially unstaged and untracked content. It may create one or more commits.
Success requires successful session completion, at least one new commit, and no
remaining staged, unstaged, or untracked work inside the initialized subtree.
Outside dirty work remains untouched. Pushing is always user-controlled.

## Limits and stopping conditions

Without `--limit` the loop continues until no ready tickets remain. Limits count
implementation attempts, including repeated attempts on reopened tickets, with no
implicit reopen cap. Review and commit do not add attempts. `--limit 1 -rc` finishes
review, staging, and commit before stopping, even when review reopens the ticket;
the final summary then identifies the unfinished ticket. Empty and
dependency-blocked queues are successful stops.
A failed session, incomplete ticket closure, Git/log failure, or Ctrl+C stops the
loop immediately and leaves resulting files, index state, and any created commits
in place without rollback, automatic retry, amend, or recovery. Cancellation and
execution failures terminate the running harness process group, including tool
descendants.

## Logs and output

Raw agent output is saved under `.coderail/loop/<UTC-timestamp>-<random-id>/`:
`preflight.jsonl` for probes and `<ticket-id>.jsonl` for implementation, review, and commit
output (`step: "implement"`, `"review"`, or `"commit"`). Repeated attempts append to
the same selected ticket log.
Each appended record has `timestamp`, `step`, `stream`, and `output`; chunks and
receipt timestamps are preserved. Agent text does not appear in terminal lifecycle
output. Quiet and non-interactive modes retain contextual completion lines, durations,
and a final attempt count, stop reason, and unfinished ticket when present.
