# Coderail project summary

## Core idea

Project name: `coderail`

CLI command: `cr`

Purpose: a lightweight rail system for agentic coding workflows across tools like Codex, Claude Code, Copilot, and similar CLI coding agents.

Coderail is not meant to be a full project-management or issue-tracking system. It is a repo-local context and workflow helper that gives agents consistent rules, files, and commands for:

- converting a big task/problem into a plan
- converting plan into PRD
- slicing PRD into tickets
- picking and activating tickets
- working one ticket at a time (later on multiple active tickets)
- running repo-specific checks/tests
- closing/reopening tickets
- installing unified instructions/skills for different agent tools

The goal is to simplify and unify agentic coding approaches across tools while keeping the repo context small and predictable.

---

## Architecture

There are two layers:

### 1. Global Coderail install

Installed under the user’s home directory:

~/.coderail/
  bin/
    cr
  lib/
    <shell scripts>
    ...
  instructions/
    AGENTS.md
    skills/
      <skills instructions files>
      ...
    agents/
      <agent-specific instruction files>
      ...
  templates/
    config/
      <template configuration files>
      ...
  VERSION
  LICENSE

A symlink is created:

~/.local/bin/cr -> ~/.coderail/bin/cr

Or other user-specific bin directory included in PATH, available for writing without sudo`.

Use cr as the primary command. coderail may exist as an optional alias, but cr is preferred because it is short and shell-friendly.

### 2. Repo-local Coderail state

Created by:

cr init

Repo structure:

repo/
  .coderail/
    config
    PRD.md              # optional/current plan only
    tickets/            # should be created
      open/
      active/
      closed/

The repo-local .coderail/ should contain only project state, config, current PRD/context, and tickets. It should not contain copied script behavior.

Installer design

The repo should contain a main INSTALL shell script.

Install command:

curl -fsSL https://raw.githubusercontent.com/<owner>/coderail/main/INSTALL | sh

The installer should normally download a GitHub Release tarball, not raw main.

Preferred release assets:

coderail.tar.gz
coderail.tar.gz.sha256

Latest release URL:

https://github.com/<owner>/coderail/releases/latest/download/coderail.tar.gz

Pinned version URL:

https://github.com/<owner>/coderail/releases/v0.1.0/download/coderail.tar.gz

Installer should support environment variables:

CODERAIL_VERSION
CODERAIL_HOME
CODERAIL_BIN_DIR
CODERAIL_OWNER
CODERAIL_REPO

Suggested install flow:

Build/release design

Repo should have:

coderail/
  INSTALL
  build.sh
  test.sh
  bin/
    cr
  lib/
     <shell scripts>
     ...
  instructions/
    AGENTS.md
    skills/
      <skills instructions files>
      ...
    agents/
      <agent-specific instruction files>
      ...
  templates/
    config/
      <template configuration files>
      ...
  LICENSE

build.sh should create:

dist/
  coderail.tar.gz
  coderail.tar.gz.sha256

Those files are attached to GitHub tagged releases.

Shell structure notes

Variables can be shared between shell scripts by sourcing:

. "$root_dir/lib/config.sh"

Use POSIX dot syntax instead of Bash-only source.

Executing a script does not import its variables:

./config.sh   # child process, variables disappear

Sourcing does:

. ./config.sh

Do not source repo-local user-editable config unless intentionally allowing arbitrary shell execution. For repo config, parse a simple key/value format instead.

Main commands

Global/system commands:

cr init
cr upgrade
cr uninstall

Agent instruction commands:

cr agent install codex
cr agent install claude-code
cr agent install copilot
cr agent clean codex
cr agent list

Ticket commands:

cr ticket create <ticket-title>
cr ticket next [--limit N]
cr ticket activate <path | title | id>
cr ticket close <path | title | id> --reason done
cr ticket reopen <path | title | id>
cr ticket validate

Execution commands:

cr check
cr test

Ticket directory model

Keep it minimal:

.coderail/
  tickets/
    open/
    active/
    closed/

Only three statuses:

open
active
closed

No blocked, deferred, dismissed directories.

closed means “do not pick again”, not necessarily “successfully implemented”.

If nuance is needed, use close_reason in frontmatter:

close_reason: done

Possible close reasons:

done
dismissed
duplicate
deferred

Ticket lifecycle

Basic lifecycle:

open -> active -> closed

Optional:

active -> closed -> open
closed -> open

The agent must not manually move ticket files or edit lifecycle fields.

Agents should use commands like:

cr ticket activate <path | title | id>
cr ticket close <path | title | id> --reason done

Scripts own lifecycle transitions.

Agent may edit ticket body, notes, checklist, and implementation log.

Ticket selection

Default rule:

Command `cr ticket next` prints all open tickets with satisfied dependencies, sorted from lowest numeric ID to highest.
Optionally output can be limited with `--limit N`.

`cr ticket next --limit 1` prints only the single next ticket.

### Ticket filenames and IDs

Filename format:

<id>-<slug>.md

Example:

0001-add-config-parser.md

Interpret as:

id: 0001
slug: add-config-parser
title: first H1 in markdown

Do not treat slug as canonical title. Slug is filesystem-safe context only.

Recommended regex:

^([0-9]{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$

Use 4 digits by default:

0001..9999

But allow more digits:

10000
10001

Create next ID by scanning all ticket directories:

open + active + closed

Parse numeric IDs, pick max + 1, then:

String(nextId).padStart(4, "0")

Never reuse IDs.

Sort tickets by numeric ID, not lexicographic filename, so 10000 comes after 9999.

Ticket frontmatter

Minimal open ticket:

```md
---
id: 0001
status: open
created_at: 2026-05-31T10:00:00+02:00
updated_at: 2026-05-31T10:00:00+02:00
---

