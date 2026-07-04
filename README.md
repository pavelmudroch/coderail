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

## Initialize a Repository

Inside a project repository:

```sh
cr init
```

This creates the repo-local Coderail directory:

```txt
.coderail/
  coderail.ini
  test.map
  tickets/
    open/
    active/
    closed/
```

The `.coderail` directory should be committed if you want agents and collaborators to use the same rails.

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

Example:

```sh
cr test net/tcp/client.ts
```

With the map above, Coderail may run:

```sh
biome format net/tcp/client.ts
biome check net/tcp/client.ts
deno test tests/net/tcp.test.ts
```

The agent does not need to know that `net/tcp/client.ts` is validated by `tests/net/tcp.test.ts`, if
is intended to run deno/bun/node or whatever environment.

This is the whole point, do not polute agent context with project-specific trivia. Let Coderail handle it.

## Validation

Run validation for specific files:

```sh
cr test path/to/file.ts
```

Run validation for changed files:

```sh
cr test --changed
```

Show the validation plan without executing it:

```sh
cr test path/to/file.ts --plan
```

Agents should normally use:

```sh
cr test --changed
```
or

```sh
cr test <path-to-file>
```

before finishing work.

## Agent Tool Installation

Coderail can install tool-specific instructions, skills, and agent guidance.

Example:

```sh
cr install codex
```

Remove installed instructions:

```sh
cr uninstall codex
```

Supported tools may include:

```txt
codex
claude
copilot
```

Exact support depends on the current Coderail version.

## Ticket Lifecycle

Coderail tickets are simple Markdown files under:

```txt
.coderail/tickets/open/
.coderail/tickets/active/
.coderail/tickets/closed/
```

Ticket statuses are intentionally limited:

```txt
open
active
closed
```

Lifecycle:

```txt
open   → active  via cr ticket activate
active → closed  via cr ticket close
closed → open    via cr ticket reopen
active → open    via cr ticket block
```

Agents and users should not manually move ticket files between directories. Use the `cr ticket` commands so frontmatter and file locations stay consistent.

## Create a Ticket

```sh
cr ticket create "Add test map parser"
```

This creates a new ticket in:

```txt
.coderail/tickets/open/
```

Example filename:

```txt
0007-add-test-map-parser.md
```

Ticket IDs are branch-local human-friendly numbers.

## Activate a Ticket

```sh
cr ticket activate 0007
```

This moves the ticket from `open` to `active`.

Activation should fail if dependencies are not satisfied.

## Close a Ticket

```sh
cr ticket close 0007 --reason=done --note="Implemented parser and validated with cr test --changed."
```

Closed tickets require a machine-readable close reason.

Allowed close reasons:

```txt
done
deferred
dismissed
duplicate
```

Meaning:

```txt
done       Work was completed.
deferred   Work is valid but intentionally postponed.
dismissed  Work is no longer needed.
duplicate  Work is covered by another ticket.
```

Duplicate tickets must reference the ticket they duplicate:

```sh
cr ticket close 0008 --reason=duplicate --duplicate-of=0004 --note="Covered by broader validation-map ticket."
```

A duplicate ticket without `--duplicate-of` is invalid.

## Reopen a Ticket

```sh
cr ticket reopen 0007
```

Optionally add a dependency while reopening:

```sh
cr ticket reopen 0007 --depends-on=0011
```

Reopening moves a closed ticket back to `open`.

## Block an Active Ticket

Sometimes an agent starts work and discovers prerequisite work is needed first.

Example:

```txt
The agent starts implementing reconnect handling,
but discovers there are no validation tests yet.
```

The correct workflow is not to fake-close the original ticket.

Instead:

```sh
cr ticket create "Add reconnect validation tests"
# created 0011

cr ticket block 0010 --depends-on=0011 --note="Reconnect implementation needs validation tests first."
```

This moves the active ticket back to `open`, adds the dependency, and records why it was blocked.

Then the agent can work on the prerequisite ticket:

```sh
cr ticket activate 0011
# implement tests
cr test --changed
cr ticket close 0011 --reason=done --note="Added reconnect validation tests."
```

Then return to the original ticket:

```sh
cr ticket activate 0010
# implement original work
cr test --changed
cr ticket close 0010 --reason=done --note="Implemented reconnect handling."
```

This keeps the distinction clear:

```txt
blocked  = still valid, waiting for dependency
deferred = intentionally removed from current queue
```

## Dependencies

Tickets may depend on other tickets.

Example frontmatter:

```yaml
depends_on:
  - 0004
  - 0007
```

Dependency satisfaction rules:

```txt
open dependency                         → not satisfied
active dependency                       → not satisfied
closed with reason done                 → satisfied
closed duplicate resolving to done      → satisfied
closed with reason deferred             → not satisfied
closed with reason dismissed            → not satisfied
missing dependency                      → invalid
```

Duplicate resolution:

```txt
0008 duplicate_of 0004
0004 done
→ dependency on 0008 is satisfied
```

```txt
0008 duplicate_of 0004
0004 deferred
→ dependency on 0008 is not satisfied
```

## Find the Next Ticket

```sh
cr ticket next
```

Shows open tickets whose dependencies are satisfied.

This helps both humans and future automation pick the next safe work item.

## Validate Ticket Files

```sh
cr ticket validate
```

Validates ticket file structure and lifecycle consistency.

It should check things like:

```txt
filename format
frontmatter fields
status matches directory
id matches filename
title exists
dependencies exist
duplicate tickets have duplicate_of
closed tickets have valid close reason
```

## Clean Ticket Scaffolding

Before merging a branch, clean temporary ticket scaffolding:

```sh
cr ticket clean
```

This is branch cleanup, not permanent archival.

The goal:

```txt
I consider this branch state acceptable.
Clean completed scaffolding.
Remove satisfied dependency noise.
Show what remains.
```

Default behavior:

```txt
refuse if active tickets exist
delete closed tickets with reason done
delete closed duplicate tickets only if they resolve to done
remove satisfied dependencies from open tickets
keep open tickets blocked by deferred/dismissed dependencies
print a summary
```

Useful flags:

```sh
cr ticket clean --dry-run
cr ticket clean --yes
cr ticket clean --prune
```

Flag meanings:

```txt
--dry-run       Print planned changes, modify nothing.
--yes           Do not prompt for confirmation.
--prune         Remove all closed tickets, no matter the reason, and also remove open tickets blocked by any of removed closed tickets, so they cannot be activated ever.
```

## Inspirations

Big thanks belong to Matt Pocock, and his `skills` project, which helped shape the idea that agents behave better when they are given explicit, reusable skills and operational rails instead of giant one-off prompts.

* https://github.com/mattpocock/skills

And project of multica-ai with their Andrej Karpathy inspired CLAUDE.md, which was source for `AGENTS.md` instruction file in this project.

* https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md

Coderail is not a fork of those projects, but some included instruction markdown files were reused or inspired by them.

## License

`AGPL-3.0-or-later`
