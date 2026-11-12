---
id: "0048"
slug: "manage-installation-templates-through-the-cli"
title: "Manage installation templates through the CLI"
status: "closed"
created_at: "2026-11-12T13:49:26.179Z"
updated_at: "2026-11-12T14:16:20.975Z"
dependencies:
  - "0047"
reason: "done"
---

# Manage installation templates through the CLI

Deliver usable template listing, inspection, creation, and confirmed deletion through the existing commands. Depends on 0047 for shared metadata parse/stringify facilities.

## Tasks

1. [x] Specify catalog and management command behavior in tests
2. [x] Implement the installation template catalog and facade
3. [x] Implement management command parsing, confirmation, and output

## Task details

### 1. Specify catalog and management command behavior in tests

Scope: new `tests/templates/catalog.test.ts`, `tests/commands/template.test.ts`, and `tests/commands/template/{create,delete}.test.ts`.

Expected outcome: isolated installation-root fixtures cover sorted listing, exact lookup, required layout, missing storage, invalid names, creation, metadata escaping/defaults, existing-directory protection, deletion decisions, help/routing, reserved names after `--`, and all output modes.

Validation: assert JSON arrays of `{ name, description, path }` for every operation, absolute one-per-line path output, conflicting output flags rejected, unknown names fail, and no removal before confirmation. Establish failures before implementation; run each modified test file's required verification when implementation is complete.

### 2. Implement the installation template catalog and facade

Scope: new `src/templates/catalog.ts` and `src/templates.ts`.

Expected outcome:

- Expose the agreed `list/get/create/delete` operations and `TemplateInfo`, with AbortSignal support and no prompts inside the catalog.
- Resolve only `<installRoot>/templates/<name>` in compiled and source development modes. Reject empty names, traversal, absolute paths, and path separators; follow repository path-boundary conventions.
- Require extensionless `template` metadata, `config`, and `assets/`; empty config/assets are valid. Parse metadata in the existing custom syntax with description defaulting to an empty string and its own schema. Startup is optional.
- List alphabetically; absent template storage lists empty; exact unknown names and invalid layouts fail with context.
- Create assets/config/metadata with escaped optional description and no startup file; fail without modifying an existing directory. Delete the named directory recursively and return its former absolute path.

Validation: task 1 catalog fixtures pass, including descriptions containing quotes, backslashes, and line breaks, malformed metadata/layout, and cancellation. Run per-file source verification.

### 3. Implement management command parsing, confirmation, and output

Scope: `src/commands/template.ts`, `src/commands/template/create.ts`, and `src/commands/template/delete.ts`; update `docs/COMMANDS.md` for these commands.

Expected outcome:

- Route create/delete and help through existing Command conventions; support literal reserved template names after `--`. Validate required/extra arguments and mutually exclusive `--json`/`--path`.
- Delegate catalog operations using runtime `installRoot`. Output consistent JSON arrays and absolute paths for listing, inspection, creation, and deletion.
- Creation supports `--description`; help documents the fixed config-format `template` metadata file and optional startup rather than a generated description/startup file.
- Deletion always confirms before removal unless `--yes`; decline succeeds with no JSON/path record and preserves all files. If a required prompt cannot run interactively, fail with guidance to use `--yes`. Do not introduce delete `--no` or require force.

Validation: task 1 command tests pass for help, dispatch, outputs, decline/accept/automatic confirmation, and noninteractive failure without mutation. Run `cr verify` for each modified source/test file and resolve all failures.

## References

- [Approved template behavior](../../plans/templates/IDEA.md)
- [Agreed module boundaries and public interfaces](../../plans/templates/DESIGN.md)
- [Per-file verification requirements](../../../AGENTS.md)
- Dependency: [0047 — Configuration documents](0047-preserve-and-merge-configuration-documents-for-templates.md)
- `src/commands/template.ts`, `src/commands/template/create.ts`, `src/commands/template/delete.ts`
- `src/runtime/context.ts`, `src/commands/install.ts`, `src/commands/uninstall.ts`, `docs/COMMANDS.md`

## Implementation validation

- Added installation catalog and management command fixtures covering all task criteria,
  including cancellation during creation and plain machine output.
- Passed separate `cr verify` invocations for all five changed source files and
  all five corresponding test files, with 100% source coverage.
- Passed final aggregate `cr verify -s` for those ten files.
- Confirmed CLI help dispatch, JSON parsing without ANSI bytes, and empty path
  output through the source CLI entry point. `git diff --check` passed.
