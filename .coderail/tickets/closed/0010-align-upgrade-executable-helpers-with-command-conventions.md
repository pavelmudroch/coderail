---
id: "0010"
slug: "align-upgrade-executable-helpers-with-command-conventions"
title: "Align upgrade executable helpers with command conventions"
status: "closed"
created_at: "2026-11-04T09:46:33.008Z"
updated_at: "2026-11-04T10:25:49.582Z"
dependencies:
  - "0008"
reason: "done"
---

# Align upgrade executable helpers with command conventions

Make release staging, executable activation, and retirement helpers easier to compare with existing command code without changing their upgrade-specific guarantees. Depends on 0008 because it changes validation in `distribution.ts`. This ticket owns only executable/release helpers and their tests, allowing asset work in 0009 to proceed separately.

## Tasks

1. [x] Confirm staging, activation, and cleanup regression coverage
2. [x] Align executable-helper naming and control flow

## Task details

### 1. Confirm staging, activation, and cleanup regression coverage

Scope: review `tests/commands/upgrade/distribution.test.ts`, `activation.test.ts`, and `cleanup.test.ts`; add focused assertions only where the refactor exposes a coverage gap.

Expected outcome: retain coverage of pinned release/build/archive validation and staging cleanup, installation locking, bootstrap and same-version reuse, launcher safety, activation after successful asset/manifest persistence, and distribution-owned retirement. Protect running, current-launcher, and selected executables plus unrelated files. Keep residual cleanup retryable and deferred Windows deletion after process exit.

Validation: tests use fake publication data and temporary roots. Existing six-target, Unix symlink, Windows launcher argument/exit-status, contention, copy/manifest/launcher failure, and unsafe-filesystem checks remain intact. Identify which platform checks require a native host rather than implying fixtures execute native behavior.

### 2. Align executable-helper naming and control flow

Scope: inspect and refactor equivalent operations in `src/commands/upgrade/distribution.ts`, `activation.ts`, and `cleanup.ts`, comparing naming, inspection, success tracking, persistence/error handling, and readable multiline branches with install/uninstall. Make only concrete consistency improvements; avoid unrelated rewrites.

Expected outcome: equivalent filesystem/manifest operations use recognizable names and straightforward branches. Reuse existing inspection mechanisms where appropriate while retaining distribution-specific build validation, ownership and fingerprint checks, locking, staging, activation order, launcher handling, cleanup boundaries, and deferred deletion. Consume parser-validated options as established by 0008. Keep public helper contracts stable where possible, and leave asset reconciliation and `Upgrade.run()` to 0009/0011.

Validation: task 1 guarantees hold and residual cleanup failures do not undo a successful activation. Run `cr verify ./src/<path-to-file>.ts` and `cr verify ./tests/<path-to-file>.test.ts` for each modified source/test file; fix failures until passing. Do not modify install/uninstall, implement rollback, or add a shared framework.

## References

- [Agreed consistency refactor and preservation requirements](../../plans/upgrade-command/REVIEW.md), fourth item
- [Release, activation, cleanup, and failure contracts](../../plans/upgrade-command/IDEA.md)
- [Distribution helper](../../../src/commands/upgrade/distribution.ts) and [tests](../../../tests/commands/upgrade/distribution.test.ts)
- [Activation helper](../../../src/commands/upgrade/activation.ts) and [tests](../../../tests/commands/upgrade/activation.test.ts)
- [Cleanup helper](../../../src/commands/upgrade/cleanup.ts) and [tests](../../../tests/commands/upgrade/cleanup.test.ts)
- [Install conventions](../../../src/commands/install.ts) and [uninstall conventions](../../../src/commands/uninstall.ts)
- Prerequisite: [0008 validation boundary](0008-centralize-upgrade-argument-validation-and-align-diagnostics.md)
- Follow-up: [0011 lifecycle/reporting](0011-align-upgrade-lifecycle-and-reporting-with-install-commands.md)

## Implementation and validation

Reviewed the distribution, activation, and cleanup regression suites. Existing tests cover pinned publications, archive/build/header validation for all six targets, staging cleanup on success and failure, locking, bootstrap/reuse, ownership and fingerprints, persistence before launcher switching, unsafe filesystem paths, and retryable residual cleanup. No coverage gaps were exposed by the naming and branch refactor, so tests remain unchanged.

Renamed private publication/directory inspection and executable removal helpers to describe their operations, matched cleanup executable identity names to activation, and expanded filesystem/error/persistence branches. Retained direct regular-file and fingerprint inspection because executable reuse/deletion requires both recorded ownership and matching bytes; no asset-status or confirmation policy applies here. Public contracts, staging lifetime, activation order, and deferred cleanup remain unchanged.

Passed individual `cr verify` runs for all three modified source files and `cr verify -s` with exactly those files (35 tests passed, two ignored). Validation ran on macOS. The native Windows launcher argument/exit-status test and deferred cleanup process-exit test require Windows and were skipped; Windows fixtures validate script construction and coordination without executing native Windows behavior. Unix symlink behavior ran on this host.
