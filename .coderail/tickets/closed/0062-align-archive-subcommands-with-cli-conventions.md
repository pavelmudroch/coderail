---
id: "0062"
slug: "align-archive-subcommands-with-cli-conventions"
title: "Align archive subcommands with CLI conventions"
status: "closed"
created_at: "2026-11-25T16:07:20.386Z"
updated_at: "2026-11-25T16:30:12.180Z"
dependencies: []
reason: "done"
---

# Align archive subcommands with CLI conventions

Give `cr archive` the same command layout and help format as `cr idea` and
`cr ticket`. The archive parent currently owns three command classes, and
`BrowseArchive` dispatches four different actions. The parent help already has
a local edit that adds a description and simplifies the command list. Carry
that edit forward when completing the help.

## Tasks

1. [x] Cover archive help and argument handling at the CLI entry point
2. [x] Move each archive action into its own command module
3. [x] Align archive option parsing and usage messages with neighboring commands

## Task details

### 1. Cover archive help and argument handling at the CLI entry point

Extend the existing archive command tests. Exercise `cr archive` and each of
`preview`, `apply`, `list`, `plans`, `tickets`, and `read` through `src/main.ts`.
Check both help aliases without positionals or project initialization. Check
that missing and unknown subcommands print parent usage and invalid leaf
arguments print that leaf's usage.

Verify that `--json` before and after the subcommand still produces structured
output on the applicable actions. Keep the existing byte-for-byte assertion
for `read`, including its existing acceptance of `--json` with raw output.
Use the existing temporary Git fixtures for execution checks.

### 2. Move each archive action into its own command module

Create `src/commands/archive/{preview,apply,list,plans,tickets,read}.ts` with
one `Command` implementation per file. Keep `src/commands/archive.ts` focused
on parent parsing, usage, and dispatch, following `idea.ts` and `ticket.ts`.
Replace the mode switch in `BrowseArchive` with direct dispatch. Keep shared
argument parsing and listing output in archive command helpers where reused.
Keep archive selection, history reads, recording, and rollback in `src/archive/`.

Update test imports and mirror the command directory for leaf-specific tests,
keeping parent dispatch and workflows spanning several actions in the parent
test file. Verify that preview and apply retain their initialization and
working-directory behavior, that browsing still works from nested directories,
and that apply still uses the existing confirmation and recovery paths.

### 3. Align archive option parsing and usage messages with neighboring commands

Follow the parent parser conventions in `idea.ts` and `ticket.ts` for help,
forwarded `--json`, `--`, and invalid option values. Use the idea leaf parser
and the template delete command as references for boolean options, end of
options, and positional validation. Keep the subcommand required, preserve
`apply --yes` and its two positionals, and require one batch ID for `plans`
and `tickets` and one batch-relative file path for `read`.

Use the shared help layout with a synopsis, a description, an `Options`
section, and `Commands` or `Arguments` where applicable. Document `--json`
for structured results and clarify that `read` writes archived bytes even
when the parent forwards that flag. Describe `--yes` on `apply` and the
positional arguments on each leaf that takes them. Check the seven help
screens and run the archive command and domain tests.

## References

- [Archive parent and current leaf implementations](../../../src/commands/archive.ts)
- [Idea parent command](../../../src/commands/idea.ts)
- [Ticket parent command](../../../src/commands/ticket.ts)
- [Idea argument parser](../../../src/commands/idea/helpers/parse-arguments.ts)
- [Template delete command](../../../src/commands/template/delete.ts)
- [Archive command tests](../../../tests/commands/archive.test.ts)
- [Archive domain tests](../../../tests/archive/)
- [Original archive workflow](../../plans/retained-history-for-ideas-and-tickets/IDEA.md)
