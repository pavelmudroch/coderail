# Commands and configuration

[Overview and workflow](../README.md) · [Installation](INSTALLATION.md) · [Commands and configuration](COMMANDS.md) · [Automation](AUTOMATION.md)

## Table of contents

- [Start a project](#start-a-project)
- [Agent instructions](#agent-instructions)
- [Ideas and tickets](#ideas-and-tickets)
- [Configuration](#configuration)
- [Verify your changes](#verify-your-changes)
- [Command help and current limitations](#command-help-and-current-limitations)

## Start a project

Run these commands from your project's root directory:

```sh
cd /path/to/your/project
cr init
cr ticket create "Add a search page"
cr ticket next
```

`cr init` creates `.coderail/config` without replacing an existing
configuration. It also creates or repairs `.coderail/.gitignore`, preserving
custom content. Runtime output is ignored; the configuration, ignore file, plans,
and tickets remain eligible for version control, including nested content.
Already tracked files stay tracked; init does not remove them from Git's index.

For existing projects, rerun `cr init` from the project root to repair the ignore
rules. Commands requiring initialization check the nearest `.coderail` directory
and report incomplete initialization with `cr init` guidance. They do not skip
an incomplete nested project in favor of an initialized parent. Init remains
available to repair it.

Tickets and ideas are Markdown files under `.coderail`, so you can edit their
contents and keep them in version control alongside your code.

## Agent instructions

Install CodeRail's bundled skills and subagents for Codex or Claude:

```sh
cr install codex
cr install claude
```

Installation is global by default. Use `--local` from an initialized project to
install into that project instead:

```sh
cr install --local codex
cr uninstall --local codex
```

You can name both harnesses in one command. If you omit the harness, CodeRail uses
`default_harness` from configuration; for example, `default_harness = codex`.

| Harness | Global home | Project-local destinations |
| --- | --- | --- |
| Codex | `~/.codex`, or absolute `CODEX_HOME` | `.codex/skills/`, `.codex/agents/`, and `AGENTS.md` |
| Claude | `~/.claude`, or absolute `CLAUDE_CONFIG_DIR` | `.claude/skills/`, `.claude/agents/`, and `.claude/rules/coderail.md` |

Global skills and subagents go into `skills/` and `agents/` under the harness
home. General instructions, when bundled, become Codex `AGENTS.md` or Claude
`rules/coderail.md`. Codex subagents are generated as TOML files; Claude subagents
remain Markdown. Local operations ignore global home overrides and target the
nearest ancestor containing `.coderail`, including when invoked from a subdirectory.

CodeRail tracks installed files in a separate `.coderail-install` manifest for
each harness and scope. Unchanged owned files update without prompts; existing
unowned files and modified owned files require `--force` and confirmation.
For unattended conflict handling, combine `--force` with `--yes` to approve or
`--no` to decline. Codex `AGENTS.md` is managed as a whole file, without merging
existing project instructions.

`cr uninstall <harness>` removes owned instruction files in the selected scope.
Modified files require the same force and confirmation options; unrelated files
are preserved. Missing instruction sources are allowed, and omitted skills are
left installed. Reinstalling a present Codex skill whose invocation flag was
removed retires its obsolete owned invocation-policy file under the same protections.

## Ideas and tickets

Capture an idea and display the idea tree:

```sh
cr idea create "Improve search"
cr idea
```

Use `cr idea ready <idea>` when an idea is ready for further processing,
`cr idea split <idea> "First part" "Second part"` to divide it, or
`cr idea reopen <idea>` to reopen it. After creating tickets from a ready idea,
use `cr idea archive <idea>` to mark it as archived. Only ready ideas can be
archived; `--json` returns the updated idea. Archived ideas remain visible with
their status in `cr idea` and `cr idea --json`, and can be reopened. Use the idea
identifier returned by the CLI.

Tickets track implementation work. After creating a ticket, use its returned ID
in subsequent commands. Existing tickets can be identified by a numeric ID with
at least four digits, an ID-prefixed filename or slug such as
`0001-improve-search.md` or `0001-improve-search`, or a ticket path.
Paths and filenames resolve by their leading ID within the current project, even
if the ticket has moved to another status directory. Dependency and duplicate
references accept the same forms and store numeric IDs. For example, if the ID is `0001`:

```sh
cr ticket next --limit 1
cr ticket activate 0001
cr ticket close 0001
```

For the same ticket, a path can be reused after activation moves the file:

```sh
cr ticket activate .coderail/tickets/open/0001-improve-search.md
cr ticket close .coderail/tickets/open/0001-improve-search.md
```

`cr ticket next` lists open tickets whose dependencies are satisfied, ordered by ID.
Create a dependent ticket with `cr ticket create --depends-on 0001 "Add search filters"`.
Use `cr ticket reopen 0001` to reopen a closed ticket. Idea and ticket commands
support `--json` for scripts.

## Configuration

Save project settings in `.coderail/config`, or global defaults in
`config` under the CodeRail installation directory. Project loop settings
override global values by harness and individual key; omitted keys retain global
defaults.

When upgrading from a version that uses `coderail.conf`, rename that file to
`config` in `.coderail/` and in the installation directory, if present. The old
filename is no longer read. In existing projects, run `cr init` after renaming
to update `.coderail/.gitignore` so the new file stays tracked.

Loop model and effort preferences use harness-specific sections:

```toml
[loop.codex]
model = "gpt-6.1-sol"
effort = "medium"
commit_model = "gpt-6.1-terra"
commit_effort = "low"

[loop.claude]
model = "opus"
effort = "high"
commit_model = "haiku"
```

Each section accepts `model`, `effort`, `implement_model`, `implement_effort`,
`review_model`, `review_effort`, `commit_model`, and `commit_effort`. Values must
be nonblank strings and retain their native harness meaning. Only the selected
harness's section applies.

`cr loop` accepts overrides such as
`cr loop codex -o model=gpt-6.1-sol,effort=medium,implement-model=gpt-6.1-terra`.
Model and effort resolve independently, highest priority first:

1. Stage-specific CLI option, such as `commit-model` or `review-effort`.
2. Common CLI option, `model` or `effort`.
3. Stage-specific saved setting.
4. Common saved setting.
5. Native harness default, with the setting omitted from the request.

A common CLI model therefore overrides a saved `commit_model`; an explicit
`commit-model` CLI option supplies an exception. A model override does not change
effort precedence. Execution preflight checks all enabled stages before
implementation begins. There is no static compatibility table.
Effort labels do not imply equal reasoning budgets across providers, and
preflight does not guarantee detection of silent provider fallback.

## Verify your changes

Configure verification rules in `.coderail/config`. For example, a project
using Deno can check each TypeScript source file with:

```toml
[[verify.rules]]
pattern = "src/${path:**/}${file:*}.ts"
commands = [
    ["deno", "check", "src/${path}${file}.ts"]
]
```

The pattern captures directory and file names for substitution into command
arguments. Replace the example command with your project's checks; any tools
used by a rule must be installed separately.

```sh
cr verify ./src/main.ts
cr verify ./src
cr verify --changed
cr verify --short --changed
cr verify -s -c
cr verify --dry --changed
```

`-c` or `--changed` selects files changed in Git. Files without applicable commands are
reported as `skipped`. Matching commands run from the project root, and duplicate
command results are reused. Rules can also declare `requires` paths; a rule is
skipped when its required files are missing. Optional `[verify]` `pre` and `post`
command arrays run once around matching work; place that section before rule entries.

During implementation, prefer one summary invocation with explicit changed source
and test paths, such as `cr verify -s ./src/main.ts ./tests/main.test.ts`, then use
`cr verify <failed-file>` for failure details. This reuses shared checks and runs
preparation once. Include every file required by repository instructions and honor
requirements for separate invocations. If running checks separately, stop on failure
or accumulate failures so a passing final command cannot hide an earlier failure.
After corrections, repeat relevant checks and the final aggregate verification
before closing the ticket. A `skipped` result does not validate behavior.

Add `--dry` to preview expanded commands, including preparation and cleanup,
without executing them. Applicable files and commands are reported as `planned`;
`--short` shows only file statuses. Required files are checked against the current
filesystem, so rules that depend on files normally created by preparation may be
skipped in a dry run.

## Command help and current limitations

Use `cr --help`, `cr <command> --help`, or a subcommand's help, such as
`cr ticket close --help`, for available options. Global options include
`--cwd <path>`, `--non-interactive`, `--no-color`, `--verbose`, and `--quiet`.
For example, `cr --cwd /path/to/project ticket next` selects another project.

Templates are stored at `<installRoot>/templates/<name>`, including during source
development. Use `cr template` to list them alphabetically or `cr template <name>`
to inspect an exact name. `--json` returns an array of `{ name, description, path }`
entries; `--path` prints absolute paths, one per line. These output flags are
mutually exclusive. Use `cr template -- create` or `cr template -- delete` to
inspect a template with a reserved name.

`cr template create <name> [--description <text>] [--json | --path]` scaffolds an
empty `assets/` directory, an empty `config` file, and an extensionless `template`
metadata file using Coderail config syntax (`description = "text"`). The description
defaults to an empty string. Startup scripts (`startup.sh`, `startup.ps1`, or
`startup.ts`) are optional and are not generated. Existing directories are protected.

`cr template delete <name> [--yes] [--json | --path]` recursively removes the
named template after confirmation. Declining succeeds without a result record.
Noninteractive deletion requires `--yes`. Deletion returns the removed template's
former path and metadata in the selected output format.

`cr init <template> ...` applies installation templates to the effective working
directory selected by `--cwd`, in the order supplied. Nested assets are copied
into the project and settings are merged into `.coderail/config`: later scalar
values override earlier values, arrays are appended and deduplicated, and
property comments are preserved. Existing directories merge and identical files
are skipped. By default, a differing file or file/directory mismatch fails before
any of that template's assets or configuration are written. Invalid layout or settings
also fail before copying. Errors and cancellation stop subsequent templates;
earlier applications and partial I/O changes remain in place.

After copying assets and saving merged settings, each template runs at most one
startup script before the next template begins. On Unix, `startup.sh` takes
precedence over `startup.ts`; on Windows, `startup.ps1` takes precedence over
`startup.ts`. A script for the other platform is ignored. If no applicable script
exists, initialization continues without startup. Scripts run from the target
project root using `sh`, `pwsh -File`, or `deno run -A`, with inherited input and
output streams. The required interpreter must be available on `PATH`.

Missing interpreters and nonzero exits fail initialization. Cancellation
terminates the running child and stops later templates. Script effects, copied
assets, and merged settings remain in place after failure or cancellation.

Use `cr init --force <template> ...` to confirm each differing-file overwrite.
All required answers are collected before that template writes any assets or
configuration. Declining preserves the file and continues with remaining assets,
configuration merging, startup, and subsequent templates. Identical files and
merging directories need no confirmation; file/directory mismatches always fail.
For unattended use, add `--yes` to accept every overwrite or `--no` to skip every
conflicting file. Both require `--force` and cannot be combined. Force alone
requires an interactive terminal when a differing file is encountered. The short
forms are `-f`, `-y`, and `-n`.

Use `cr init my-template --dry` for a read-only preview. It reports planned
copies, skips, configuration merges, asset conflicts, and selected startup
scripts, including when the project directory does not exist. Templates are
compared in order against preceding planned files and cumulative configuration.
Preview never creates files, asks overwrite questions, or runs scripts; arbitrary
startup effects are not predicted. All known asset conflicts are reported and
cause failure even with `--force --yes` or `--force --no`.

Use `cr init my-template --dry ./preview` to perform full initialization in an
alternate directory, creating it if needed. Relative directories resolve against
the effective `--cwd`. Assets, merged configuration, startup scripts, and normal
overwrite confirmation rules all apply there. With no templates, this creates
only the base project setup. The original working directory is left untouched.

`--dry` consumes its next argument as a directory unless that argument starts
with `-`. Put template names before `--dry`: `cr init --dry my-template` initializes
a directory named `my-template` without applying a template. An option immediately
after `--dry` leaves it in preview mode. Arguments after `--` remain literal
template names.
Use `cr doctor --repair` for supported automatic repairs; see
[diagnostics and repair limits](INSTALLATION.md#diagnosing-setup-problems).
