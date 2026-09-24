---
title: Coordinate multi-harness lifecycle preflight and application
status: open
depends-on: 0005, 0006, 0007
---

# Coordinate multi-harness lifecycle preflight and application

Complete the shared lifecycle contract for multi-harness requests: prepare every selected operation and decision before changing any home, detect conflicts across overlapping homes, and report partial application accurately.

## Tasks

1. [ ] Add cross-harness and fault-injection fixtures
2. [ ] Coordinate global staging, preflight, and decisions
3. [ ] Recheck prepared actions and report partial application

## Task details

### 1. Add cross-harness and fault-injection fixtures

Extend `tests/commands/install.test.sh`, `tests/commands/uninstall.test.sh`, and `tests/commands/install/harness_lifecycle.test.sh` with equal and nested homes, separate manifests in a shared home, duplicate names, conflicting absolute payload paths, file/parent conflicts, payload/metadata conflicts, and a render failure in the last selected harness. Inject copy, rename, remove, and manifest-publication failures after one completed action.

Expected outcome:

- Every stage, preflight, or required-prompt failure leaves all selected homes byte-identical. Application faults stop at the first failure and identify completed, unchanged, already absent, preserved, failed, and unattempted paths, including a changed file whose baseline publication failed.

Validation:

- Run all three focused tests directly with `sh`; inspect exact file and manifest snapshots after each fault.

### 2. Coordinate global staging, preflight, and decisions

For install, render every selected harness into a distinct temporary tree outside all selected homes, then inventory, validate, and plan every selected installation before the first mutation. For uninstall, prepare every selected manifest without rendering. Normalize selected homes and reject only actual absolute-file claims or write conflicts, including file/parent and manifest/payload overlap; directory overlap alone remains valid. Capture all required force decisions globally, and discard stages and plans on failure.

Expected outcome:

- A later selected harness cannot cause earlier homes to change when its render, manifest, target, collision, or prompt validation fails.

Validation:

- Run direct multi-harness fixtures for both commands, including equal and nested home directories.

### 3. Recheck prepared actions and report partial application

Before each action, recheck staged bytes and the relevant target, parent, manifest, and ownership preconditions. Never traverse a destination link. Apply in selected-harness then `LC_ALL=C` path order; use same-directory temporary files and rename for creation or replacement, checksum actual installed bytes, and publish each completed manifest snapshot atomically. Stop on the first failure without rollback or inferred adoption; report successful actions and unattempted actions distinctly. Remove only safe empty directories created during this operation.

Expected outcome:

- A later retry cannot silently adopt a file changed before its manifest baseline was published; partial state is visible in reports and manifests.

Validation:

- Run `sh -n` on changed scripts, direct focused tests, and `./bin/cr test <changed-lib-paths>`. Do not run the full suite unless behavior outside these focused components changes.

## References

- [Installation specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-installation-and-uninstallation/SPEC.md)
- [Rendering specification](../../plans/coderail-v2-0/harness-installation-and-removal/harness-instruction-and-skill-rendering/SPEC.md)
- Tickets `0005-install-new-harness-payloads-safely`, `0006-reconcile-protected-harness-installations`, `0007-uninstall-managed-harness-payloads`
- `lib/commands/install.sh`, `lib/commands/uninstall.sh`, `lib/commands/install/`