# Add config parser

Final structure will be determined later.
```

Closed ticket:

status: closed
close_reason: done

close_reason should exist only when status: closed.

On reopen:

move from closed/ to open/
set status: open
remove close_reason

Do not keep:

close_reason: null

Absence means “not closed”.

Ticket command output

cr ticket next should print the full relative paths only:

.coderail/tickets/open/0007-add-config-validator.md

Do not print only filename.

Do not print file content.

Then agent/script can do:

ticket="$(cr ticket next --limit 1)"
active_ticket="$(cr ticket activate "$ticket")"
cat "$active_ticket"

or list all available tickets and pick one based on title, content, or other preferences.

cr ticket activate <path | title | id> should return the new active path:

.coderail/tickets/active/0007-add-config-validator.md

Errors go to stderr, non-zero exit.

If no open tickets:

stderr: no open tickets
exit: 1

Do not return empty stdout with exit 0.

### PRD handling

For repo-local context, keep only one current PRD:

.coderail/PRD.md

This represents the current feature/plan.

When all tickets from a PRD are completed and a new feature begins, replace PRD.md with the new one.

Old PRDs should not remain in active context unless needed. Git history is the archive.

Closed tickets remain as lightweight completion records.

Avoid building:

.coderail/prds/open/
.coderail/prds/closed/

That turns the lightweight helper into project-management sludge.

## Agent instructions

Global instruction templates live in:

~/.coderail/current/instructions/

cr agent install <tool> copies/merges the instructions into that tool’s expected location.
All copied instruction files are updated/translated for selected tool. Skill references like <skill>skill-name</skill> are translated to /skill-name (claude, copilot) or $skill-name (codex) syntax. Custom agent definitions are changed to yaml for codex. AGENTS.md is changed to copilot-instructions.md for copilot. Etc.

Agents should call:

cr check
cr test

and cr should resolve the configured commands from configuration map files.

License

Use:

AGPL-3.0-or-later

On GitHub license picker this is:

GNU Affero General Public License v3.0

Intent:

internal/private use and modification is fine
if someone distributes modified Coderail or offers modified Coderail as a network/service product, users must be able to access the source code
it does not automatically force all code written using Coderail to become open source

Add source headers where useful:

# SPDX-License-Identifier: AGPL-3.0-or-later

README license blurb:

## License

Coderail is licensed under the GNU Affero General Public License v3.0 or later.

You may use, study, modify, and share it freely. If you distribute modified versions, or run modified versions as a network service, you must provide the corresponding source code under the same license.
Naming

## Project name:

coderail

Reason: rails for coding agents.

Command:

cr

Possible tagline:

Rails for agentic coding.

or:

A lightweight workflow rail for coding agents.

The hidden repo dir should probably be:

.coderail/

because it clearly belongs to the tool.

Design principles

Keep Coderail boring and deterministic.

Main principles:

global tool owns behavior
repo-local .coderail owns state/context
agents use cr, not manual file lifecycle changes
ticket lifecycle has only open/active/closed
one current PRD only
oldest ticket first by numeric ID
plain text command output by default
GitHub releases are real install path
main branch install only for testing

Avoid turning it into a full ticket tracker, PRD archive system, Jira clone, or tiny bureaucratic swamp.