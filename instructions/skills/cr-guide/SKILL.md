---
name: cr-guide
description: Teach users Coderail principles, setup, workflows, recovery, skills, and CLI usage.
---

# Coderail Guide

Use this skill when a user is new to Coderail, asks what to do next, or is
stuck in a Coderail workflow.

Explain the smallest useful path. Inspect repository state before prescribing a
command. Do not mutate state when the user only asked for explanation.

## Mental Model

Coderail coordinates bounded agent work inside a Git branch.

* Skills guide judgment: direction, research, specification, tickets,
  implementation, validation, documentation, and review.
* The `cr` CLI handles mechanics: setup, ticket state, dependencies, mapped
  validation, bounded agent loops, workflow cleanup, and optional local squash
  integration.
* `.coderail/` carries agreed branch-local context between fresh agent sessions.
* Git carries permanent history.
* The engineer approves direction, reviews meaningful changes, and chooses how
  work is integrated.

Coderail is not an issue tracker, CI system, build system, merge policy, project
manager, or fully autonomous workflow engine.

Prefer the shortest workflow that preserves understanding:

```txt
unclear idea → forge → specification → tickets → implementation
clear multi-part change → specification or plan → tickets → implementation
small clear change → one ticket → implementation
```

Every successful route ends with validation, appropriate review, cleanup, and
user-controlled integration.

## Guide Behavior

When helping a user:

1. Establish the repository, current branch, worktree state, `.coderail` state,
   active ticket, and user goal.
2. Distinguish explanation from authorization. Explain commands freely; run
   mutating, destructive, networked, or externally visible commands only when
   requested.
3. Ask only for choices that materially change the route: manual or managed
   branch lifecycle, desired planning depth, and manual or automatic ticket
   execution.
4. Recommend the simpler route when both satisfy the goal.
5. State what a command changes before running it.
6. Preserve dirty worktrees and unrelated user changes.
7. Never move ticket files or edit lifecycle frontmatter manually.
8. Never push, open a pull request, merge, release, upgrade, install, uninstall,
   clean, or run `cr ticket loop` without matching user authorization.

For read-only orientation, run the applicable checks:

```sh
git status --short --branch
cr --version
cr ticket validate
cr ticket next
```

Run ticket commands only when `.coderail` exists.

Also inspect `.coderail/IDEA.md`, `.coderail/SPEC.md`, active tickets, and the
first unchecked task when present. `cr ticket next` returning
`no available tickets` is workflow state, not enough evidence that work is
complete.

## State Files

| Path | Role | Lifetime |
| --- | --- | --- |
| `~/.coderail/config.ini` | User default, currently `default_tool` | User-local |
| `.coderail/config.ini` | Repository defaults; overrides user config | Permanent |
| `.coderail/test.map` | Maps selected paths to validation commands | Permanent |
| `.coderail/work.ini` | Managed-work base branch, work branch, and name | One managed branch lifecycle |
| `.coderail/IDEA.md` | Current forged direction | Temporary |
| `.coderail/SPEC.md` | Implementation contract | Temporary |
| `.coderail/RESEARCH.md` | Research synthesis when requested | Temporary |
| `.coderail/REVIEW.md` | Manual review findings | Temporary |
| `.coderail/tickets/{open,active,closed}` | Branch-local work graph | Temporary |
| `.coderail/loop/*.txt` | Ignored implementation/review transcripts | Local diagnostic |

Repository configuration uses `config.ini`; a legacy `conf.ini` remains a
deprecated fallback and emits a migration warning.

`cr clean` preserves `config.ini`, the legacy `conf.ini` fallback, `test.map`,
and `work.ini`. Managed
`cr work finish` omits child workflow files from the squash integration and
restores workflow files already present on the base branch.

Tickets and other workflow files may be committed on the work branch as
checkpoints. They are normally removed before integration.

## First Use

Coderail targets Linux, macOS, and Windows through WSL.

