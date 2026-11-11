---
id: "0037"
slug: "diagnose-harness-instruction-integrity-and-executable-availability"
title: "Diagnose harness instruction integrity and executable availability"
status: "closed"
created_at: "2026-11-11T10:52:02.335Z"
updated_at: "2026-11-11T11:45:50.483Z"
dependencies:
  - "0036"
reason: "done"
---

# Diagnose harness instruction integrity and executable availability

Complete doctor by checking installed global/local harness instruction ownership and the configured harness executable. Depends on 0036 for discovered project paths, effective configuration/fallback, and the combined diagnostic flow (and transitively on 0035).

## Tasks

1. [x] Add harness integrity and executable diagnostic tests
2. [x] Implement global and local harness instruction diagnostics
3. [x] Diagnose the configured harness executable and complete verification
4. [x] Correct POSIX executable permission diagnostics and add a regression test

## Task details

### 1. Add harness integrity and executable diagnostic tests

Scope: extend `tests/commands/doctor/installation.test.ts`, `tests/commands/doctor/project.test.ts`, and `tests/commands/doctor.test.ts`; use isolated harness homes and PATH fixtures.

Expected outcome:

- Cover absent global/local instruction manifests as valid uninstalled targets; valid manifests; malformed/unreadable manifests; missing/modified owned files; and unreadable targets.
- Check both supported harnesses' installed instructions independently, regardless of which harness is configured. One broken home/file must not hide other independent failures.
- Cover no project (global checks still run, local checks skip), unavailable project discovery (local checks skip), and absent optional instruction sources.
- Cover no configured harness (executable check skipped), supported/available configured harness, unknown configured harness, and unavailable configured executable. Availability checks target only the configured harness.
- Add full command regression cases for simultaneous installation, configuration, project, and harness failures; output is rendered after collection with manual guidance and skips.

Validation: assert all real findings have repairable false, healthy/skipped runs exit 0 and failures exit 1, cancellation propagates, and no repair, file mutation, release download, or harness session takes place.

### 2. Implement global and local harness instruction diagnostics

Scope: `src/commands/doctor/installation.ts` for global installation targets and `src/commands/doctor/project.ts` for local targets; integrate through `src/commands/doctor.ts` as needed.

Expected outcome:

- Resolve supported connector homes using Harness/InstallationTarget and the install command's manifest location rules, rather than hard-coded parallel location rules. Dispose connectors where required.
- Inspect global installed instruction manifests during installation checks and local manifests only for the discovered project. Missing manifests mean nothing is installed at that target and are not failures.
- Reuse InstallManifest load/validation/inspection; report malformed/unreadable manifests and every missing/modified owned file with manual repair options. Continue other file/target checks after operational errors.
- Optional missing instructions/templates and uninstalled harnesses remain valid. Skip only checks blocked by unavailable prerequisite information; retain installation-before-project ordering and propagate cancellation.

Validation: task 1 global/local fixtures pass for Codex and Claude, including multiple independent damaged targets and file read errors; no install/translation/repair operations run.

### 3. Diagnose the configured harness executable and complete verification

Scope: doctor orchestration/project diagnostics and relevant tests; reuse configured harness naming and executable conventions from existing harness consumers.

Expected outcome:

- Use effective configuration from 0036. With no configured harness, report a skip; with an unknown harness or unavailable configured executable, collect a failure with manual guidance.
- Check executable availability locally using existing platform/PATH conventions. Do not start a harness session or check executables for every unconfigured harness.
- Preserve collection despite other findings, final-only rendering, repairable markers, explicit blocked-check skips, exit codes, and cancellation handling.
- Finish the complete agreed doctor scope without implementing automatic repair; `--repair` still throws `not implemented`.

Validation: task 1 tests and affected doctor/configuration/startup coverage pass. Run `cr verify ./src/<path>.ts` for every modified source file and `cr verify ./tests/<path>.test.ts` for every modified test file, fixing and repeating until passing per AGENTS.md. Exercise complete healthy and failing command flows in source/compiled fixtures and confirm no network, mutation, or harness sessions.

### 4. Correct POSIX executable permission diagnostics and add a regression test

Blocking review finding (P2): `src/commands/doctor/project.ts:127-131` treats any execute mode bit as proof that the current user can execute a candidate. POSIX selects owner/group/other permissions according to the caller; it does not fall back to other execute bits when the owner bit is absent. Doctor can therefore pass an unavailable configured harness.

Observed reproduction on macOS as the owning non-root user: create a regular `codex` fixture on an isolated PATH and chmod it to `0601`. `Project.checkExecutable('codex', signal)` returns `{ failures: [], skipped: [] }`, while `node:fs/promises.access(path, constants.X_OK)` rejects with `EACCES`. No harness was started.

Scope: add the regression in `tests/commands/doctor/project.test.ts`, then fix `src/commands/doctor/project.ts` to check actual executable access using platform-appropriate local filesystem checks. Preserve PATH search continuation so an inaccessible candidate does not hide a later accessible executable, and preserve cancellation and Windows behavior.

Validation: the inaccessible owner-mode fixture produces a failure with manual guidance; an accessible candidate still passes; a later accessible PATH candidate passes after an inaccessible candidate. Run the required `cr verify` commands for modified source/test files and affected doctor coverage.

Review validation: all 24 doctor tests and all 48 configuration/startup/loop tests (17 steps) passed; `git diff --check` passed. Existing coverage does not catch the permission defect above. No implementation files were changed during review.

## Implementation validation

- Reproduced the owner-mode `0601` false positive with a real isolated PATH fixture before the fix.
- POSIX executable diagnostics now use filesystem `X_OK` access checks; Windows candidate handling is preserved. Inaccessible candidates do not hide later accessible PATH entries.
- Required individual source and test verification passed, including 100% source coverage and the configured mutation check.
- Doctor, configuration, startup, runtime and loop coverage passed: 97 tests (17 steps), including healthy/failing source and compiled doctor fixtures without mutation or harness sessions.
- `git diff --check` passed.

## References

- [Approved doctor specification](../../plans/doctor-command/IDEA.md)
- [Verification requirements](../../../AGENTS.md)
- [0036 — Project/configuration diagnostics](0036-diagnose-project-initialization-and-configuration.md)
- [0035 — Installation diagnostics/bootstrap](0035-diagnose-installation-health-through-doctor-bootstrap.md)
- `src/harness.ts`, `src/harness/connector.ts`, `src/harness/{codex,claude}.ts` — names, scoped homes, and executable conventions
- `src/commands/install.ts`, `src/commands/uninstall.ts`, `src/path.ts` — instruction manifest locations/ownership
- `src/install-manifest.ts`, `src/install-manifest/{load,inspect,validate}.ts`
- `src/commands/doctor.ts`, `src/commands/doctor/{installation,project,types}.ts` (introduced by prerequisites)
