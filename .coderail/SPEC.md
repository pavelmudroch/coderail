## Problem Statement

Starting, splitting, and integrating branch-local Coderail work currently requires manual branch handling, temporary-file cleanup, and squash-merge recovery. The manual process can accidentally integrate workflow files, lose a parent work record, or leave a conflicted base checkout.

## Goal

Provide `cr work start` and `cr work finish` commands that manage local work branches and safely prepare a non-Coderail squash integration, including nested work, ticket readiness, recovery, and optional agent-generated commits.

## Solution Overview

`cr work start <work-name>` creates and switches to `coderail/<slug>`, records the source branch and work identity in `.coderail/work.ini`, and removes inherited temporary workflow state from the new branch.

`cr work finish` validates the recorded work branch and ticket readiness before checkpointing staged work, captures its committed workflow context, and prepares a squash merge on the recorded base branch. The resulting base index contains only non-Coderail changes. It then either leaves that result staged for a manual commit or, after user confirmation, uses a configured or selected agent to propose and confirm a commit.

## Requirements

1. Add top-level `work` dispatch and help, with `start` and `finish` subcommand dispatch and consistent usage errors.
2. `start` accepts exactly one non-empty, single-line work name. Reuse the existing ticket-title slug rules; reject a name that cannot produce a slug.
3. `start` requires a Git repository, initialized `.coderail`, a named current branch, and a completely clean worktree. It rejects an existing local target branch.
4. `start` creates and switches to `coderail/<slug>`, then writes `.coderail/work.ini` with exactly `base_branch`, `work_branch`, and `work_name` values. It does not automatically commit the record.
5. A new work branch removes inherited managed workflow files before writing its new record. Repository configuration files remain intact. This permits starting a child work item from an active parent work branch.
6. General `cr clean` preserves `.coderail/work.ini`, alongside the existing permanent configuration files.
7. `finish` accepts no positional arguments. It must not resolve or require an agent tool before integration; a supplied tool is a usage error.
8. `finish` requires a valid `work.ini` whose recorded work branch is the current branch. It rejects untracked and unstaged changes.
9. Before any staged-work checkpoint commit, all current tickets must pass the same readiness rule as `cr clean`: every ticket is valid and satisfied (`done`, or a duplicate chain ending in `done`).
10. After those checks, `finish` commits any staged changes with the fixed default message `chore(work): save work progress`; it then re-reads and verifies the committed record used for integration.
11. `finish` checks out the recorded base branch and verifies a fully clean worktree. If that check fails, it returns to the work branch and reports that the base must be cleaned.
12. Capture the committed work branch's managed workflow context before integration. Squash-merge the work branch into the base with `--squash --no-commit`.
13. Immediately after the squash attempt returns, including when it reports conflicts, discard every incoming managed Coderail workflow change before inspecting conflicts. Restore every managed path present on the base to its exact pre-merge content and mode, and remove every managed path absent from the base. Do not remove or alter `.coderail/conf.ini` or `.coderail/test.map` as workflow cleanup.
14. This immediate cleanup resolves every managed workflow-path conflict in favor of the base state. If any other conflict remains, run `git reset --merge`, return to the work branch, fail, and instruct the user to merge the base branch into the work branch before retrying.
15. After that cleanup, on a conflict-free squash, the parent/base workflow state, including its `work.ini`, remains exactly as committed on the base branch. The completed work branch keeps its committed workflow context and `work.ini`.
16. If cleanup leaves no staged changes relative to the base `HEAD`, report that the work produced no integration changes and exit successfully without prompting for an automatic commit. This is a normal no-op: the work may have contained only managed workflow files or its non-Coderail changes may already be on the base branch.
17. Otherwise, prompt on standard input whether to create the integration commit automatically. Accept `y`, `yes`, `n`, and `no` case-insensitively; Enter defaults to yes, invalid responses re-prompt, and EOF or a negative response exits successfully with only the cleaned non-Coderail squash result staged on the base branch.
18. After positive automatic-commit confirmation, use a configured `default_tool`. If no default is configured, prompt once for a supported tool (`codex`, `copilot`, `claude`, or `gemini`); empty, unsupported, or EOF input cancels automatic commit successfully and leaves the cleaned non-Coderail squash result staged. An invalid configured default or an unavailable selected tool reports automatic-commit failure and leaves that result staged.
19. Invoke the selected agent's `cr-commit` skill against the staged non-Coderail result. Parse and display only its declared commit message, then prompt on standard input to use it. Apply the same yes/no parsing and default-yes behavior. A negative response or EOF exits successfully with the result staged; a positive response invokes Git directly. Never execute the agent's emitted shell command. On agent-output parsing, agent invocation, or Git commit failure, leave the cleaned non-Coderail squash result staged on the base branch and report failure.

## Implementation Decisions

