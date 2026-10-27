---
title: Execute install and uninstall commands with lazy harness selection
status: closed
depends-on: 0007
reason: done
duplicate-of: 
---

# Execute install and uninstall commands with lazy harness selection

Connect the completed shared operations to CLI selection, lazy connector lifetime,
reporting, and aggregate exit behavior. Depends transitively on the connector
contract and all operations tickets; native mappings remain separate work.

## Tasks

1. [x] Add command execution, lazy selection, and exit behavior tests
2. [x] Expose supported names and construct selected connectors lazily
3. [x] Wire argument validation, operations, reporting, and cancellation
4. [x] Run command and integration checks

## Task details

### 1. Add command execution, lazy selection, and exit behavior tests

Scope: replace command placeholders/stale usage expectations in
`tests/commands/install.test.ts` and `tests/commands/uninstall.test.ts`; add harness
behavior tests and affected `tests/main.test.ts` coverage as needed. Use existing
facade/Log stubbing with restoration in `finally`.

Expected outcome:

- Cover help, `--`, aliases, boolean-value rejection, `--no`/`-n`, force required
  for yes/no, mutual exclusion, and `requiresInit = false`. Preserve usage syntax
  `[--force [--yes | --no]]`.
- Cover configured default, missing/unknown defaults and explicit names,
  deduplication preserving first order, and validation of all selections before
  any connector construction or mutation.
- Verify import/help/name enumeration never constructs connectors. A selected
  constructor/home-resolution failure does not prevent other valid harnesses from
  running; every constructed connector is disposed, including failure paths.
- Cover `uninstall --self` rejecting explicit harnesses, otherwise reporting not
  implemented without resolving a default or changing files.
- Verify install passes `join(context.installRoot, 'assets', 'instructions')`;
  uninstall needs no bundle. Options carry command configuration noninteractive
  policy and signal, without relying on `Log.nonInteractive` initialization.
- Cover successes, affected paths for skips/failures, no tracked-file no-op,
  completed outcomes on failure, persistence-error reporting, and mixed selections.
  Declines succeed; ordinary failures aggregate after later selections run.
- Cover cancellation stopping further selections and propagating through existing
  main behavior: usage exits 2, failure 1, cancellation 3.

Validation: fake connectors/operation results isolate command behavior; retain
real shared-operation coverage from prerequisites and do not require native mappings.

### 2. Expose supported names and construct selected connectors lazily

Scope: update `src/harness.ts` and affected facade consumers required by these
commands, matching existing conventions and preserving facade access where needed.

Expected outcome:

- Enumerate supported names independently of connector instances for usage and
  selection validation. Replace eager construction with lazy construction.
- Resolve only the selected connector inside its own harness attempt; constructor
  and home-resolution failures stay local to that attempt.
- Dispose constructed connectors using their existing `Disposable` contract.
  Do not repair unwired incomplete `src/harness/get.ts` or `list.ts` helpers.

Validation: lazy import/help, compatibility, selection, and disposal behavior tests
pass. Add no connector base class or native home/default/mapping implementation.

### 3. Wire argument validation, operations, reporting, and cancellation

Scope: complete `src/commands/install.ts` and `src/commands/uninstall.ts`,
preserving existing user-owned work and the existing `src/main.ts` exit mappings.

Expected outcome:

- Add no/force/yes validation while preserving help handling, separator behavior,
  boolean-option rejection, `--self` rules, and `requiresInit = false`.
- Use `Cli.raiseUsageError` for invalid arguments/selections; choose the configured
  default only when no names are supplied and deduplicate in first-selection order.
  Validate all names before constructing any connector or changing files.
- Invoke shared operations once per selected harness with explicit options and
  runtime-root bundle resolution for install. Each attempt owns connector lifetime.
- Report ordered successes, skips, no-ops, and failures through `Log`, including
  harness/path context and completed outcomes. Continue after ordinary failures
  and throw a summary error after reporting all results if any harness failed.
- Let declines succeed; propagate cancellation immediately to stop later attempts.
  Do not call `Deno.exit` in commands/operations or add rollback claims.

Validation: command tests pass for isolated and mixed outcomes. Native placeholders
fail clearly until their sibling implementation is available.

### 4. Run command and integration checks

Scope: run all required checks, including every changed nested source/test path:

```sh
cr test ./src/commands/install.ts ./src/commands/uninstall.ts
cr test ./src/harness.ts ./src/instruction-operations.ts ./src/instruction-operations
cr test ./tests/commands/install.test.ts ./tests/commands/uninstall.test.ts
cr test ./tests/instruction-operations
```

Also run explicit harness behavior tests added for lazy selection and affected
main tests (including `cr test ./tests/main.test.ts` when changed).

Expected outcome: applicable lint, format, behavior, coverage, mutation, and exit
behavior checks pass; facade-only checks do not substitute for behavior tests.

Validation: no test-map change, executable install/uninstall support, native
connector work, `Path.isWithin` repair, or unrelated cleanup. Preserve user-owned
`src/path.ts` changes.

## References

- [Operations specification](../../plans/installation-and-uninstallation-commands/install-and-uninstall-operations/SPEC.md)
- [Reinstall completion prerequisite](0007-remove-obsolete-tracked-instructions-during-reinstall.md)
- [Common connector contract](../../plans/installation-and-uninstallation-commands/common-harness-connector/SPEC.md)
- [Harness facade](../../../src/harness.ts)
- [Install command](../../../src/commands/install.ts)
- [Uninstall command](../../../src/commands/uninstall.ts)
- [Runtime context](../../../src/runtime/context.ts)
- [Command configuration](../../../src/conf/configuration.ts)
- [Main exit behavior](../../../src/main.ts)
- [Test map](../../test_map)
