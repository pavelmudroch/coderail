---
id: "0012"
slug: "support-project-local-harness-instruction-installation"
title: "Support project-local harness instruction installation"
status: "closed"
created_at: "2026-11-04T13:11:45.027Z"
updated_at: "2026-11-04T13:22:44.839Z"
dependencies: []
reason: "done"
---

# Support project-local harness instruction installation

Add `cr install --local` and `cr uninstall --local` for the nearest initialized
project, with connector-owned destinations and manifests isolated by scope and
harness. Preserve default global behavior and remove `uninstall --self` entirely.
This is one implementation unit with no prerequisite tickets.

## Tasks

1. [x] Add command parsing and local project selection tests
2. [x] Add connector target and installation isolation tests
3. [x] Add local install/uninstall lifecycle tests
4. [x] Bind connector construction and translation to installation targets
5. [x] Wire local command execution and remove self-uninstallation
6. [x] Verify every modified source and test file

## Task details

### 1. Add command parsing and local project selection tests

Scope: `tests/commands/install.test.ts`, `tests/commands/uninstall.test.ts`, and
`tests/runtime/context.test.ts` where needed to exercise existing root discovery.
Extend command fixtures to supply initialized project contexts and observe the
target passed to the harness factory.

Expected outcome:

- Both commands accept valueless `--local`, reject `--local=<value>`, and include
  the option in usage and help with correctly spelled descriptions.
- Explicit and configured default harness selection work in both scopes;
  existing unknown/missing harness and force/confirmation validation remains covered.
- Local invocation from a subdirectory selects the nearest ancestor containing
  a `.coderail` directory. Global `--cwd` changes the discovery starting point.
- Local operations outside an initialized project fail with `cr init` guidance
  before connector construction, translation, or filesystem mutation; global
  operations and help remain available without initialization.
- Replace tests accepting `--self` with assertions that `--self` and
  `--self=<value>` are unknown options. Usage/help omit `--self`.

Validation: focused tests distinguish global and local arguments, cover nested
initialized projects and `--cwd`, and assert no destination or manifest is created
on local project validation failure. New behavior tests should fail until implemented.

### 2. Add connector target and installation isolation tests

Scope: `tests/harness.test.ts`, `tests/harness/codex.test.ts`, and
`tests/harness/claude.test.ts`. Replace placeholder/getter expectations affected by
the target-aware contract and update command factory stubs as needed.

Expected outcome:

- `Harness.get(name, target)` creates a fresh connector of the selected type,
  passes its global or local target to the constructor, and returns `null` for
  unknown names. Named `Harness.codex` and `Harness.claude` access is removed.
- Each connector uses the same immutable target for its home and all translations;
  local targets carry the resolved absolute project root.
- Homes and translated paths follow the native harness layout while keeping
  `.coderail-install` separate for global/local scopes and Codex/Claude.
- Translation outputs stay relative to the selected home and retain the existing
  caller-owned input/bytes contract and explicit rejection of unsupported assets.

Validation: exercise both concrete connectors in both scopes, distinct local
project roots, target stability after construction, and distinct manifest paths.
Help/name enumeration must still work without resolving connector homes.

### 3. Add local install/uninstall lifecycle tests

Scope: lifecycle fixtures in `tests/commands/install.test.ts` and
`tests/commands/uninstall.test.ts`. Use temporary initialized projects and isolated
global homes; exercise the two commands against the same destinations/manifests.

Expected outcome:

- A local install writes translated instructions and checksum/size manifest
  entries; subsequent uninstall removes tracked unchanged files and its exhausted
  manifest while retaining unrelated files.
- Modified files retain existing protection, `--force`, `--yes`, `--no`, and
  interactive confirmation behavior for both local operations; skipped files
  remain tracked. Existing missing-file and partial-operation handling remains intact.
- Local and global installs can coexist for one harness; uninstalling either
  leaves the other installation and manifest intact.
- Codex and Claude local installations coexist in one project; uninstalling one
  leaves the other's instructions and manifest intact.

Validation: assert file bytes and manifest contents before/after round trips,
modified-file refusal and confirmation outcomes, and all scope/harness isolation
cases. Retain existing global regression coverage and shared path safety tests.

### 4. Bind connector construction and translation to installation targets

Scope: `src/harness.ts`, `src/harness/connector.ts`, `src/harness/codex.ts`, and
`src/harness/claude.ts`.

Expected outcome:

- Define an explicit global/local target contract, with the resolved project root
  required for local scope. Bind an immutable target in each connector constructor.
- Change the factory to `Harness.get(name, target)` and construct connectors
  directly. Remove named getters from both the facade and its interface, updating
  all callers and tests to use the factory.
