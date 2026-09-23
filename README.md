# CodeRail

**Coderail keeps engineers in the development loop, prioritizing understood and
reviewable changes over fully autonomous implementation.**

It is a lightweight command-line tool, skill set, and shared workflow for
engineers working with coding agents. Its main purpose is to keep engineers in
the loop, helping them understand the system, the codebase, and the implementation
produced with an agent.

Engineers discuss ideas, guide the work, and build their understanding as the
implementation develops. CodeRail supports that collaboration with
repository-local ideas, implementation tickets, and configured test commands.

The preferred approach is to open your project in a coding-agent harness (the
application where you work with the agent) and invoke CodeRail's skills. You
discuss and guide the work; the agent follows the skills and uses `cr` to manage
ideas, tickets, and validation. You can also call `cr` directly and maintain the
documents yourself. Both approaches use the same project files.

## Table of contents

- [Current status](#current-status)
- [Installation](#installation)
- [Quick start](#quick-start)
  - [Work with an agent (preferred)](#work-with-an-agent-preferred)
  - [Use the CLI directly](#use-the-cli-directly)
- [Working with ideas](#working-with-ideas)
- [Working with tickets](#working-with-tickets)
- [Running tests](#running-tests)
- [Project files and configuration](#project-files-and-configuration)
- [Getting help](#getting-help)
- [License](#license)

## Current status

CodeRail is under development. The following commands are implemented:

| Command | Purpose |
| --- | --- |
| `cr init` | Initialize a project for CodeRail. |
| `cr idea` | Create, organize, and track ideas. |
| `cr ticket` | Manage implementation tickets and their dependencies. |
| `cr test` | Run configured test commands for selected paths or changed files. |

The `install`, `uninstall`, `doctor`, `status`, and `loop` commands are planned.
They appear in `cr --help` but are not available yet.

## Installation

Run the install script to install the latest release into `~/.coderail`:

```sh
curl -fsSL https://raw.githubusercontent.com/pavelmudroch/coderail/main/install.sh | sh
```

Add the following line to your shell's startup file, and run it in your current
terminal to make `cr` available immediately:

```sh
export PATH="$HOME/.coderail/bin:$PATH"
```

Verify the installation:

```sh
cr --version
```

## Quick start

From your project's root directory, initialize CodeRail:

```sh
cr init
```

### Work with an agent (preferred)

Open the project in your coding-agent harness with CodeRail's skills available.
Use the harness's skill invocation mechanism to select each skill and provide
the context below. Skill invocations happen in the harness; `cr` commands run in
the terminal, either by you or by the agent.

Work through these stages one at a time, discussing decisions and reviewing the
result before moving to the next:

| Invoke skill | Provide | What the agent does |
| --- | --- | --- |
| `forge` | An idea such as "Add search", or an existing `IDEA.md` path. | Discusses the outcome, scope, and decisions with you, maintains `IDEA.md`, and uses `cr idea` to manage its state or split it into child ideas. |
| `spec` | The ready idea, for example `.coderail/plans/add-search/IDEA.md`. | Writes an implementation specification in `SPEC.md` next to the idea. |
| `ticket` | The specification, for example `.coderail/plans/add-search/SPEC.md`. | Breaks the work into small tickets, creates them with `cr ticket`, and fills in tasks, validation criteria, references, and dependencies. |
| `implement` | A ticket ID or path, or no ticket to select the next available one. | Activates the ticket, implements its tasks, validates the changes with `cr test`, and closes the ticket when complete. |

For example, invoke `spec` in your harness and pass
`.coderail/plans/add-search/IDEA.md`. The skill guides the agent through writing
the specification; there is no `cr spec` command to run.

Follow [Running tests](#running-tests) to configure the project's validation
commands before implementation. Stay involved as the agent works: discuss
decisions, inspect the changes, and make sure you understand the result.

### Use the CLI directly

You can perform the same workflow yourself, using `cr` for file creation and
state changes and your editor for the document contents. Start with an idea:

```sh
cr idea create "Add search"
```

Open `.coderail/plans/add-search/IDEA.md` in your editor. Below its metadata,
describe the problem, the desired behavior, and the scope.

When the problem, scope, and key decisions are settled, mark the idea ready for
an implementation specification:

```sh
cr idea ready .coderail/plans/add-search/IDEA.md
```

Write `SPEC.md` next to the idea, describing the intended behavior,
implementation approach, and how you will verify the result. Review it, then
break the work into implementation tickets. For this small example:

```sh
cr ticket create "Implement search"
```

The ticket command prints the path to the new Markdown file. Open it and add the
implementation scope and acceptance criteria below its metadata. Reference the
idea and specification so the reasoning stays accessible.

List available tickets and activate this one using its slug:

```sh
cr ticket next
cr ticket activate implement-search
```

Implement the change and review the code.
Follow [Running tests](#running-tests) to configure and run the relevant tests.
Once you understand the changes and have verified that they meet the acceptance
criteria, close the ticket:

```sh
cr ticket close implement-search
```

## Working with ideas

An idea records a problem or desired outcome to explore before planning the
implementation. Each idea lives in `.coderail/plans/<idea-slug>/IDEA.md`;
child ideas live in subdirectories of their parent.

Prefer invoking `forge` in your harness to create or refine an idea through
discussion with the agent. You can start with a description or pass an existing
idea file. Once the idea is ready, invoke `spec` with its `IDEA.md` path to produce
`SPEC.md` alongside it.

If you create the idea manually, use the Markdown body below the metadata to capture:

- **Problem:** What needs to change, and why?
- **Desired outcome:** What should the user or system be able to do?
- **Scope:** What is included, and what is outside this idea?
- **Key decisions:** What have you agreed on, and why?
- **Open questions:** What still needs to be resolved?

This checklist is guidance; the CLI does not enforce a body format or assess
whether an idea is complete.

| State | Meaning |
| --- | --- |
| `forging` | The idea is being explored and refined. New ideas start here. |
| `ready` | The problem, scope, and key decisions are settled enough to write an implementation specification. |
| `split` | The idea has been divided into child ideas that are refined separately. |

The agent uses `cr idea` to manage these states during forging. For direct CLI
use, mark a forging idea ready once you have resolved the questions needed to
write its specification. If a ready idea needs further exploration, reforge it
to return it to `forging`:

```sh
cr idea ready .coderail/plans/add-search/IDEA.md
cr idea reforge .coderail/plans/add-search/IDEA.md
```

Split a broad forging idea into at least two smaller ideas:

```sh
cr idea create "Improve search"
cr idea split .coderail/plans/improve-search/IDEA.md "Filter results" "Sort results"
```

The parent becomes `split`, and each child starts in `forging`. You can add more
children to a split parent with `create --parent`:

```sh
cr idea create --parent .coderail/plans/improve-search/IDEA.md "Save searches"
```

View the idea hierarchy and statuses with `cr idea map`. Use `cr idea map --json`
when you need structured output.

## Working with tickets

Each ticket should describe one small, reviewable change with explicit acceptance
criteria. Use its Markdown body to record the scope, reference the specification,
and explain how to verify completion. Keeping work small helps you understand
the agent's decisions and review the implementation as it develops.

Prefer invoking `ticket` in your harness with the specification to have the
agent create and populate tickets. Then invoke `implement` with a ticket, or
without one to work on the next available ticket. The agent uses `cr ticket`
for the lifecycle and `cr test` for validation while you guide and review the
work.

Tickets live under `.coderail/tickets/` and move from `open` to `active` to
`closed`. Commands accept a ticket ID, path, or slug; these examples use slugs.

For direct CLI use, create tickets and declare any work that must finish first:

```sh
cr ticket create "Build search index"
cr ticket create --depends-on build-search-index "Display search results"
cr ticket next --limit 1
cr ticket activate build-search-index
```

Repeat `--depends-on` for multiple dependencies. `cr ticket next` lists only open
tickets whose dependencies are satisfied. Activation also requires satisfied
dependencies.

Implement the active ticket, review the changes, and verify its acceptance
criteria before closing it:

```sh
cr ticket close build-search-index
cr ticket next
```

Closing the index ticket as done makes the results ticket available. Closing
with the default reason, `done`, requires an active ticket with satisfied
dependencies. For other outcomes, use `cr ticket close --reason <reason> <ticket>`:

| Reason | Use when |
| --- | --- |
| `done` | The work is complete. This is the default. |
| `duplicate` | Another ticket covers the work. Also pass `--duplicate-of <ticket>`. |
| `deferred` | The work is postponed. |
| `dismissed` | The work will not be pursued. |

A dependency is satisfied when it is closed as `done`, or closed as a duplicate
whose referenced ticket ultimately resolves to `done`. Deferred and dismissed
tickets do not satisfy dependencies.

Return a closed ticket to `open` when it needs more work:

```sh
cr ticket reopen build-search-index
```

Reopening preserves existing dependencies. You can add more with `--depends-on`.

## Running tests

`cr test` matches selected files against `.coderail/test_map` and executes the
configured commands. Those commands can invoke your project's test runner,
linters, or other checks, regardless of the project's programming language.

The `implement` skill runs `cr test` through the agent. You can also run it
directly; both approaches use the same test map and shell configuration.

`cr init` creates a comment-only map. Add patterns and commands for your project
before running tests. For example, if your project provides `test-file` and
`lint-file` scripts that accept a source path:

```text
[src/${file}]
./scripts/test-file "src/${file}"
./scripts/lint-file "src/${file}"
```

Replace these example commands with your own. For `src/search.ts`, `${file}`
captures `search.ts`, and CodeRail substitutes it into both commands. Patterns
match whole paths relative to the working directory. Named captures and `*`
can span directories; `?` matches one character. Quote substituted values as
needed for your commands and shell.

Run commands for a file, a directory, or files changed in Git:

```sh
cr test src/search.ts
cr test src/
cr test --changed
```

Supply at least one path or `--changed`. The latter includes staged, unstaged,
and untracked files, excluding deleted files, and requires a Git working tree.
Use `cr test --short --changed` for compact `<file> ok/fail` output.

Commands normally stream their output directly. Identical commands run once
per invocation after capture substitution. A failed command stops later
capture-dependent commands for that file; shared commands without capture
references still run. Any command failure makes `cr test` exit with a nonzero
status. If no commands match, it reports `No tests found`.

The command shell is selected in this order, using the first configured value:

1. The `TEST_SHELL` environment variable.
2. `test_shell` in `.coderail/coderail.conf` under the directory where `cr` was launched.
3. `test_shell` in `<install-dir>/.coderail/coderail.conf`.
4. The `SHELL` environment variable.
5. `sh` as the fallback.

An unrecognized `TEST_SHELL` or configured `test_shell` causes an error. An
unrecognized `SHELL` produces a warning and falls back to `sh`.

For example, select Bash with:

```ini
test_shell=/bin/bash
```

Write map commands for the selected shell. Set `test_shell` in the repository
configuration when the commands require a specific shell across contributors.

## Project files and configuration

CodeRail keeps project data in `.coderail/` at the project root:

| Path | Contents |
| --- | --- |
| `.coderail/plans/` | Ideas and their hierarchy, with `IDEA.md` and its implementation specification, `SPEC.md`, when written. |
| `.coderail/tickets/` | Ticket Markdown files, organized into `open/`, `active/`, and `close/` directories. |
| `.coderail/test_map` | File patterns and the commands to run for matching files. |
| `.coderail/coderail.conf` | Repository configuration shared by commands run for this project. |

`cr init` creates the plans directory, repository configuration, and test map.
Ticket directories are created as needed. Whether you commit these files to
version control is up to you; CodeRail does not require it.

Configuration is loaded in this order, with later values overriding earlier ones:

1. Built-in defaults.
2. `<install-dir>/.coderail/coderail.conf`, where `<install-dir>` is the directory
   containing CodeRail's `bin/` and `lib/` directories. With the installation
   above, this is `~/.coderail/.coderail/coderail.conf`.
3. `.coderail/coderail.conf` under the directory where `cr` was launched.
4. Nonempty environment overrides listed below.

Missing configuration files are skipped. Local configuration is read before
changing directories, so `--cwd` does not change which configuration file is
loaded. Each file is validated as it is read; an invalid setting fails even if
a later file or environment variable would override it.

Both configuration files use case-sensitive `key=value` lines. Blank lines and
lines starting with `#` (after optional whitespace) are ignored. Surrounding
whitespace is trimmed from keys and values. Values are literal: quotes are not
removed, `$HOME` and `~` are not expanded, and inline comments are not supported.
Unknown keys and lines without `=` cause an error. For example:

```ini
# Preferred agent harness
default_harness=codex

# Shell used to execute commands from the test map
test_shell=/bin/bash
```

These are all supported configuration keys and their environment overrides:

| Configuration key | Environment override | Built-in default | Accepted value / purpose |
| --- | --- | --- | --- |
| `default_harness` | `DEFAULT_HARNESS` | None | Optional preferred harness: `codex`, `claude`, `copilot`, or `gemini`. |
| `test_shell` | `TEST_SHELL` | Valid `SHELL`, otherwise `sh` | Shell command name or path recognized by `command -v`; runs test-map commands. |
| `codex_command` | `CODEX_COMMAND` | `codex` | Agent executable; command name on `PATH` or path, without command-line arguments. |
| `claude_command` | `CLAUDE_COMMAND` | `claude` | Agent executable; command name on `PATH` or path, without command-line arguments. |
| `copilot_command` | `COPILOT_COMMAND` | `copilot` | Agent executable; command name on `PATH` or path, without command-line arguments. |
| `gemini_command` | `GEMINI_COMMAND` | `gemini` | Agent executable; command name on `PATH` or path, without command-line arguments. |
| `codex_home` | `CODEX_HOME` | `$HOME/.codex` | Agent home directory; explicit values must name an existing directory. |
| `claude_home` | `CLAUDE_HOME` | `$HOME/.claude` | Agent home directory; explicit values must name an existing directory. |
| `copilot_home` | `COPILOT_HOME` | `$HOME/.copilot` | Agent home directory; explicit values must name an existing directory. |
| `gemini_home` | `GEMINI_HOME` | `$HOME/.gemini` | Agent home directory; explicit values must name an existing directory. |

The `$HOME` defaults above are expanded by CodeRail itself. Use literal paths
in configuration files; shell expansion works when setting environment variables.
Executable configuration values and environment overrides must resolve
successfully; symbolic links are followed. Empty environment overrides are
ignored. `DEFAULT_HARNESS` is optional; when nonempty, it must name a supported
harness and overrides the configured `default_harness`.

For example, select a harness and override the test shell for one invocation:

```sh
DEFAULT_HARNESS=claude TEST_SHELL=/bin/sh cr test src/
```

Output behavior has separate environment controls:

| Environment variable | Values and behavior |
| --- | --- |
| `LOG_LEVEL` | `verbose` enables verbose logging; `quiet` suppresses warnings, informational messages, and verbose logs. Other values are ignored; errors and command output remain visible. |
| `NO_COLOR` | Any nonempty value disables colored output, including `0`. |
| `NON_INTERACTIVE` | Any nonempty value disables interactive output, including `0`. |

Logging defaults to normal verbosity. Color and interactive output are enabled
only when standard error is a terminal and logging is not quiet.

Use global CLI options to adjust individual invocations:

| Option | Purpose |
| --- | --- |
| `--cwd <dir>`, `--cwd=<dir>` | Select the working directory; defaults to the launch directory (or the lowercase `cwd` environment variable if nonempty). Does not relocate configuration loading. |
| `-v`, `--verbose` | Enable verbose logging. |
| `-q`, `--quiet` | Suppress warnings, informational messages, and verbose logs; errors and command output remain visible. |
| `--no-color` | Disable colored output. |
| `--non-interactive` | Disable prompts and interactive output. |

CLI logging options are applied after the output environment variables.
The last `--verbose` or `--quiet` option wins for verbosity; short options can
be combined (for example, `-qv` ends with verbose logging). Only `--cwd` takes a
value; the other options are switches and reject `=value` arguments.

These global options can appear anywhere in the command line before a `--`
end-of-options separator. For example, these commands are equivalent:

```sh
cr --verbose ticket create "Add search"
cr ticket --verbose create "Add search"
cr ticket create --verbose "Add search"
```

## Getting help

Use `--help` at any command level to see its arguments and options. Run help for
project commands from an initialized project directory:

```sh
cr --help
cr ticket --help
cr ticket close --help
```

Add `--verbose` when you need more diagnostic output, for example:

```sh
cr --verbose test src/
```

If CodeRail reports that the current directory is not initialized, check that
you are in the project root and run `cr init` if the project has not been set up.

If `cr test` reports `No tests found`, check that `.coderail/test_map` contains
commands and that its patterns match the selected paths relative to your working
directory. With `--changed`, also check that there are changed files to select.
This message means no mapped commands ran.

## License

[AGPL-3.0-or-later](LICENSE)
