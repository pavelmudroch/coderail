---
title: Remove obsolete tracked instructions during reinstall
status: closed
depends-on: 0006
reason: done
duplicate-of: 
---

# Remove obsolete tracked instructions during reinstall

Complete reinstall by removing tracked files absent from the newly prepared
bundle, using 0006's removal and cleanup behavior alongside 0005's desired writes.

## Tasks

1. [x] Add reinstall reconciliation and combined preflight tests
2. [x] Integrate obsolete removals into the install plan
3. [x] Run complete shared-operation checks

## Task details

### 1. Add reinstall reconciliation and combined preflight tests

Scope: extend operation-aligned install tests under `tests/instruction-operations/`
through the facade with real manifests and deterministic fake translations.

Expected outcome:

- Unchanged obsolete files are removed without approval; modified obsolete files
  block without force and otherwise follow the same confirmation policy as uninstall.
- Declined obsolete removals retain bytes but drop ownership and report skips;
  missing obsolete files drop entries without prompts. Missing desired files are
  recreated and captured.
- Tracked desired overwrites declined in the same run preserve old baselines;
  declined untracked destinations stay untracked.
- A late obsolete conflict, unsafe tracked path, or prompt failure prevents every
  desired write, removal, directory creation, and manifest change.
- Assert desired writes follow prepared order, obsolete removals follow existing
  manifest order, existing entry positions survive replacements, and new entries
  append in prepared order.
- Cover empty bundles/translation output, mixed outcomes, manifest deletion last,
  cleanup limits, and injected failure/cancellation after writes or removals with
  completed-state persistence and retained outcomes.

Validation: distinguish saved-baseline comparisons from new-bundle bytes and
verify unrelated/untracked files and empty directories survive reconciliation.

### 2. Integrate obsolete removals into the install plan

Scope: extend install planning/mutation under `src/instruction-operations/` using
the existing shared removal policy; no separate reconciliation framework.

Expected outcome:

- After complete preparation, identify obsolete entries against the entire desired
  output set. Include all desired and obsolete paths in one preflight and resolve
  all required answers before the first mutation.
- Apply desired writes in prepared order, then obsolete removals in manifest order.
  Reuse uninstall's missing-file, ownership-transfer, regular-file removal, and
  successful-deletion-only directory cleanup behavior.
- Persist one resulting ordered ownership baseline, retain the manifest through
  cleanup, delete an empty manifest last, and preserve completed work on errors
  or cancellation according to the shared lifecycle.
- Remove any temporary obsolete-entry retention behavior introduced by 0005.

Validation: combined install/reinstall tests pass for every action-policy row,
including failure before mutation and persistence after partial progress.

### 3. Run complete shared-operation checks

Scope: run `cr test ./src/instruction-operations.ts ./src/instruction-operations`
and `cr test ./tests/instruction-operations`, including all changed explicit tests.

Expected outcome: install, reinstall, and uninstall satisfy the specification's
full policy and lifecycle matrix with applicable lint, format, coverage, and
mutation checks passing.

Validation: audit operations coverage against the specification before command
integration; no test-map, native mapping, or manifest schema changes.

## References

- [Operations specification](../../plans/installation-and-uninstallation-commands/install-and-uninstall-operations/SPEC.md), especially Requirements 5–12 and the action-policy table
- [Removal and cleanup prerequisite](0006-uninstall-tracked-instructions-and-transfer-declined-ownership.md)
- [Desired install behavior](0005-install-prepared-instructions-with-protected-file-ownership.md)

## Validation results

- Shared-operation source and test checks passed: 45 tests; reported coverage is 100%.
- Policy audit covers desired writes, obsolete removal, combined preflight, ownership transfer,
  ordering, cleanup, and partial-state persistence on failure/cancellation.
- Mutation commands passed with no survivors, but all 35 mutations were classified as type errors;
  behavioral mutation validation is therefore limited. No test tooling was changed.
