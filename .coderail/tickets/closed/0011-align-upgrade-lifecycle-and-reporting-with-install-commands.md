---
id: "0011"
slug: "align-upgrade-lifecycle-and-reporting-with-install-commands"
title: "Align upgrade lifecycle and reporting with install commands"
status: "closed"
created_at: "2026-11-04T09:46:37.633Z"
updated_at: "2026-11-04T10:30:58.045Z"
dependencies:
  - "0009"
  - "0010"
reason: "done"
---

# Align upgrade lifecycle and reporting with install commands

Make the command-level upgrade flow and its progress/error messages follow install/uninstall conventions while retaining the full upgrade lifecycle. Depends on 0009 and 0010 so command integration uses the final helper behavior; 0007/0008 arrive transitively.

## Tasks

1. [x] Confirm lifecycle ordering and reporting regression coverage
2. [x] Align upgrade orchestration and progress/error presentation

## Task details

### 1. Confirm lifecycle ordering and reporting regression coverage

Scope: extend `tests/commands/upgrade.test.ts` only where existing end-to-end cases lack assertions needed for task 2. Reuse `tests/commands/upgrade/release-fixture.ts` and temporary roots with deterministic confirmation and failure injection.

Expected outcome: cover successful/skipped operations, partial writes/removals, manifest-save status, activation outcome, residual executables, and errors before mutation. Preserve bootstrap into custom roots, default/latest/partial/exact/canary selection, downgrades, same-version restoration, user templates, contention, cancellation, and noninteractive confirmation behavior.

Validation: release download/extraction/validation and all confirmations precede mutation; stale cleanup precedes asset writes/removals and manifest persistence, which precede launcher activation and executable retirement. Asset or manifest failure prevents activation. Failure reports distinguish preflight from partial mutation and identify completed progress and the actual selected root. Recovery guidance advises preserving user templates before manual root removal and rebootstrap with `curl` and `install.sh`.

### 2. Align upgrade orchestration and progress/error presentation

Scope: refactor `Upgrade.run()` and command-local naming in `src/commands/upgrade.ts` against install/uninstall control flow, confirmation handling, operation tracking, and logging/error presentation. Avoid changing helper internals owned by prerequisites.

Expected outcome: use clear multiline branches and familiar names for equivalent operations, integrate successful/skipped results truthfully, and present actionable progress and errors through existing logging mechanisms. Preserve injected report/confirmation adapters, abort behavior, distribution ownership, staging/locking, activation order, executable cleanup, and custom-root recovery guidance. Keep parser validation exclusively in `parseArguments()` and retain the help formatting from 0007.

Validation: task 1 integration outcomes and affected helper suites pass. Run `cr verify ./src/commands/upgrade.ts` and `cr verify ./tests/<path-to-file>.test.ts` for every modified test, fixing failures until passing. No install/uninstall rewrite, new shared framework, automatic rollback, publishing workflow, bootstrap installer, or PATH changes are included.

## References

- [Agreed consistency refactor](../../plans/upgrade-command/REVIEW.md), fourth item
- [Complete lifecycle and recovery contract](../../plans/upgrade-command/IDEA.md)
- [Upgrade command](../../../src/commands/upgrade.ts) and [integration tests](../../../tests/commands/upgrade.test.ts)
- [Release fixture](../../../tests/commands/upgrade/release-fixture.ts)
- [Install command](../../../src/commands/install.ts) and [uninstall command](../../../src/commands/uninstall.ts)
- Prerequisites: [0009 asset reconciliation](0009-align-upgrade-asset-reconciliation-with-install-conventions.md), [0010 executable helpers](0010-align-upgrade-executable-helpers-with-command-conventions.md)