If `cr` is unavailable, explain the bootstrap installation:

```sh
curl -fsSL https://github.com/pavelmudroch/coderail/raw/refs/heads/main/INSTALL | sh
export PATH="$HOME/.coderail/bin:$PATH"
cr --help
```

The bootstrap defaults to the `latest` tag. `CODERAIL_INSTALL_DIR` changes the
installation directory. `CODERAIL_INSTALL_VERSION` accepts `latest`, `main`,
`X.Y.Z`, or `vX.Y.Z`. Installation downloads code and changes the user's home;
do not run it without approval.

From the repository root:

```sh
cr init
cr install codex
```

`cr init` creates missing `.coderail` configuration, ticket, and ignored loop
transcript files. It preserves existing files.

`cr install` installs shared root instructions and skills into one or more
supported tool homes:

```txt
codex     ~/.codex
copilot   ~/.copilot
claude    ~/.claude
gemini    ~/.gemini
```

Target roots can be overridden with `CODERAIL_CODEX_HOME`,
`CODERAIL_COPILOT_HOME`, `CODERAIL_CLAUDE_HOME`, or
`CODERAIL_GEMINI_HOME`. Codex, Copilot, and Claude also receive the worker-agent
definition. Gemini receives skills and root instructions only.

Installation tracks managed files in `.coderail-install`. It refuses to
overwrite unrelated or modified files unless `--force` is explicitly chosen.
`cr uninstall` removes only manifested files and preserves modified files unless
forced.

Configure a default agent tool when useful:

```ini
# ~/.coderail/config.ini or .coderail/config.ini
default_tool = codex
```

Repository config overrides user config. The default is used by `install`,
`uninstall`, `ticket loop`, and automatic commit-message generation in
`work finish`.

Do not invent `.coderail/test.map` rules. Ask for the repository's real
formatters, linters, type checks, and tests, then map them. If the map is absent,
use repository-native validation unless the user asks to configure it.

## Choose the Branch Lifecycle

Use one lifecycle for a piece of work.

### Manual

Use when the repository already has a branch or integration process:

```sh
git switch -c feat/<name>
```

Follow the shared workflow below. Finish with:

```sh
cr clean --dry-run
cr clean
```

Then follow the repository's normal pull request, rebase, merge, or local
integration policy. Coderail does not choose it.

### Managed

Use when the user wants Coderail to create the branch and stage local squash
integration:

```sh
cr work start "Add request timeout handling"
```

`work start` requires a Git repository, `cr init`, a named current branch, and a
clean worktree. It creates and switches to `coderail/<slug>`, removes inherited
temporary workflow files in the child branch, and writes `.coderail/work.ini`.
It never pushes.

Commit the resulting work record and workflow baseline before
`cr ticket loop`, which requires a clean worktree.

After the shared workflow:

```sh
cr work finish
```

`work finish` requires the recorded work branch, valid resolved tickets, no
untracked files, and no unstaged changes. Existing staged work is checkpointed
on the work branch. The command switches to the recorded base, stages a squash
integration, and excludes child workflow files while preserving base
configuration.

It does not push or delete the work branch. It first leaves integration changes
staged. It can then:

1. Stop for manual inspection and commit.
2. Ask a configured or selected supported tool for a `cr-commit` message.
3. Show that message and create the commit only after another confirmation.

## Shared Workflow

### 1. Establish Direction

For a rough, disputed, or unclear idea, invoke <skill>cr-forge</skill>.

It challenges assumptions and alternatives and maintains `.coderail/IDEA.md`.
It does not research the repository, specify implementation, create tickets, or
write code. Continue until the problem, desired outcome, selected direction,
boundaries, trade-offs, risks, non-goals, and open questions are coherent.

Skip forging for small, already understood work. `cr-scope` is the older,
narrower direction-shaping skill; prefer `cr-forge` in the current workflow.

### 2. Specify

