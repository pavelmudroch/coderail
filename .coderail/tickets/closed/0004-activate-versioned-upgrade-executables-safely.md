---
id: "0004"
slug: "activate-versioned-upgrade-executables-safely"
title: "Activate versioned upgrade executables safely"
status: "closed"
created_at: "2026-11-03T13:10:59.362Z"
updated_at: "2026-11-04T09:06:55.418Z"
dependencies:
  - "0001"
  - "0003"
reason: "done"
---

# Activate versioned upgrade executables safely

Switch the stable launcher only after asset and manifest reconciliation succeeds. Support the six-target executable layout and safe same-version reconciliation. Depends on verified packages (0001) and asset/manifest completion (0003).

## Tasks

1. [x] Add executable staging and launcher activation tests
2. [x] Implement versioned executable staging and upgrade coordination
3. [x] Implement Unix and Windows launcher activation

## Task details

### 1. Add executable staging and launcher activation tests

Scope: add isolated activation tests under `tests/commands/upgrade/`, including native platform smoke tests where available.

Expected outcome: specify bootstrap launcher creation, upgrades/downgrades, distinct canary commit identities, same-version reuse, custom roots, and activation failure behavior.

Validation: assert running executables are never truncated/overwritten; asset/manifest failure prevents launcher switching. Exercise concurrent upgrades and protected executable identities. On Linux/macOS verify the actual symlink target; on Windows execute `cr.cmd` to verify arguments containing spaces/quotes, forwarding, and exit status. Cover platform mapping for all six targets and explicitly identify native tests requiring other hosts.

### 2. Implement versioned executable staging and upgrade coordination

Scope: create activation helpers under `src/commands/upgrade/` and extend ticket 0003's ownership integration points. Define a shared installation coordination mechanism for reconciliation, activation, and cleanup; orchestration acquires it before inspecting mutable installed state and holds it through mutation/activation.

Expected outcome: install private binaries under `<root>/libexec/` with version/build identity; canary names include the source commit. Reuse a verified matching executable or select a distinct physical destination for same-version reconciliation. Bootstrap can reuse its verified running binary. Identify owned executable files and expose the running path, current launcher target, selected executable, and retired identities to cleanup. Concurrent operations cannot overwrite or retire each other's binaries; contention is reported before unsafe changes.

Validation: task 1 staging/concurrency tests pass, including direct invocation when the current launcher points elsewhere and untracked executable-name collisions.

### 3. Implement Unix and Windows launcher activation

Scope: create/update `<root>/bin/cr` as a symlink on Linux/macOS and `<root>/bin/cr.cmd` as a command launcher on Windows, pointing to the selected private executable. Do not implement PATH integration.

Expected outcome: activation occurs only after approved asset writes/removals and manifest persistence succeed. Prepare and replace the launcher safely; preserve the existing target when preparation fails. Windows requires no symlink privilege. Report activation success separately from later cleanup; no automatic rollback is required if mutation already progressed.

Validation: task 1 launcher and failure tests pass; the stable bin directory exposes no versioned executables. Run `cr verify ./src/<changed-file>.ts` and `cr verify ./tests/<changed-file>.test.ts` for changed source/test files.

## References

- [Executable layout, activation, and same-version constraints](../../plans/upgrade-command/IDEA.md)
- [Runtime root contract](../../../src/runtime/context.ts)
- Prerequisites: 0001 and 0003. Runtime/resource behavior: 0002. Cleanup consumer: 0005. Integration: 0006.

## Implementation notes

- Added `activation.ts` with an installation-root lock shared by orchestration and future cleanup consumers, exclusive executable creation, verified ownership-based reuse, and launcher replacement after asset/manifest persistence.
- Cleanup receives owned, running, previously active, selected, protected, and retired executable identities. No cleanup or PATH integration is performed here.
- Verification: individual source and test checks passed with 100% line and branch coverage. macOS native symlink checks passed; Windows launcher generation/replacement is covered using platform simulation. The native Windows command forwarding/exit-status test is explicitly skipped on this macOS host and requires Windows. Native Linux symlink checks require Linux.
