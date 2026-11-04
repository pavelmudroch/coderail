---
id: "0005"
slug: "clean-up-retired-distribution-executables"
title: "Clean up retired distribution executables"
status: "closed"
created_at: "2026-11-03T13:10:59.555Z"
updated_at: "2026-11-04T09:11:25.517Z"
dependencies:
  - "0004"
reason: "done"
---

# Clean up retired distribution executables

Remove only distribution-owned retired executables, with retryable stale cleanup and post-exit Windows cleanup. Depends on ticket 0004's ownership and coordination contracts.

## Tasks

1. [x] Add stale and deferred executable cleanup tests
2. [x] Implement protected stale cleanup at the start of mutation
3. [x] Implement post-activation retirement and Windows deferred cleanup

## Task details

### 1. Add stale and deferred executable cleanup tests

Scope: add temporary-installation fixtures and controlled process/filesystem tests under `tests/commands/upgrade/`.

Expected outcome: cover owned stale versions, arbitrary untracked `libexec` contents, running executable, current launcher target, selected staged executable, in-use files, concurrent upgrades, and deferred helper failures.

Validation: assert cleanup never precedes completed validation/confirmation and never deletes protected/untracked files. Verify Windows deferred deletion occurs after the upgrading process exits and activation already points at the new binary. Native Windows tests exercise mapped-executable behavior; other hosts test orchestration with controlled process adapters.

### 2. Implement protected stale cleanup at the start of mutation

Scope: add cleanup helpers using ticket 0004's executable ownership records and shared installation coordination. Expose a hook for ticket 0006 to invoke after preflight and before asset mutation.

Expected outcome: retry residual distribution-owned executables from earlier upgrades; protect the physical running executable, current stable target (including a different target during direct invocation), selected staged executable, and concurrent operation binaries. Never infer ownership solely from a matching filename. Undeletable/in-use stale files are reported and retained for later retry without blocking a functioning installation.

Validation: task 1 stale cleanup, ownership, failure, and concurrency tests pass; no preflight-only invocation mutates `libexec`.

### 3. Implement post-activation retirement and Windows deferred cleanup

Scope: retire the previous owned executable only after successful launcher activation. On Windows, launch a short-lived helper that waits for the upgrading process to exit before deletion, coordinated with future upgrades and ownership state.

Expected outcome: immediate safe deletion where supported; deferred Windows deletion respects protected/current executable identities and remains limited to owned retired binaries. If cleanup fails, keep the new installation active, report the residual executable, and retain enough ownership information for the next upgrade to retry. Clean up helper resources without requiring elevation.

Validation: task 1 deferred lifecycle tests pass, including helper startup/deletion failures and a later upgrade retry. Run `cr verify ./src/<changed-file>.ts` and `cr verify ./tests/<changed-file>.test.ts` for changed source/test files.

## References

- [Cleanup boundary and failure policy](../../plans/upgrade-command/IDEA.md)
- [Runtime cleanup lifecycle](../../../src/runtime/cleanup.ts)
- Prerequisite: 0004 (ownership, coordination, activation). Asset sequencing: 0003. Integration consumer: 0006.

## Implementation notes

- Added `cleanupStaleExecutables` for ticket 0006 to invoke after preflight and confirmation, before asset planning/mutation; it owns the installation lock and reloads ownership. Callers must not nest this hook inside an existing installation lock.
- Added `retireExecutables` for invocation after successful activation. Both hooks protect the current launcher and verify file ownership by checksum and size. Deferred helpers recheck the launcher and ownership under the shared lock after process exit.
- Windows uses an encoded PowerShell command, with no temporary helper files. Missing executable ownership records are reconciled on the next stale cleanup. Helper failures preserve the active installation and report residual state.
- Verification passed on macOS, including controlled Windows process orchestration and 100% cleanup source coverage. A native Windows mapped-executable lifecycle test is included and skipped on this host.