Invoke <skill>cr-spec</skill> when the direction is ready.

It researches current code as needed and writes `.coderail/SPEC.md` with
requirements, implementation decisions, testing decisions, assumptions, and
out-of-scope work. It synthesizes known context rather than interviewing by
default.

A short implementation plan can replace a specification for one small ticket.
If the plan stops fitting one coherent ticket, create a specification.

### 3. Create and Review Tickets

Invoke <skill>cr-tickets-from-context</skill> for a specification, plan, or
clear conversation.

Each ticket is a meaningful vertical slice. Its ordered tasks are horizontal
implementation steps. Prefer test tasks before implementation tasks. Review
boundaries, dependencies, outcomes, validation, and file overlap before
implementation.

Create one directly with:

```sh
cr ticket create "Add request timeout handling"
cr ticket create -d 0001 "Document timeout behavior"
```

Edit only the ticket description, tasks, task details, expected outcomes,
validation, and references. Use `cr ticket ...` for lifecycle and dependencies.

### 4. Implement Manually

1. Preferred: Invoke <skill>cr-ticket-pick</skill>, which selects a dependency-ready ticket
and hands it automatically to <skill>cr-ticket-implement</skill>.
2. Optional: Or user can invoke directly <skill>cr-ticket-implement</skill> with a ticket ID, name, or slug.

The implementation contract is:

1. `cr ticket activate <ticket>`
2. Complete tasks serially from the first unchecked task.
3. Review every local or delegated result.
4. Mark a task complete only after its outcome is verified.
5. Run `cr test <changed-paths...>` or `cr test --changed`.
6. Record a concise summary and verification evidence.
7. `cr ticket close <ticket>` only when delivered and verified.

Ticket-sized Git checkpoints are useful but not mandatory.

### 5. Implement Automatically

Use only after explicit user choice:

```sh
cr ticket loop
cr ticket loop --max 2 --auto-review codex -- --model <model>
cr ticket loop --all claude
```

This command warns because it starts supported agent CLIs with extended
permissions and network access. It requires a completely clean Git worktree,
including no staged changes.

The loop selects ready tickets, invokes `cr-ticket-implement`, requires a
satisfied closure, stages all post-agent changes, and repeats. The default
maximum is five successful implementation handoffs. `--max` counts handoffs,
not unique tickets. `--all` continues through newly ready, reopened, and
review-created tickets until none remain.

Agent output is not streamed. Inspect:

```sh
tail -f .coderail/loop/0001-ticket-name.txt
```

With `--auto-review`, tickets closed as `done` receive `cr-review-auto`:

* Clean: ticket stays closed.
* Within-scope finding: tasks are appended and the ticket reopens.
* Broader finding: a dependent follow-up ticket is created; source stays closed.

Automatic ticket review does not replace final branch review. After a loop
stops, inspect the diff and staged changes, then commit or otherwise restore a
clean checkpoint before starting another loop.

### 6. Document and Review

For user-facing changes, invoke <skill>cr-docs-guidelines</skill>.

After all tickets:

1. Run repository-required final validation; use the full suite when appropriate,
   not only changed-file mapping.
2. Invoke <skill>cr-review</skill> for the complete change when risk or size
   justifies it.
3. Resolve findings in current scope or create follow-up tickets.
4. Return to forging or specification only if a finding invalidates an earlier
   decision or materially changes intended behavior.

`cr-review` is read-only and writes `.coderail/REVIEW.md`. It reports concrete,
reachable defects, not style preferences or speculative risks.

## Ticket Model

```txt
create/reopen/deactivate → open
activate                 → active
close                    → closed
```

Use these commands:

```sh
cr ticket next [--limit N]
cr ticket create [-d <ticket> ...] "<title>"
cr ticket activate <ticket>
cr ticket close [--reason done|duplicate|deferred|dismissed] <ticket>
cr ticket close --reason duplicate --duplicate-of <original> <duplicate>
cr ticket deactivate [-d <ticket> ...] <ticket>
cr ticket reopen [-d <ticket> ...] <ticket>
cr ticket validate [<ticket> ...]
```

