---
name: cr
description: Extensive agent guidance for using the `cr` tool.
---

# `cr`

Use global `cr`. Run from repo root, or use `cr --cwd <repo> ...`.
Scope for agents: only `test` and ticket commands below.

## Test
- `cr test --changed` - run checks for git-changed and untracked files.
- `cr test <file> [...]` - run checks mapped for relative file paths. Absolute paths unsupported.
- Output per path: `passed`, `failed`, or `no tests found`. Use `cr -v test ...` to see failed command output.
- Requires `.coderail/test.map`; if missing, use repo-native tests instead of creating config unless asked.

## Tickets
Tickets live in `.coderail/tickets/{open,active,closed}`. Use `cr ticket ...` for lifecycle changes, not manual moves/edits.
Ticket refs accept ID (`123`/`0123`), title/slug/name, or path; use path if ambiguous.

- `cr ticket next [--limit N]` - list open tickets with satisfied dependencies.
- `cr ticket create [-d <ticket> ...] "<title>"` - create open ticket; deps stored as IDs.
- `cr ticket activate <ticket>` - open -> active; fails if deps unsatisfied.
- `cr ticket close [--reason done|duplicate|deferred|dismissed] [--duplicate-of <ticket>] <ticket>` - active -> closed; default `done`; `duplicate` requires target.
- `cr ticket deactivate [-d <ticket> ...] <ticket>` - active -> open; optional deps appended.
- `cr ticket reopen [-d <ticket> ...] <ticket>` - closed -> open; close fields removed; optional deps appended.
- `cr ticket validate [<ticket> ...]` - validate selected tickets, or all if none.

After ticket state changes, run `cr ticket validate <ticket>` when known; use `cr ticket validate` after broader ticket edits.