- Implement the scope-dependent homes, instruction locations, and translated
  content needed by the operations. Choose native connector layouts within the
  plan's constraints; homes must permit the existing shared file operations to
  isolate manifests across scopes and harnesses.
- Keep shared discovery, installation/removal, path validation, and manifest
  handling outside connectors; do not introduce parallel scope-specific engines.

Validation: task 2 tests pass with concrete connectors and all removed getter
references are gone. Command fixture factories accept and use the target contract.

### 5. Wire local command execution and remove self-uninstallation

Scope: `src/commands/install.ts` and `src/commands/uninstall.ts`; reuse
`src/runtime/context.ts` discovery rather than introducing a second root search.

Expected outcome:

- Parse/default the local flag and update usage/help in both commands.
- For local execution, require the context's discovered project root and fail
  with initialization guidance before work begins if absent. Keep unconditional
  `requiresInit` disabled so global operations remain usable anywhere.
- Build the appropriate target once and pass it through every explicit/default
  harness factory call. Use connector homes with the existing shared mutation
  and manifest code.
- Remove the `self` argument state, option parsing and validation, execution branch,
  usage references, and associated obsolete tests; reject it through the normal
  unknown-option path.
- Outside connectors, confine changes to parsing/help, local validation, target
  propagation, getter removal, and relevant tests. Tool uninstallation and unrelated
  lifecycle refactors are outside scope.

Validation: tasks 1 and 3 pass; global behavior, force/confirmation semantics,
manifest persistence, and path protections remain covered by existing tests.

### 6. Verify every modified source and test file

Scope: all source/test files actually changed during this ticket, including any
additional callers required by the factory signature change.

Expected outcome: complete the per-file verification required by `AGENTS.md`
after modifications, fixing failures and repeating affected verification until it
passes. Do not treat currently modified working-tree files as already implemented.

Validation:

- Run `cr verify ./src/<path-to-file>.ts` for each modified source file.
- Run `cr verify ./tests/<path-to-file>.test.ts` for each modified test file.
- Record passing checks and ensure all acceptance cases above have executable
  coverage, including concrete connector layout and command lifecycle behavior.

## References

- [Approved idea](../../plans/local-harness-instruction-installation/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [Harness facade](../../../src/harness.ts)
- [Connector contract](../../../src/harness/connector.ts)
- [Codex connector](../../../src/harness/codex.ts)
- [Claude connector](../../../src/harness/claude.ts)
- [Install command](../../../src/commands/install.ts)
- [Uninstall command](../../../src/commands/uninstall.ts)
- [Runtime project discovery](../../../src/runtime/context.ts)
- [Shared install manifest](../../../src/install-manifest.ts)
- [Harness tests](../../../tests/harness.test.ts)
- [Codex tests](../../../tests/harness/codex.test.ts)
- [Claude tests](../../../tests/harness/claude.test.ts)
- [Install tests](../../../tests/commands/install.test.ts)
- [Uninstall tests](../../../tests/commands/uninstall.test.ts)
- [Runtime context tests](../../../tests/runtime/context.test.ts)

## Implementation notes

- Codex uses the project root locally and the user home globally, allowing native
  `.agents/skills` paths and `AGENTS.md` / `.codex/AGENTS.md` instructions without
  translations escaping the installation home. Claude uses `.claude` in either
  scope. Each home owns its `.coderail-install` manifest.
- Connectors snapshot their target and home at construction and copy translated
  bytes. Empty skills reject explicitly. Codex Markdown subagents remain an
  explicitly rejected asset type; Claude copies Markdown agents into `agents`.
- Lifecycle tests use temporary instruction bundles and isolated user homes.
  Existing source assets do not contain `instructions/AGENTS.md`; repairing that
  distribution input is outside this ticket's source/test scope.

## Verification

Passed individual `cr verify <file>` runs for all six modified source files and
all five modified test files. The focused suites contain 63 passing tests; source
files with executable code meet the configured 100% coverage thresholds. Test-file
verification also ran the configured mutation checks (no surviving mutations;
generated mutations were rejected by type checking).

Passed final `cr verify -s` with exactly:

- `./src/commands/install.ts`
- `./src/commands/uninstall.ts`
- `./src/harness.ts`
- `./src/harness/connector.ts`
- `./src/harness/codex.ts`
- `./src/harness/claude.ts`
- `./tests/commands/install.test.ts`
- `./tests/commands/uninstall.test.ts`
- `./tests/harness.test.ts`
- `./tests/harness/codex.test.ts`
- `./tests/harness/claude.test.ts`

`git diff --check` passed. Existing settings/configuration edits were preserved
and excluded from verification. No commit was created.