References accept ID, name, slug, or path. Use a path when ambiguous.
Dependencies are resolved and stored as IDs.

A dependency is satisfied only when closed as `done`, or closed as `duplicate`
through a chain ending at `done`. `deferred` and `dismissed` are valid closure
reasons but are not satisfied work. Therefore unresolved decisions remain
visible and block cleanup or managed finish.

`next`, `activate`, and closing as `done` enforce dependency satisfaction.
Validate after state changes:

```sh
cr ticket validate <ticket>
```

Use `cr ticket validate` after broad ticket edits. Do not use deprecated
`cr ticket clean`; use `cr clean`.

## Validation

Use global `cr`, from the repository root, or:

```sh
cr --cwd /path/to/repo <command>
```

`--cwd` applies to `init`, `work`, `ticket`, `test`, and `clean`. It is ignored
for installation-root commands.

Focused validation:

```sh
cr test --changed
cr test path/to/file
cr test path/to/directory
cr --verbose test --changed
```

Paths must be relative and cannot traverse above the working directory.
Directories expand recursively. `--changed` includes changed and untracked
project files but omits `.coderail` workflow files.

`.coderail/test.map` is ordered and INI-like, not standard INI:

```ini
[default]
deno fmt --check

[{path:**/*.ts}]
biome check {path}

[lib/{rel:**}/{base:*}.sh]
sh test/{rel}/{base}.test.sh
```

`[default]` always runs. Other section names are path globs. Named captures must
be declared in the matching section before use like `{<group-name>:<pattern>}`. Captured values are shell
quoted. Rendered commands are deduplicated, failures are collected, and each
selected path reports `passed`, `failed`, or `no tests found`.

Use verbose mode for failed command output. `no tests found` means the map
provided no check; use the repository's native validation or ask whether the
map should be updated.

## Recovery

Diagnose state before changing it.

| Symptom | Action |
| --- | --- |
| `cr: command not found` | Locate the installation and add its `bin` to `PATH`; install only with approval. |
| `.coderail` missing | Run `cr init` when the user wants Coderail initialized. |
| Goal still unclear | Return to `cr-forge`; do not force a specification or ticket. |
| Technical behavior unknown | Invoke `cr-research`; feed confirmed findings back into the idea or spec. |
| No tickets | Create one from a small plan or use `cr-tickets-from-context`. |
| Active ticket exists | Resume its first unchecked task; `ticket next` lists only open tickets. |
| `no available tickets` | Run `cr ticket validate`; inspect open-ticket dependencies and closed reasons. Work may be blocked, active, or complete. |
| Ticket blocked by prerequisite work | Create the prerequisite ticket, then `cr ticket deactivate -d <prerequisite> <ticket>`. Do not invent a ticket for an external decision. |
| External decision blocks active work | Leave durable context in the ticket, report the decision, and stop. Do not falsely close as `done`. |
| Validation fails | Re-run the smallest selector with `cr --verbose test ...`, fix the concrete failure, then rerun it. |
| Loop fails | Read the transcript, inspect `git status`, diff, and ticket state. Review partial changes; do not rerun until state is intentionally reconciled and clean. |
| Auto-review reopens a ticket | Continue through normal dependency scheduling. If a bounded loop ended, inspect and commit its staged checkpoint before another loop. |
| Closed work is wrong | Add concrete tasks/details, then `cr ticket reopen <ticket>`. |
| `cr clean` refuses | Validate tickets. Resolve open/active tickets and non-satisfied closures; `--force` bypasses confirmation, not readiness. |
| Cleanup may delete work | Run `cr clean --dry-run`. Without tickets, unsafe untracked or modified helper files require `y`; preserve anything still needed. |
| `work finish` rejects worktree | Resolve untracked and unstaged files intentionally. Staged files will be checkpointed automatically. |
| Squash integration conflicts | The command returns to the work branch. Integrate the base into the work branch, resolve, validate, commit, then retry. |
| Base branch is dirty | `work finish` returns to the work branch; clean the base through the user's normal Git process before retrying. |
| Automatic commit generation fails or is declined | Integration remains staged on the base branch. Inspect it and commit manually if desired; do not assume the work was lost. |

