# Coderail

**Coderail keeps engineers in the development loop, prioritizing understood and reviewable changes over fully autonomous implementation.**

Coderail is a lightweight, repo-local CLI and skill set for coordinating coding agents through scoped work, branch-local tickets, and repository-specific validation.

It helps different coding tools follow the same project workflow without requiring every agent to know each repository convention, validation command, test runner, formatter, linter, or ticket format.

Coderail automates repetitive development mechanics while keeping scope, review, and integration decisions under human control.

## Table of Contents

* [Purpose](#purpose)
* [What Coderail Does](#what-coderail-does)
* [What Coderail Does Not Do](#what-coderail-does-not-do)
* [Supported Systems](#supported-systems)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Workflow](#workflow)
  * [Choose a workflow](#choose-a-workflow)
  * [Clarify complex work](#clarify-complex-work)
  * [Create and review a specification](#create-and-review-a-specification)
  * [Create and review tickets](#create-and-review-tickets)
  * [Implement tickets](#implement-tickets)
  * [Update documentation](#update-documentation)
  * [Review the complete change](#review-the-complete-change)
  * [Manual: clean and integrate](#manual-clean-and-integrate)
  * [Managed: finish work](#managed-finish-work)
* [Configuration](#configuration)
  * [`~/.coderail/config.ini`](#coderailconfigini)
  * [`.coderail/conf.ini`](#coderailconfini)
  * [`.coderail/test.map`](#coderailtestmap)
  * [`.coderail/work.ini`](#coderailworkini)
* [Command Reference](#command-reference)
  * [`cr init`](#cr-init)
  * [`cr install`](#cr-install)
  * [`cr uninstall`](#cr-uninstall)
  * [`cr upgrade`](#cr-upgrade)
  * [`cr test`](#cr-test)
  * [`cr work`](#cr-work)
  * [`cr clean`](#cr-clean)
  * [`cr ticket`](#cr-ticket)
* [Development](#development)
  * [Release Helper](#release-helper)
* [Inspirations](#inspirations)
* [License](#license)

## Purpose

Coderail keeps coding agents within explicit project boundaries and provides a consistent workflow across supported tools:

* [`codex` (OpenAI Codex)](https://developers.openai.com/codex/cli)
* [`claude` (Anthropic Claude)](https://code.claude.com/docs/en/quickstart#step-1-install-claude-code)
* [`copilot` (GitHub Copilot)](https://github.com/features/copilot/cli)
* [`gemini` (Google Gemini)](https://geminicli.com/)

It combines reusable agent skills with a small command-line tool for workflow state, ticket management, validation, and cleanup.

The main idea is simple:

**Coderail helps agents safely complete understandable work inside a branch.
Git keeps the permanent history.**

Coderail is intentionally designed around bounded automation. Agents can research, plan, implement, validate, and review work, but the engineer remains responsible for approving direction, understanding changes, and deciding how the result is integrated.

## What Coderail Does

Coderail provides:

* a lightweight POSIX shell CLI
* reusable skills for agent-guided engineering
* repo-local scope, specification, review, and ticket files
* branch-local ticket lifecycle and dependency management
* repository-specific validation command routing
* consistent behavior across supported coding tools
* reduced agent context pollution
* cleanup of temporary workflow files before integration

For larger changes, the included skills guide work through:

```txt
scope
→ specification
→ tickets
→ implementation
→ validation
→ review
→ cleanup
→ integration
```

For small and well-understood changes, planning stages can be skipped and a single ticket can be created from a short implementation plan.

## What Coderail Does Not Do

Coderail is not:

* a permanent issue tracker
* a replacement for Git history
* a replacement for CI
* a general build system
* a project management platform
* a general-purpose or fully autonomous workflow engine
* a database of every past decision
* a system for silently choosing architecture or merging code
* a place to satisfy every possible future use case

Coderail does not attempt to remove engineers from the development process. Its purpose is to reduce repetitive coordination work without replacing engineering judgment.

## Supported Systems

Coderail is intended for Unix-like environments:

* Linux
* macOS
* Windows through WSL

Coderail uses POSIX shell scripts and assumes an environment close to standard Linux or macOS shell behavior.

Native Windows support outside WSL is not a primary target.

## Installation

Use the bootstrap installer:

```sh
curl -fsSL https://github.com/pavelmudroch/coderail/raw/refs/heads/main/INSTALL | sh
```

The installer requires a Unix-like shell environment, standard Unix tools, and either `curl` or `wget`.

It accepts no command-line arguments. Configure it with environment variables:

```txt
CODERAIL_INSTALL_DIR       Installation directory, defaults to ~/.coderail
CODERAIL_INSTALL_VERSION   Version to install: latest, main, X.Y.Z, or vX.Y.Z
```

`CODERAIL_INSTALL_VERSION` defaults to `latest`, which installs the `latest` tag.

* `latest` installs the latest stable release
* `main` installs the current main branch
* `X.Y.Z` and `vX.Y.Z` install the matching release tag

The installation directory must not exist or must be empty.

After installation, add the Coderail `bin` directory to your `PATH`. The installer prints the required command but does not modify shell startup files.

For the default installation directory:

```sh
export PATH="$HOME/.coderail/bin:$PATH"
```

Verify the installation:

```sh
cr --help
```

Every command and subcommand supports `--help` for complete usage information.

## Quick Start

Initialize Coderail inside a repository:

```sh
cr init
```

Install Coderail skills and instructions for a coding tool:

```sh
cr install codex
```

Configure repository-specific validation commands in:

```txt
.coderail/test.map
```

Create a ticket:

```sh
cr ticket create "Add request timeout handling"
```

Select the next dependency-ready ticket:

```sh
cr ticket next --limit 1
```

Activate and complete the created ticket:

```sh
cr ticket activate 0001
```

Validate changed files:

```sh
cr test --changed
```

Close the completed ticket as satisfied:

```sh
cr ticket close 0001
```

Clean temporary workflow files before integrating completed work:

```sh
cr clean
```

## Workflow

Coderail's recommended workflow is branch-based.

The complete workflow is useful for complex or uncertain work. Small changes can skip scope, specification, or additional review when the intended change is already clear.

For larger work, use fresh agent contexts between scope, specification, ticket creation, and implementation when practical. Repo-local Coderail files carry the agreed state between sessions.

### Choose a workflow

Use one branch lifecycle. The scope, ticket, implementation, documentation,
and review steps below apply to both.

| Manual workflow | Managed workflow |
| --- | --- |
| Create and name the branch with Git. | Start with `cr work start <work-name>`. |
| Finish with `cr clean`, then use the repository's normal integration process. | Finish with `cr work finish`, which stages a local squash integration. |

For the manual workflow, create the branch with Git:

```sh
git checkout -b feat/<feature-name>
git checkout -b fix/<issue-or-fix-name>
```

Coderail does not require a particular branch naming convention. Follow the
rules of the repository you are working in.

For the more automated managed workflow, create and record a local work branch:

```sh
cr work start "Add request timeout handling"
```

This creates and switches to `coderail/add-request-timeout-handling`, records
the starting branch in `.coderail/work.ini`, and does not push to a remote.
Commit the work record before commands that require a clean worktree, such as
`cr ticket loop`.

### Clarify complex work

For a complex or unclear problem, invoke the `cr-scope` skill.

Discuss the problem with the agent until the following are aligned:

* intended outcome
* boundaries
* constraints
* trade-offs
* selected direction
* explicitly rejected alternatives
* unresolved questions

The skill maintains the current direction in:

```txt
.coderail/SCOPE.md
```

Review this file before continuing. The scope phase is complete when it accurately captures the agreed direction without prematurely defining implementation details.

Small or straightforward changes can skip this phase.

### Create and review a specification

Invoke the `cr-to-spec` skill when the selected direction is ready to become an implementation specification.

The skill writes:

```txt
.coderail/SPEC.md
```

The specification can contain:

* problem statement
* intended outcome
* implementation decisions
* requirements
* testing decisions
* assumptions
* out-of-scope items

Review and revise the specification before creating tickets.

For small changes, a short implementation plan can replace the specification. If the plan becomes too large for one ticket, return to `cr-to-spec`.

### Create and review tickets

Invoke `cr-tickets-from-context` to split the specification into actionable branch-local tickets.

Tickets are stored under:

```txt
.coderail/tickets/
```

Each ticket should represent a meaningful vertical slice of functionality. Tasks inside the ticket describe the ordered implementation work required to deliver that slice.

Review generated tickets before implementation, especially:

* ticket boundaries
* dependencies
* expected outcomes
* validation criteria
* overlap between tickets

### Implement tickets

Invoke `cr-ticket-pick` to select the next open ticket whose dependencies are satisfied.

The implementation workflow:

1. Activates the selected ticket.
2. Completes its tasks in order.
3. Reviews agent or worker output.
4. Runs repository validation through `cr test`.
5. Records a concise implementation summary.
6. Closes the ticket only after successful verification.

Completed implementation changes can be committed to the feature branch at ticket-sized checkpoints.

Use the `cr-review` skill for an uncertain, security-sensitive, compatibility-sensitive, or otherwise risky ticket when the additional review cost is justified.

Several ready tickets can be processed through an agent CLI with:

```sh
cr ticket loop
```

The loop requires a Git repository and a completely clean worktree when it starts. Commit or remove newly created or modified ticket files before starting it.

The loop is explicitly invoked and bounded by the user. It is intended to remove repetitive ticket handoff work, not to replace human review or run indefinitely.

### Update documentation

For user-facing changes, invoke the `cr-docs-guidelines` skill.

It can use the following temporary workflow files as source material:

* scope
* specification
* tickets
* implementation summaries
* review output

Documentation changes can be committed separately when appropriate.

### Review the complete change

After all tickets are complete, run the repository's full validation suite.

Then manually invoke the `cr-review` skill against the complete branch or combined change.

The final review should check:

* correctness
* regressions
* failure handling
* security
* concurrency and lifecycle behavior
* API, CLI, configuration, and data compatibility
* test coverage

Resolve ordinary findings within the existing implementation or create follow-up tickets when useful.

Return to the scope or specification phase only when a finding invalidates an earlier decision or materially changes the intended behavior.

Final review remains manually invoked because its cost and value depend on the size and risk of the change.

### Manual: clean and integrate

For the manual workflow, remove temporary Coderail workflow files before using
the repository's normal integration process:

```sh
cr clean --dry-run
cr clean
```

`cr clean` preserves permanent repository configuration:

```txt
.coderail/conf.ini
.coderail/test.map
```

It removes temporary branch-scoped workflow files such as:

```txt
.coderail/SCOPE.md
.coderail/SPEC.md
.coderail/REVIEW.md
.coderail/tickets/closed/0001-example.md
```

If only the preserved configuration files and empty directories remain, cleanup is a no-op. When ticket files exist, every ticket must be valid and satisfied before cleanup succeeds. A ticket is satisfied when it is closed as `done`, or is a `duplicate` whose chain ends at a ticket closed as `done`.

When no ticket files exist, `cr clean` uses Git's index to identify helper-file candidates that cannot be restored exactly. It lists those files and requires a `y` confirmation before permanently deleting them; `--force` skips the warning and confirmation. Cleanup removes files, including ticket files, but leaves empty directories.

After cleanup, integrate the branch using the repository's normal process, such as:

* opening a pull request
* squash merging
* rebasing
* creating a merge commit
* merging locally
* pushing through a protected-branch workflow

Coderail deliberately does not prescribe the repository's integration policy.

Temporary workflow files can be committed on the feature branch when preserving their intermediate history is useful, but they should normally be removed before the completed change is integrated.

### Managed: finish work

For the managed workflow started with `cr work start`, use:

```sh
cr work finish
```

It requires the recorded work branch, a clean worktree with no untracked or
unstaged files, and all tickets resolved. It switches to the recorded base branch,
stages a squash integration, and removes branch-local Coderail workflow files
from that integration while preserving the base branch configuration.

This is more automated than the manual lifecycle, but it does not push and
does not create a commit without confirmation. You can inspect and commit the
staged integration yourself, or confirm a configured or selected supported
tool's proposed integration commit message.

## Configuration

### `~/.coderail/config.ini`

User-local Coderail settings live here.

### `.coderail/conf.ini`

Repository-local Coderail settings live here and override user-local settings.

Example:

```ini
default_tool = codex
```

When no tool argument is provided, `cr install`, `cr uninstall`, `cr ticket loop`,
and automatic commit-message generation in `cr work finish` use `default_tool`.

### `.coderail/test.map`

The test map defines which validation commands Coderail runs for selected or changed files.

It is intentionally INI-like, but it is not standard INI. Section names are path globs, and lines inside sections are shell commands.

Example:

```ini
[default]
deno fmt --check

[{path:**/*.ts}]
biome format {path}
biome check {path}

[net/tcp/**/*.ts]
deno test tests/net/tcp.test.ts

[lib/{rel:**}/{base:*}.sh]
sh test/{rel}/{base}.test.sh
```

Rules:

* The first `#` starts a Coderail comment, even inside quoted shell text.
* Comment parsing follows Coderail syntax and is not shell-aware.
* `[default]` commands always run but define no captures.
* Use `[default]` for commands that do not need the selected path.
* Other section names are glob patterns and can define captures with `{name:glob}`.
* Capture names must start with a letter or underscore and contain only letters, digits, and underscores.
* A capture name can appear only once in a section.
* The same capture name can be reused in another section.
* `*` matches within one path segment.
* `**` can match across `/`.
* Literal `{`, `}`, and `\` in section patterns must be escaped as `\{`, `\}`, and `\\`.
* The first `:` in a capture separates its name from its glob.
* Later `:` characters are part of the glob.
* Commands can use only captures defined by the matching section.
* Capture values are shell-quoted before command execution.
* Commands run in file order.
* All commands are rendered and deduplicated before execution.
* Coderail continues collecting validation failures after an individual command fails.

Capture examples:

```txt
[{path:**/*.ts}]            captures the matched path as {path}
[lib/{rel:**}/{base:*}.sh]  captures the nested directory as {rel}
                            and the filename stem as {base}
```

There are no implicit placeholders.

`{path}`, `{name}`, `{ext}`, and `{dir}` expand only when the matching section explicitly defines those captures. Other brace text remains literal.

### `.coderail/work.ini`

`cr work start` creates this branch-local record with the base branch, work
branch, and work name. `cr work finish` uses it to stage the squash integration.
`cr clean` preserves the record; `cr work finish` omits it from the integration.

## Command Reference

`cr` runs repo-local workflow commands from the current directory or a directory selected with `--cwd`.

Basic form:

```sh
cr [options] <command>
```

Global options:

```txt
-h, --help      Show help and exit
--version       Show version information and exit
-v, --verbose   Enable verbose logging
-q, --quiet     Suppress notices and log output
--cwd <dir>     Run repo-local commands from another directory
```

`--quiet` does not suppress command result output such as created ticket paths or `cr test` result lines.

`--cwd` applies to repo-local commands such as `init`, `work`, `ticket`, `test`,
and `clean`.

For installation-root commands such as `upgrade`, `install`, and `uninstall`, it is accepted and ignored.

Show top-level help:

```sh
cr --help
```

Show the installed version:

```sh
cr --version
```

Run a repo-local command from another directory:

```sh
cr --cwd /path/to/project test --changed
```

The following commands are currently implemented:

```txt
upgrade
install
uninstall
init
work
clean
ticket
test
```

### `cr init`

Initialize the current working directory for Coderail-based development.

```sh
cr init
```

It creates the following files and directories when they do not already exist:

```txt
.coderail/
.coderail/tickets/
.coderail/loop/
.coderail/loop/.gitignore
.coderail/conf.ini
.coderail/test.map
```

The loop ignore file keeps local agent transcripts out of Git. Existing files
are left untouched.

Examples:

```sh
cr init
cr --cwd /path/to/project init
```

### `cr install`

Install Coderail root instructions and skills for one or more supported coding tools.

Codex, Copilot, and Claude also receive agent instruction files. Gemini does not receive agent files.

Usage:

```sh
cr install [options] [<tool> ...]
```

Supported tools:

```txt
codex
copilot
claude
gemini
```

Default target directories:

```txt
codex    ~/.codex
copilot  ~/.copilot
claude   ~/.claude
gemini   ~/.gemini
```

Target directories can be overridden with:

```txt
CODERAIL_CODEX_HOME
CODERAIL_COPILOT_HOME
CODERAIL_CLAUDE_HOME
CODERAIL_GEMINI_HOME
```

Coderail writes a `.coderail-install` manifest into each target root.

Later installations use the manifest to:

* update managed files
* remove stale managed files
* distinguish managed files from unrelated user files

Manifest entries are validated as relative paths below the target root.

If an existing file is not managed by Coderail, or a managed file was modified, installation refuses to overwrite it unless `--force` is used.

Options:

```txt
-h, --help   Show help and exit
-f, --force  Allow overwriting untracked or modified installation files
```

Examples:

```sh
cr install codex
cr install codex claude
cr install --force copilot
CODERAIL_CODEX_HOME=/tmp/codex-home cr install codex
```

### `cr uninstall`

Remove files previously installed through `cr install`.

Usage:

```sh
cr uninstall [options] [<tool> ...]
```

It supports the same tools and target-directory overrides as `cr install`.

Uninstallation reads the target root's `.coderail-install` manifest and removes only managed files.

Modified managed files are preserved by default. Use `--force` to remove them.

Options:

```txt
-h, --help   Show help and exit
-f, --force  Allow removing modified installation files
```

Examples:

```sh
cr uninstall codex
cr uninstall codex claude
cr uninstall --force gemini
CODERAIL_CLAUDE_HOME=/tmp/claude-home cr uninstall claude
```

### `cr upgrade`

Upgrade the complete managed Coderail installation, including the CLI, libraries, instructions, and root documentation.

By default, it installs the `latest` tag.

Upgrade replaces locally modified managed files and removes managed files that are stale in the target version. It preserves unrelated files, but fails if an unmanaged file already occupies a path managed by the target version.

Usage:

```sh
cr upgrade [options]
```

Options:

```txt
-h, --help        Show help and exit
--version X.Y.Z   Upgrade to a release version
--version vX.Y.Z  Upgrade to a release version
--canary          Upgrade to the latest build from main
```

Examples:

```sh
cr upgrade
cr upgrade --version 1.2.3
cr upgrade --canary
```

### `cr test`

Run validation commands from `.coderail/test.map` for specified files, directories, or files changed in Git.

Usage:

```sh
cr test [options] [<file|dir> ...]
```

At least one selector is required:

```txt
--changed   Run validation for changed files in the current Git repository
<file|dir>  Run validation for a relative file path or directory
```

Directory selectors expand recursively to regular files.

For each selected path, `cr test`:

1. Finds matching sections in `.coderail/test.map`.
2. Expands capture placeholders.
3. Deduplicates rendered commands.
4. Runs commands in file order.
5. Reports the path as `passed`, `failed`, or `no tests found`.

The `[default]` section always applies.

Coderail continues running matching commands after individual failures so all possible failures can be reported. The final exit status is non-zero when any validation command fails.

Use verbose mode to inspect full command output:

```sh
cr --verbose test --changed
```

Absolute paths and parent-directory traversal are not supported. Use paths relative to the selected working directory.

Examples:

```sh
cr test --changed
cr test README.md
cr test lib
cr test src/app.ts tests/app.test.ts
cr --cwd /path/to/project test --changed
```

### `cr clean`

Remove temporary Coderail workflow files after branch work is complete.

Usage:

```sh
cr clean [options]
```

It preserves:

```txt
.coderail/conf.ini
.coderail/test.map
.coderail/work.ini
```

If those are the only files and the remaining directories are empty, cleanup succeeds as a no-op. When ticket files exist, cleanup validates every ticket and removes workflow files only when every ticket is satisfied: closed as `done`, or closed as `duplicate` with a chain ending at `done`. It removes files, including ticket files, but leaves empty directories.

Without ticket files, cleanup checks its helper-file candidates against Git's index. Files not recoverable exactly from the index are listed with a permanent-deletion warning and require a `y` confirmation; `--force` skips the warning and confirmation. `--dry-run` never removes or prompts, and validates ticket readiness before printing the removal plan when ticket files exist.

Options:

```txt
-h, --help   Show help and exit
--dry-run    Print planned removals without changing files
--force      Remove files without confirmation
```

Examples:

```sh
cr clean --dry-run
cr clean
cr clean --force
```

### `cr work`

Manage a local work branch created from the current branch.

Usage:

```sh
cr work <command>
```

Subcommands:

```txt
start <work-name>  Create and switch to coderail/<slug>, then write .coderail/work.ini
finish             Stage a squash integration of recorded work onto its base branch
```

`cr work start` requires a Git repository, `.coderail`, and a clean worktree.
It never pushes the new branch. `cr work finish` requires all tickets resolved
and no untracked or unstaged files; when it produces integration changes, it
leaves them staged on the base branch and can optionally create their commit
through a supported tool.

### `cr ticket`

Manage branch-local tickets under `.coderail/tickets`.

Usage:

```sh
cr ticket <command> [options]
```

Tickets move through three lifecycle states:

```txt
open
active
closed
```

Ticket arguments accept:

* numeric ID
* name
* slug
* relative path
* absolute path

Use a path when a reference is ambiguous.

Run `cr init` before using ticket commands.

Subcommands:

```txt
create [-d <ticket> ...] <name>                      Create an open ticket
next [--limit N]                                     List ready open tickets
activate <ticket>                                    Move an open ticket to active
close [--reason <reason>] [--duplicate-of <ticket>] <ticket>
                                                      Move an active ticket to closed
deactivate [-d <ticket> ...] <ticket>                Move an active ticket to open
reopen [-d <ticket> ...] <ticket>                    Move a closed ticket to open
validate [<ticket> ...]                              Validate tickets
loop [options] [<tool>]                              Process ready tickets with an agent CLI
clean [--dry-run] [--prune] [--yes]                  Deprecated; use cr clean
```

Dependency options accept ticket IDs, names, slugs, or paths and store resolved ticket IDs in the ticket file.

The following commands require dependencies to be satisfied:

```txt
next
activate
close --reason done
```

A dependency is satisfied when it is:

* closed as `done`, or
* closed as a duplicate whose original ticket is satisfied

Close reasons:

```txt
done       Work completed; default
duplicate  Duplicate of another ticket; requires --duplicate-of
deferred   Valid work intentionally postponed
dismissed  Work no longer required
```

#### `cr ticket loop`

`cr ticket loop` requires a Git repository and a completely clean worktree when it starts. Commit or remove newly created or modified ticket files before running it.

It repeatedly:

1. Selects an open ticket whose dependencies are satisfied.
2. Hands the ticket to a supported agent CLI for implementation.
3. Requires the agent to close the ticket as satisfied.
4. When `--auto-review` is set and the ticket closed as `done`, hands its stable ID to an autonomous reviewer.
5. Stages all post-agent changes after the ticket is closed as satisfied.
6. Continues until the configured limit is reached or no ready ticket remains.

Usage:

```sh
cr ticket loop [options] [<tool>] [-- <tool-args>...]
```

Supported tools:

```txt
codex
copilot
claude
gemini
```

If `<tool>` is omitted, Coderail uses `default_tool`.

Use `--` to pass remaining arguments directly to the selected agent CLI for
each implementation and auto-review handoff:

```sh
cr ticket loop codex -- --model gpt-5
```

Options:

```txt
-m <count>, --max <count>  Maximum successful implementation handoffs; default is 5
--all                      Process all ready open tickets; incompatible with --max
--auto-review              Run an autonomous review after each ticket closes as done
```

`--auto-review` is opt-in. It runs the normal implementation handoff first, then reviews tickets closed as `done`. A clean review leaves the ticket closed and its changes are staged normally. A within-scope finding adds tasks to and reopens the source ticket; the reopened-ticket checkpoint is staged, then the ticket returns to normal dependency-aware scheduling. A broader finding creates a dependent follow-up ticket while the reviewed ticket stays closed.

`--max` counts successful implementation handoffs, not unique ticket IDs. Reimplementing a reopened ticket consumes another slot. `--all` can continue through reopened tickets and review-created follow-up tickets until none are ready.

Each agent phase appends its combined standard output and error to the fixed
per-ticket transcript `.coderail/loop/<ticket-basename>.txt`. Agent output is
not streamed to the terminal. Inspect the current handoff with:

```sh
tail -f .coderail/loop/0001-demo.txt
```

`cr init` creates `.coderail/loop/.gitignore` so these local transcripts stay
out of Git. Repeated implementation and review handoffs append to the same
ticket transcript.

By default, the terminal shows compact ticket progress: the title, ticket
file, transcript inspection command, phase status, and durations. For a
limited run, headings use `[current/total]` from the ready-ticket snapshot at
each selection; the total can change after reopened tickets or review-created
follow-ups. `--all` uses `[current]` headings. `--verbose` adds operational
notices for selection, validation, and staging. `--quiet` suppresses both
progress and notices, while transcripts continue to be written.

`cr ticket loop` deliberately does not:

* parse agent JSON output
* split standard output and standard error
* summarize transcripts
* broker agent questions
* automatically approve review findings
* merge completed work

#### Deprecated `cr ticket clean`

`cr ticket clean` is deprecated. Use:

```sh
cr clean
```

The legacy command remains available for backward compatibility.

It requires no active tickets.

By default, it removes:

* tickets completed as `done`
* duplicate tickets whose original ticket is completed

When an open ticket depends on a removed closed ticket, the removed dependency reference is deleted.

Options include:

```txt
--dry-run   Preview changes
--prune     Remove all closed tickets and open tickets that depend on
            unsatisfied closed tickets
--yes       Confirm destructive pruning when required
```

Examples:

```sh
cr ticket create "Add README examples"
cr ticket create -d 0001 "Document ticket workflow"
cr ticket next --limit 3
cr ticket activate 0002
cr ticket close 0002
cr ticket close --reason duplicate --duplicate-of 0001 0003
cr ticket deactivate -d 0001 0004
cr ticket reopen 0005
cr ticket validate
cr ticket loop codex
cr ticket loop --all claude
cr ticket loop --max 2 --auto-review gemini
```

## Development

Run the full test suite:

```sh
sh test/all.sh
```

Run release helper tests directly or through the repository test map:

```sh
sh test/build/release.test.sh
cr test build/release.sh
```

### Release Helper

Maintainers publish stable releases with:

```sh
./build/release.sh --patch
./build/release.sh --minor
./build/release.sh --major
```

The helper derives the next stable version from the highest `vX.Y.Z` tag visible locally or on `origin`.

Before publishing, it requires:

* the current branch to be `main`
* a clean working tree
* matching version metadata in `lib/version.sh`
* a matching release section and links in `CHANGELOG.md`

Running the helper is the publishing action.

It:

1. Creates an annotated version tag.
2. Moves the annotated `latest` tag.
3. Pushes both tag updates to `origin` atomically.

This keeps the release process simple, predictable, and free from unexplained semantic-version teleportation.

## Inspirations

Matt Pocock's [`skills`](https://github.com/mattpocock/skills) project helped shape the idea that coding agents behave better when given explicit, reusable skills and operational rails instead of large one-off prompts.

The [`andrej-karpathy-skills`](https://github.com/multica-ai/andrej-karpathy-skills) project by Multica AI inspired parts of the agent instruction structure used by Coderail.

Coderail is not a fork of either project, but some instruction files were reused, adapted, or inspired by their work.

## License

`AGPL-3.0-or-later`
