# Coderail

Lightweight repo-local guide rails for coding agents.

Coderail helps coding agents work inside a repository without needing to know every project-specific convention, validation command, test runner, formatter, linter, ticket convention.

It is intentionally small.

Coderail is not a permanent issue tracker or full project management platform. It is a small set of commands to help agents safely complete work inside a branch.

## Purpose

Coderail exists to keep agents on rails while they work. And is trying to unify the behavior between different agent tools, currently including:
- [`codex` (OpenAI Codex)](https://developers.openai.com/codex/cli)
- [`claude` (Anthropic Claude)](https://code.claude.com/docs/en/quickstart#step-1-install-claude-code)
- [`copilot` (GitHub Copilot)](https://github.com/features/copilot/cli)
- [`gemini` (Google Gemini)](https://geminicli.com/)

It gives agents a small set of commands for:

* initializing repo-local agent workflow files
* installing tool-specific agent instructions
* running the correct validation commands for changed files
* creating and moving tickets through a simple lifecycle
* finding the next ready ticket
* cleaning branch-local ticket scaffolding before merge

The main idea:

Coderail helps agents safely complete work inside a branch.
Git keeps the permanent history.

## What Coderail Is

Coderail is:

* a lightweight POSIX-shell based CLI
* a repo-local workflow helper
* a validation command router
* a simple ticket lifecycle tool
* a way to reduce agent context pollution
* a way to avoid teaching every agent every project-specific test command
* branch-scoped scaffolding for coding work

A typical flow:

```txt
create feature branch
→ research / plan
→ create ticket(s)
→ implement ticket(s)
→ run validation through cr test
→ close completed tickets
→ clean ticket scaffolding
→ merge branch
```

## What Coderail Is Not

Coderail is not:

* a permanent issue tracker
* a replacement for Git history
* a replacement for CI
* a general build system
* a workflow engine
* a project management platform
* a database of every past decision
* a place to satisfy every possible future use case

If a feature does not help agents safely complete branch-local work, it probably does not belong in the first version.

Tiny tools survive. Platforms grow dashboards and then everyone suffers.

## Supported Systems

Coderail is intended for Unix-like environments:

* Linux
* macOS
* Windows through WSL

Coderail uses POSIX shell scripts and assumes a shell environment close to Linux/macOS behavior.

Native Windows support outside WSL is not a primary target.

## Installation

Use shell command to download a bootstrap installation script to install Coderail.

```sh
curl -fsSL https://github.com/pavelmudroch/coderail/raw/refs/heads/main/INSTALL | sh
```

By default, this installs Coderail into your home directory under `~/.coderail`. You can change the installation directory by setting the `CODERAIL_INSTALL_DIR` environment variable before running the install script.

After installation, add the `.coderail/bin` directory to your `PATH` environment variable to make the `cr` command available in your shell.

Example of default installation under `~/.coderail`:

```sh
export PATH="$HOME/.coderail/bin:$PATH"
```

Run the following command to verify that Coderail is installed correctly:

```sh
cr --help
```

Following examples are brief showcase of `cr` tool commands. For more details, see the `cr` tool help.
Each command and sub command of installed `cr` tool includes `--help` option to show usage and available options.

## Configuration

### `~/.coderail/config.ini`

General user-local Coderail settings live here.

### `.coderail/conf.ini`

General repo local Coderail settings live here. These settings override user-local settings.

Example:

```ini
default_tool = codex
```

### `.coderail/test.map`

The test map tells Coderail which commands to run for changed files.

It is intentionally INI-like, but not standard INI. Section names are path globs. Lines inside sections are shell commands.

Example:

```ini
[default]
biome format {path}
biome check {path}

[net/tcp/**/*.ts]
deno test tests/net/tcp.test.ts

[config/**/*.ts]
deno test tests/config.test.ts
```

Rules:

- [default] commands always run.
- Other section names are glob patterns.
- Commands run in file order.
- A path fails if any matching command exits with a non-zero status, but all commands continue to run and collect output, so all possible failures are reported.
- All commands are pre-rendered and deduplicated before execution.

Placeholders:

```txt
{path}   one path; command repeats once per path
```

## Usage

`cr` is the Coderail command line tool. It runs repo-local agent workflow commands from the current directory, or from a directory selected with `--cwd`.

Basic form:

```sh
cr [options] <command>
```

Global options:

```txt
-h, --help      Show help and exit
--version       Show version information and exit
-v, --verbose   Enable verbose logging
-q, --quiet     Suppress non-error output
--cwd <dir>     Run repo-local commands from another directory
```

`--cwd` is valid for repo-local commands such as `init` and `test`. For user-local installation commands such as `install` and `uninstall` has no effect, because they are not repo-local.

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

This section documents commands that are currently implemented and ready to use: `init`, `install`, `uninstall`, `test`, and `ticket`.

### `cr init`

Initialize the current working directory for Coderail agent-based development.

This creates the repo-local `.coderail` directory, a ticket directory, and starter configuration files when they do not already exist. Existing files are left untouched.

Usage:

```sh
cr init
```

Examples:

```sh
cr init
cr --cwd /path/to/project init
```

Created files and directories:

```txt
.coderail/
.coderail/tickets/
.coderail/conf.ini
.coderail/test.map
```

### `cr install`

Install Coderail instructions, skills, and agent files for one or more supported agent tools.

Usage:

```sh
cr install [options] <tool ...>
```

Supported tools:

```txt
codex
copilot
claude
gemini
```

By default, files are installed into the matching user-local tool directory:

```txt
codex    ~/.codex
copilot  ~/.copilot
claude   ~/.claude
gemini   ~/.gemini
```

Target directories can be overridden with environment variables:

```txt
CODERAIL_CODEX_HOME
CODERAIL_COPILOT_HOME
CODERAIL_CLAUDE_HOME
CODERAIL_GEMINI_HOME
```

Coderail writes a `.coderail-install` manifest in each target root. On later installs, that manifest is used to update managed files and remove stale managed files. If an existing target file is untracked by Coderail, or a managed file was modified, install refuses to overwrite it unless `--force` is used.

Options:

```txt
-h, --help   Show help and exit
-f, --force  Allow overwriting untracked and modified existing installation files
```

Examples:

```sh
cr install codex
cr install codex claude
cr install --force copilot
CODERAIL_CODEX_HOME=/tmp/codex-home cr install codex
```

### `cr uninstall`

Remove files previously installed by `cr install` for one or more supported agent tools.

Usage:

```sh
cr uninstall [options] <tool ...>
```

Supported tools:

```txt
codex
copilot
claude
gemini
```

Uninstall reads the target root `.coderail-install` manifest and removes only managed files. Empty parent directories created by the install can be removed as cleanup. Modified managed files are preserved by default; use `--force` to remove them anyway.

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

### `cr test`

Run validation commands from `.coderail/test.map` for specified files, or for changed files detected by Git.

Usage:

```sh
cr test [options] [<file> ...]
```

At least one selector is required:

```txt
--changed   Run tests for changed files in the current Git repository
<file>      Run tests for a specific relative file path
```

`cr test` reads `.coderail/test.map`, finds sections whose glob patterns match each selected path, expands `{path}` placeholders, and runs the resulting commands. The `[default]` section always matches. If any matching command for a path exits non-zero, the final output marks that path as `failed`; otherwise it reports `passed` or `no tests found`.

For inspecting details of failed commands, run with `--verbose` to see the full command output.

```sh
cr --verbose test --changed
```

Absolute paths are not supported. Use paths relative to the selected working directory.

Examples:

```sh
cr test --changed
cr test README.md
cr test src/app.ts tests/app.test.ts
cr --cwd /path/to/project test --changed
```

To collect all possible failures, `cr test` continues running all matching commands for all selected paths, even if some commands fail. The final exit code is non-zero if any command failed.

### `cr ticket`

Manage branch-local tickets under `.coderail/tickets`.

Usage:

```sh
cr ticket <command> [options]
```

Tickets move through `open`, `active`, and `closed` states. Ticket arguments accept an ID, name, slug, or path. Use the path when a reference is ambiguous. Run `cr init` before using ticket commands.

Subcommands:

```txt
create [-d <ticket> ...] <name>                      Create an open ticket
next [--limit N]                                     List open tickets with satisfied dependencies
activate <ticket>                                    Move an open ticket to active
close [--reason <reason>] [--duplicate-of <ticket>] <ticket>
                                                      Move an active ticket to closed
deactivate [-d <ticket> ...] <ticket>                Move an active ticket back to open
reopen [-d <ticket> ...] <ticket>                    Move a closed ticket back to open
validate [<ticket> ...]                              Validate selected tickets, or all tickets
clean [--dry-run] [--prune] [--yes]                  Clean up closed tickets
```

Dependency options accept ticket IDs, names, slugs, or paths and store resolved IDs in the ticket file. `next`, `activate`, and `close --reason done` require dependencies to be satisfied. A dependency is satisfied when it is closed as `done`, or when it is a duplicate whose original is satisfied.

Close reasons:

```txt
done       Work completed; default.
duplicate  Duplicate of another ticket; requires --duplicate-of.
deferred   Valid work, intentionally postponed.
dismissed  No longer needed.
```

`cr ticket clean` requires no active tickets. By default it removes closed tickets completed as `done`, plus duplicate tickets whose original is completed, if any open ticket depends on them, these dependecies are removed from open ticket. Use `--dry-run` to preview. Use `--prune` to remove all closed tickets and open tickets depending on unsatisfied closed tickets.

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
cr ticket clean --dry-run
```

## Inspirations

Big thanks belong to Matt Pocock, and his `skills` project, which helped shape the idea that agents behave better when they are given explicit, reusable skills and operational rails instead of giant one-off prompts.

* https://github.com/mattpocock/skills

And project of multica-ai with their Andrej Karpathy inspired CLAUDE.md, which was source for `AGENTS.md` instruction file in this project.

* https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md

Coderail is not a fork of those projects, but some included instruction markdown files were reused or inspired by them.

## License

`AGPL-3.0-or-later`