When blocked, report:

* exact observed state;
* command and error;
* files or ticket involved;
* smallest safe next action;
* decision needed from the user.

## Skill Routing

| Skill | Invocation | Use and boundary |
| --- | --- | --- |
| `cr-forge` | user | Challenge and align a rough idea; writes `IDEA.md`; no research, spec, tickets, or code. |
| `cr-scope` | user | Older direction-scoping workflow; current workflow prefers `cr-forge`. |
| `cr-spec` | user | Research and synthesize an implementation contract in `SPEC.md`. |
| `cr-research` | agent+user | Choose direct or delegated research strategy; coordinator writes `RESEARCH.md` unless another output is requested. |
| `cr-research-task` | agent+user | Investigate one bounded question with evidence and uncertainty. |
| `cr-tickets-from-context` | user | Split a spec, plan, or conversation into vertical tickets. |
| `cr-ticket-create` | user | Create and detail one ticket with ordered tasks and validation. |
| `cr-ticket-pick` | user | Select one dependency-ready open ticket. |
| `cr-ticket-implement` | user | Implement tasks serially, validate, summarize, and close one ticket. |
| `cr-review-auto` | agent | Internal loop review; records findings by reopening or creating tickets; never fixes code. |
| `cr-review` | user | Read-only manual review; writes concrete findings to `REVIEW.md`. |
| `cr-agent-guide` | agent | Internal compact reference for agent-safe `test` and ticket commands. |
| `cr-code-guidelines` | agent+user | Apply repository style, maintainability, tests, and API preservation. |
| `cr-typescript` | agent+user | Add explicit TypeScript conventions when `.ts` or `.tsx` is in scope. |
| `cr-code-simplify` | user | Refactor duplication or complexity without behavior or API changes. |
| `cr-docs-guidelines` | agent+user | Update README/CHANGELOG from verified user-facing behavior; does not rerun tests. |
| `cr-question-guidelines` | user | Ask one high-value question at a time; research answerable facts instead. |
| `cr-handoff` | user | Preserve resolved decisions and genuine open questions for a fresh context. |
| `cr-commit` | user | Analyze staged changes and propose a Conventional Commit message; does not stage, edit, push, or commit by itself. |

The optional `worker` agent executes one bounded delegated task, does not expand
scope, validates its work, and reports changed files, commands, outcomes, risks,
and questions. The coordinating agent reviews worker output.

## CLI Reference

```txt
cr init                         Initialize repository-local Coderail files
cr install [tool ...]           Install managed instructions and skills
cr uninstall [tool ...]         Remove managed tool files
cr upgrade                      Install latest stable Coderail
cr upgrade --version X.Y.Z      Install one release
cr upgrade --canary             Install current main
cr test ...                     Run mapped validation
cr ticket ...                   Manage branch-local work
cr ticket loop ...              Run bounded noninteractive agent handoffs
cr clean [--dry-run]            Remove resolved temporary workflow files
cr work start <name>            Start recorded managed work
cr work finish                  Stage and optionally commit squash integration
```

Use `cr --help` and `cr <command> --help` for exact installed-version syntax.
Use `-v` for operational detail and `-q` to suppress notices. Quiet mode does
not suppress result output.

`./build/release.sh --patch|--minor|--major` is maintainer-only publishing. It
requires `main`, a clean tree, matching version and changelog metadata, creates
annotated version and `latest` tags, and pushes them atomically to `origin`. Run
it only when the user explicitly requests a release.
