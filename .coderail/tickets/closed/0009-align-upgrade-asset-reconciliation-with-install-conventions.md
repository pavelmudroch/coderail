---
id: "0009"
slug: "align-upgrade-asset-reconciliation-with-install-conventions"
title: "Align upgrade asset reconciliation with install conventions"
status: "closed"
created_at: "2026-11-04T09:46:30.073Z"
updated_at: "2026-11-04T09:58:21.222Z"
dependencies:
  - "0008"
reason: "done"
---

# Align upgrade asset reconciliation with install conventions

Make upgrade asset planning and persistence read like equivalent install/uninstall operations while preserving distribution ownership and partial-progress semantics. Depends on 0008, which removes duplicate argument validation from the same helper. This ticket owns asset-helper changes; executable helpers belong to 0010 and command orchestration to 0011.

## Tasks

1. [x] Confirm asset reconciliation and persistence regression coverage
2. [x] Align asset inspection, planning, and application

## Task details

### 1. Confirm asset reconciliation and persistence regression coverage

Scope: review `tests/commands/upgrade/assets.test.ts` and add focused assertions only for gaps exposed by task 2. Use temporary installations and existing injected I/O failures.

Expected outcome: cover unchanged/modified/missing tracked destinations, untracked collisions, obsolete files, checksum and size mismatches, force/yes/no decisions, unavailable prompts, declined baselines, successful writes/removals, and actual manifest contents after partial mutation. Retain unsafe-path, symlink, ownership-scope, bootstrap-binary, and executable-ownership preservation cases.

Validation: all required confirmations and destination checks precede mutation; unrelated templates survive; declined untracked paths stay unowned; declined tracked paths retain their prior baseline; successful changes alone update ownership even if a later action fails. Simultaneous mutation and manifest-save failures remain observable.

### 2. Align asset inspection, planning, and application

Scope: refactor `src/commands/upgrade/assets.ts` using `installFiles()`/`planInstallation()` and uninstall status/persistence handling as references.

Expected outcome: use consistent names such as `inspectDestination`, readable multiline branches, and explicit inspection statuses and successful/skipped operation tracking. Reuse `InstallManifest.inspect()` for tracked-file status where it fits instead of recomputing the same status logic. Keep upgrade-specific ownership/path validation and destination checks before inspection where needed; shared inspection must not weaken rejection of unsafe destinations. Preserve existing action/plan/progress interfaces where possible so this ticket stays isolated from command and executable-helper edits.

Validation: task 1 outcomes remain true, including saving successful progress after failure, retaining executable ownership, and preventing activation when asset or manifest persistence fails. Run `cr verify ./src/commands/upgrade/assets.ts` and, if modified, `cr verify ./tests/commands/upgrade/assets.test.ts`; fix failures until passing. Do not introduce a shared framework or modify install/uninstall.

## References

- [Agreed consistency refactor](../../plans/upgrade-command/REVIEW.md), fourth item
- [Conflict, ownership, and failure contracts](../../plans/upgrade-command/IDEA.md)
- [Asset implementation](../../../src/commands/upgrade/assets.ts) and [tests](../../../tests/commands/upgrade/assets.test.ts)
- [Install planning](../../../src/commands/install.ts) and [uninstall persistence](../../../src/commands/uninstall.ts)
- [Manifest API](../../../src/install-manifest.ts) and [inspection behavior](../../../src/install-manifest/inspect.ts)
- Prerequisite: [0008 validation boundary](0008-centralize-upgrade-argument-validation-and-align-diagnostics.md)
- Follow-up: [0011 lifecycle/reporting](0011-align-upgrade-lifecycle-and-reporting-with-install-commands.md)