- Update the top-level dispatcher and add the `work` subcommand router. `finish` syntax is `cr work finish`; positional arguments, including tool names, are rejected.
- Add a small work-state helper for validating and reading the three-key `work.ini` format. Treat duplicate, missing, empty, multiline, or malformed values as invalid. Do not source the file as shell code.
- Reuse `ticket_slugify_title` for branch-name slugging rather than introducing another slug algorithm.
- Define managed workflow paths as `.coderail` files other than `conf.ini` and `test.map`. `work.ini` is therefore preserved by general cleanup but managed and excluded during `work finish` integration.
- Keep start's generated file additions and inherited-workflow deletions unstaged. Users may commit them normally; finish's pre-integration staged commit guarantees that captured work context is committed.
- Validate ticket readiness by reusing the existing cleanup behavior in dry-run form before the staged-work checkpoint, rather than duplicating ticket-satisfaction rules.
- Capture lists of managed paths and their committed work/base states in a temporary directory. Immediately after every squash attempt, use the base snapshot to restore the base state before inspecting unmerged paths.
- Restore each managed base path to both index and worktree; if the base has no version, remove the path from both. This drops incoming managed changes and resolves their conflicts in favor of the base without hiding code conflicts; do not apply an `ours` strategy to the entire merge.
- After workflow cleanup, use the staged diff against `HEAD` to detect an empty integration result before any automatic-commit prompt. Treat it as successful because no integration action remains to perform.
- Defer configured-tool selection until the user approves automatic commit. Use `default_tool` when configured; otherwise prompt once for a supported tool. Do not offer an interactive override when a default is configured.
- Use existing per-tool noninteractive invocation forms from ticket looping. Capture agent output in a temporary file.
- Implement one reusable standard-input yes/no prompt for both automatic-commit and generated-message confirmation. It accepts `y`, `yes`, `n`, and `no` case-insensitively, defaults to yes on an empty response, re-prompts invalid input, and treats EOF as no.
- Accept only the structured message between the `Commit:` and `Command:` headings from `cr-commit` output. Require a non-empty subject, preserve an optional body, display the parsed message for confirmation, write it to a temporary file, and pass it to `git commit -F` only after approval. The reported `Command:` is informational and untrusted.
- If the pre-integration default commit fails, remain on the work branch and make no integration changes. If base checkout or base cleanliness validation fails, return to the work branch when Git permits it.

## Testing Decisions

- Add focused command tests for `work`; use isolated repositories and Git history assertions, following `test/commands/clean.test.sh` and `test/commands/ticket/loop.test.sh` conventions.
- Cover dispatch/help, argument errors, slugging, exact `work.ini` contents, branch switching, prerequisites, target-branch collisions, inherited workflow cleanup, and nested-start behavior.
- Extend cleanup tests to prove both dry-run and real cleanup preserve `.coderail/work.ini` while retaining the current configuration-file behavior.
- Cover finish preconditions: missing/malformed/mismatched or unstaged work records, detached or wrong branch, untracked/unstaged changes, ticket readiness before a staged-record checkpoint commit, staged-record checkpoint commit, and dirty base recovery.
- Cover squash outcomes: normal code integration left staged; incoming managed additions, edits, and deletions discarded in favor of the base state; parent workflow restoration for nested work; workflow-only or already-integrated work exiting successfully without a prompt or staged changes; automatic-commit prompt defaults and answer parsing; no configured default with tool selection or cancellation; invalid/unavailable configured defaults; valid agent-generated commits; generated-message display and acceptance/decline; malformed or failed agent output; and Git commit failure retaining staged non-Coderail changes.
- Cover conflict handling with a Coderail-only conflict immediately resolved to the base state, and a code conflict reset and returned to the work branch with retry guidance.
- Run `sh test/commands/work.test.sh` and `sh test/commands/clean.test.sh`; do not run `test/all.sh` unless later changes expand beyond these command surfaces.

## Out of Scope

- Pushing, remote branch creation, pull requests, or protected-branch workflows.
- Multiple concurrent work records in one checkout.
- Automatic rebasing or merging the base into the work branch after a conflict.
- Modifying permanent Coderail configuration as part of workflow cleanup.
- Executing arbitrary shell commands emitted by an agent.
- Selecting an agent tool through a `finish` argument or overriding a configured `default_tool` interactively.

## Assumptions

- Work names are single-line shell arguments; normal quoted multiword names are supported.
- `base_branch` refers to a local branch available when finish runs.
- The fixed staged-work checkpoint message is `chore(work): save work progress`.
- Existing Git supports `switch`, `restore`, and `reset --merge`, consistent with Coderail's supported environment.
- A workflow-only conflict is one where every unmerged path is managed under the definition above; a conflict in permanent configuration is not workflow-only.
- Prompts read standard input, allowing piped responses; closed standard input is treated as cancellation of automatic commit.

## Further Notes

- The work branch is the durable source of scope, tickets, specifications, and work metadata after integration preparation. The base branch intentionally receives only the feature/fix result.
- Exact status messages, help wording, temporary-file names, and low-level Git command sequencing may follow repository style during implementation as long as the requirements above remain observable.
