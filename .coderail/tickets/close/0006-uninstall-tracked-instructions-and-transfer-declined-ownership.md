---
title: Uninstall tracked instructions and transfer declined ownership
status: closed
depends-on: 0005
reason: done
duplicate-of: 
---

# Uninstall tracked instructions and transfer declined ownership

Remove only manifest-owned instructions through the shared operations facade.
Reuse 0005's containment, confirmation, outcomes, and persistence policy; add
tracked removal and narrowly scoped directory cleanup for reuse by reinstall.

## Tasks

1. [x] Add uninstall ownership, cleanup, and failure tests
2. [x] Implement tracked removal and directory cleanup
3. [x] Expose uninstall with complete manifest and failure lifecycle
4. [x] Run uninstall operation checks

## Task details

### 1. Add uninstall ownership, cleanup, and failure tests

Scope: add `tests/instruction-operations/` uninstall tests through the facade using
fake connectors and real temporary trees/manifests, following 0005's conventions.

Expected outcome:

- Cover unchanged, modified (including equal-size edits), missing leaves and
  missing ordinary ancestors; untracked files are never removed.
- Cover block-without-force, automatic yes/no, prompts/default declines, terminal
  failures, and whole-harness preflight/confirmation before mutation.
- Declined removal retains bytes but drops ownership; verified absence drops the
  entry without prompting. Report skipped and already-missing outcomes.
- Missing manifests succeed without creating home; uninstall never discovers,
  reads, or translates bundle assets. Malformed manifests and unsafe leaves,
  ancestors, root containment, or reserved entries fail closed even with force.
- Cleanup affects only ancestors of successfully deleted tracked files, deepest
  first, stops at home or nonempty parents, and preserves unrelated empty dirs.
  Keep the existing manifest during cleanup and delete an empty manifest last.
- Inject delete, cleanup, and save failures; verify stopped execution, retained
  completed outcomes, persisted completed entry drops where possible, both
  operation/persistence errors, and cancellation persistence/propagation.

Validation: inspect filesystem and manifest state after each outcome; specifically
verify ownership transfer and missing entries persist even with no byte changes.

### 2. Implement tracked removal and directory cleanup

Scope: extend internal operation code with the removal policy shared by uninstall
and later obsolete-file reconciliation; avoid a general operation framework.

Expected outcome:

- Validate every tracked path and complete conflict/answer resolution first.
  Use saved baselines, not bundled content, and process manifest entry order.
- Remove only regular files, rechecking types and containment before mutation.
  Drop entries after successful deletion, confirmation decline, or verified absence.
- Seed cleanup only from successful deletions. Recheck directory types and
  containment, remove empty ancestors deepest first, and stop before home.
- Stop a cleanup branch at nonempty directories; propagate other errors. Never
  recursively delete directories or treat access errors as absence.

Validation: force cannot bypass structure checks, declined/missing paths never
seed cleanup, and unrelated files and directories remain intact.

### 3. Expose uninstall with complete manifest and failure lifecycle

Scope: add `uninstall(connector, options)` to the interface/value facade and its
implementation, reusing 0005's result/options and baseline persistence behavior.

Expected outcome:

- Access only connector locations and the manifest, with no bundle dependency.
  A missing manifest is a successful no-op without home creation.
- Save the remaining nonempty baseline, including declined removals' ownership
  transfers and missing-file entry drops. Keep the manifest until cleanup finishes;
  remove it last when no entries remain.
- On unexpected errors, stop that harness and best-effort persist completed
  actions, retaining ordered outcomes and reporting persistence errors too.
- Check cancellation between actions, best-effort persist, then propagate it.

Validation: tests cover empty/partial manifests, no-op, failed deletion retaining
its entry, failed cleanup/save, and cancellation without claiming rollback.

### 4. Run uninstall operation checks

Scope: run `cr test ./src/instruction-operations.ts ./src/instruction-operations`
and `cr test ./tests/instruction-operations`, explicitly including changed tests.

Expected outcome: shared install behavior remains valid and applicable uninstall
lint, format, behavior, coverage, and mutation checks pass.

Validation: no test-map change, native connector implementation, command wiring,
or repair of unrelated unfinished helpers.

## References

- [Operations specification](../../plans/installation-and-uninstallation-commands/install-and-uninstall-operations/SPEC.md), especially Paths and preflight, Mutation and manifest lifecycle, and Testing Decisions
- [Install and shared policy prerequisite](0005-install-prepared-instructions-with-protected-file-ownership.md)
- [Manifest facade](../../../src/install-manifest.ts)
- [Manifest specification](../../plans/install-manifest-helper/SPEC.md)
