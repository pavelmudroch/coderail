---
id: "0038"
slug: "correct-doctor-installation-resource-and-launcher-checks"
title: "Correct doctor installation resource and launcher checks"
status: "open"
created_at: "2026-11-11T12:17:15.517Z"
updated_at: "2026-11-11T12:17:15.517Z"
dependencies:
  - "0035"
---

# Correct doctor installation resource and launcher checks

Prevent resource inspection from blocking on special files and make launcher/PATH findings reflect actual POSIX access and literal PATH entries. Implements the first three agreed changes in REVIEW.md. Depends on completed ticket 0035 for installation diagnostics.

## Tasks

1. [ ] Add installation regression tests for special files, execute access, and literal PATH entries
2. [ ] Reject unsupported resource entry types before reading
3. [ ] Check launcher target execute access on POSIX
4. [ ] Preserve whitespace when comparing PATH membership
5. [ ] Verify the installation diagnostic changes

## Task details

### 1. Add installation regression tests for special files, execute access, and literal PATH entries

Scope: `tests/commands/doctor/installation.test.ts`; extend existing isolated installation fixtures before changing production behavior.

Expected outcome:

- Place a FIFO inside instructions or templates on POSIX. Guard/spy on reads so a regression fails promptly without opening or blocking on the FIFO. Assert the unsupported entry produces a finding, independent resources and later installation checks still run, and the FIFO is never opened.
- Cover an owner-held regular launcher target with mode `0601` that must fail execute access, and an accessible regular target that passes. Use platform/user guards consistent with existing executable tests where permission semantics cannot be exercised.
- Replace the existing acceptance of a whitespace-padded PATH entry with rejection; retain acceptance of the exact installation bin and a valid entry ending in a slash.

Validation: assertions identify each pre-fix defect and preserve regular-file, symlink, Windows, independent-check, and cancellation expectations. Restore permissions and clean fixtures reliably.

### 2. Reject unsupported resource entry types before reading

Scope: resource traversal in `src/commands/doctor/installation.ts`.

Expected outcome: validate resource entry types before opening them; recurse into supported directories and read supported regular files. Reject unsupported types, including FIFOs, as collected findings without opening them. Continue independent checks using existing report/error handling.

Validation: task 1 proves no FIFO read is attempted and later checks execute; readable resources and optional absent resource directories retain their existing behavior.

### 3. Check launcher target execute access on POSIX

Scope: launcher validation in `src/commands/doctor/installation.ts`; use `access` with `constants.X_OK` as in `src/commands/doctor/project.ts`.

Expected outcome: retain regular-file and symlink validation, replace the any-execute-mode-bit heuristic with an actual POSIX access check, and collect permission errors as launcher findings. Preserve Windows behavior and cancellation handling.

Validation: task 1 rejects the owner-held `0601` fixture despite its other execute bit, accepts an accessible target, and retains broken/non-file launcher coverage.

### 4. Preserve whitespace when comparing PATH membership

Scope: PATH normalization in `src/commands/doctor/installation.ts`.

Expected outcome: remove trimming of PATH entries. On POSIX a value such as `" /opt/coderail/bin/ "` retains its literal spaces and does not match `/opt/coderail/bin`. Preserve supported trailing separator handling and existing Windows separator/case behavior.

Validation: task 1 rejects padded entries and accepts an exact entry and a valid trailing-slash entry; existing platform cases continue to pass.

### 5. Verify the installation diagnostic changes

Scope: the source and regression test files modified in tasks 1–4.

Expected outcome: installation diagnostics pass their regression coverage without blocking, suppressing independent findings, or changing final report semantics.

Validation: run `cr verify ./src/commands/doctor/installation.ts` and `cr verify ./tests/commands/doctor/installation.test.ts`; run per-file `cr verify` for any additional modified src/tests files under AGENTS.md. Fix failures and repeat until passing. Check the patch with `git diff --check`.

## References

- [Agreed review changes](../../plans/doctor-command/REVIEW.md)
- [Doctor specification](../../plans/doctor-command/IDEA.md)
- [0035 — Installation diagnostics and bootstrap](../closed/0035-diagnose-installation-health-through-doctor-bootstrap.md)
- [Verification requirements](../../../AGENTS.md)
- `src/commands/doctor/installation.ts`, `tests/commands/doctor/installation.test.ts`
- `src/commands/doctor/project.ts`, `tests/commands/doctor/project.test.ts` — existing X_OK access check and owner-permission regression fixture
