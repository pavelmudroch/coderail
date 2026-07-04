# Coderail

Lightweight repo-local guide rails for coding agents.

Coderail helps coding agents work inside a repository without needing to know every project-specific convention, validation command, test runner, formatter, linter, ticket convention.

It is intentionally small.

Coderail is not a permanent issue tracker or full project management platform. It is a small set of commands to help agents safely complete work inside a branch.

## Purpose

Coderail exists to keep agents on rails while they work.

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

### `.coderail/config.ini`

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

```txt
[default] commands always run.
Other section names are glob patterns.
Commands run in file order.
Execution stops on the first non-zero exit code.
```

Placeholders:

```txt
{path}   one path; command repeats once per path
```

## Inspirations

Big thanks belong to Matt Pocock, and his `skills` project, which helped shape the idea that agents behave better when they are given explicit, reusable skills and operational rails instead of giant one-off prompts.

* https://github.com/mattpocock/skills

And project of multica-ai with their Andrej Karpathy inspired CLAUDE.md, which was source for `AGENTS.md` instruction file in this project.

* https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md

Coderail is not a fork of those projects, but some included instruction markdown files were reused or inspired by them.

## License

`AGPL-3.0-or-later`
