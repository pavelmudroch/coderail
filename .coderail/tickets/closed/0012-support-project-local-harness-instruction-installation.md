---
id: '0012'
slug: 'support-project-local-harness-instruction-installation'
title: 'Support project-local harness instruction installation'
status: 'closed'
created_at: '2026-11-04T13:11:45.027Z'
updated_at: '2026-11-04T13:22:44.839Z'
dependencies: []
reason: 'done'
---

# Support project-local harness instruction installation

Add `cr install --local` and `cr uninstall --local` for the nearest initialized
project, passing an explicit global/local target through the harness factory.
Preserve default command behavior and remove `uninstall --self` entirely.
Connector constructors accept the target, but their home, manifest, and translation
methods remain unimplemented stubs. Concrete layouts, translation behavior, and
installation isolation are deferred. This is one implementation unit with no
prerequisite tickets.

## Tasks

1. [x] Add command parsing and local project selection tests
2. [x] Update target-aware factory tests and retain connector stubs
3. [x] Extend command lifecycle fixtures for local operations
4. [x] Pass installation targets to connector constructor stubs
5. [x] Wire local command execution and remove self-uninstallation
6. [x] Verify the final source and test state

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

### 2. Update target-aware factory tests and retain connector stubs

Scope: `tests/harness.test.ts` and command factory fixtures.

Expected outcome:

- `Harness.get(name, target)` creates a fresh connector of the selected type,
  passes its global or local target to the constructor, and returns `null` for
  unknown names. Named `Harness.codex` and `Harness.claude` access is removed.
- Help/name enumeration works without resolving connector homes.
- Concrete connector layout, target persistence, translation, and manifest
  isolation tests are deferred until the connector methods are implemented.

Validation: cover factory selection, fresh instances, unknown names, and help.
The current local-home assertions in `tests/harness.test.ts` require implemented
connectors and do not match the retained stubs; they remain unresolved.

### 3. Extend command lifecycle fixtures for local operations

Scope: fixtures in `tests/commands/install.test.ts` and
`tests/commands/uninstall.test.ts`.

Expected outcome:

- Use stub harnesses and initialized project contexts to exercise local command
  parsing, target propagation, and existing force/confirmation behavior.
- Retain shared manifest, modified-file protection, and path safety coverage.
- Defer concrete local/global and cross-harness installation isolation until
  connector homes and translations are implemented.

Validation: command fixtures can exercise shared operations independently of the
concrete connectors. The current concrete round-trip test in
`tests/commands/install.test.ts` requires implemented connectors and remains
unresolved with the retained stubs.

### 4. Pass installation targets to connector constructor stubs

Scope: `src/harness.ts`, `src/harness/connector.ts`, `src/harness/codex.ts`, and
`src/harness/claude.ts`.

Expected outcome:

- Define an explicit global/local target contract, with the resolved project root
  required for local scope.
- Change the factory to `Harness.get(name, target)` and construct connectors
  directly. Remove named getters from both the facade and its interface, updating
  callers to pass the target.
- Add constructor signatures accepting `InstallationTarget` to both connectors.
  Constructors remain empty and do not retain or use the target.
- Keep `home` and `manifestPath` getters as throwing stubs. Keep
  `translateSkill`, `translateGlobalInstructions`, and `translateSubagent` as
  rejected-promise stubs. Disposal remains a no-op.
- Defer native layouts, translated content, immutable target binding, and
  scope/harness manifest isolation to later connector implementation.

Validation: inspect factory target propagation and constructor signatures.
Concrete installation behavior is unavailable while these stubs remain.

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

Validation: exercise parsing, local validation, and target propagation with
command fixtures. Concrete end-to-end execution remains blocked by connector stubs.

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
  coverage. Concrete connector layout and lifecycle verification is deferred until
  implementation; existing tests that require it must be reconciled first.

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

- Codex and Claude connectors accept `InstallationTarget` but do not store it.
- Both connectors retain unimplemented `home` and `manifestPath` getters and
  translation methods. Disposal is a no-op. No native destinations, translation
  outputs, or scope/harness isolation are implemented by these connectors.
- Commands parse `--local`, require an initialized project for local operations,
  and pass the selected target to the factory. Shared file and manifest handling
  remains in place for use once concrete connectors are implemented.
- Tests asserting concrete local homes and a concrete install/uninstall round
  trip currently exceed the stub implementation and remain unresolved.

## Verification

Verified. Connector methods are just stubs.
