---
id: "0035"
slug: "diagnose-installation-health-through-doctor-bootstrap"
title: "Diagnose installation health through doctor bootstrap"
status: "closed"
created_at: "2026-11-11T10:51:57.703Z"
updated_at: "2026-11-11T11:21:19.749Z"
dependencies: []
reason: "done"
---

# Diagnose installation health through doctor bootstrap

Make `cr doctor` usable when normal runtime/configuration startup would fail, and deliver installation diagnostics with collected findings and manual recovery guidance. Project and harness checks follow in dependent tickets.

## Tasks

1. [x] Add bootstrap, CLI, and installation diagnostic tests
2. [x] Implement bootstrap dispatch and doctor reporting
3. [x] Implement source and compiled installation diagnostics
4. [x] Verify the installation diagnostic delivery
5. [x] Reject non-regular distribution manifests without blocking diagnostics

## Task details

### 1. Add bootstrap, CLI, and installation diagnostic tests

Scope: extend `tests/main.test.ts`; add `tests/commands/doctor.test.ts` and `tests/commands/doctor/installation.test.ts` using isolated fixtures and deterministic fault injection.

Expected outcome:

- Doctor bypasses eager Runtime context/configuration loading; other commands retain existing startup, help, version, cleanup, and cancellation behavior.
- Cover `--help`, unknown options/positionals, `--repair` throwing an error whose message is exactly `not implemented`, and bootstrap arguments including `--cwd` and AbortSignal.
- Cover healthy source/compiled layouts, missing optional instructions/templates, missing/malformed distribution manifest, missing/modified owned files, unreadable paths, broken launchers, and missing installation bin on PATH.
- Cover multiple independent failures, failure-plus-skip reports, manual guidance, rendering only after collection, and cancellation propagation. Use a synthetic repairable finding to exercise its marker even though real findings all use false.

Validation: tests distinguish exit 0 for healthy/skipped checks, exit 1 for diagnostic failures, usage errors through the existing CLI convention, and existing cancellation behavior. Assert no filesystem repairs, release downloads, or harness sessions occur.

### 2. Implement bootstrap dispatch and doctor reporting

Scope: `src/main.ts`, `src/commands/doctor.ts`, and new `src/commands/doctor/types.ts`.

Expected outcome:

- Add `runBootstrapMode` in main before normal context/configuration construction, recognizing Doctor directly; do not change the shared Command interface or add configurationMode metadata.
- Define BootstrapRunContext with parsed command arguments, global arguments, and AbortSignal, omitting runtime/configuration fields. Doctor.run accepts this or normal RunContext without fabricated empty contexts.
- Parse doctor arguments, enable help, and retain `--repair` in help with the agreed runtime error.
- Define `DoctorFailure = { message: string; repairable: boolean; manualRepair: string[] }` and `DoctorReport = { failures: DoctorFailure[]; skipped: string[] }`.
- Orchestrate installation diagnostics before any project discovery. Render findings only after collection, include applicable manual options, explicitly mark repairable findings, show skips, and set exit 1 iff failures exist, otherwise 0. All actual failures initially have repairable false.
- Convert operational errors into findings and blocked checks into skips; propagate cancellation rather than reporting it as diagnostic failure. Keep parsing/help compatible with normal CLI handling.

Validation: task 1 bootstrap and command tests pass; normal commands still use the existing context/configuration flow. Dependent tickets extend this orchestration without changing report contracts.

### 3. Implement source and compiled installation diagnostics

Scope: new `src/commands/doctor/installation.ts`; reuse runtime location rules, installation manifest inspection, and existing launcher/PATH layout contracts. Helpers take resolved paths/settings and AbortSignal.

Expected outcome:

- Resolve installation/resource paths without triggering project discovery or depending on a valid manifest or project configuration. Record resolution/read failures and skip only checks lacking required information.
- Source mode checks repository resources; compiled mode checks distribution manifest, owned files, launcher, and current PATH membership of installation bin. Source mode explicitly skips compiled manifest, launcher, and PATH checks.
- Missing optional instructions/templates are valid; missing/modified manifest-owned files, malformed/missing compiled manifests, broken launchers, absent bin on PATH, and unreadable targets are failures.
- Continue independent checks and owned-file inspections after individual failures; one read error must not hide unrelated missing/modified files. Reuse manifest formats/validation rather than inventing new ownership rules.
- Keep diagnostics local and read only. Do not call mutating activation/PATH configuration helpers.

Validation: task 1 installation fixtures pass for both layouts and error accumulation; cancellation promptly propagates and unavailable prerequisites produce explicit skips.

### 4. Verify the installation diagnostic delivery

Scope: all source/test files changed by this ticket.

Expected outcome: resolve failures from the new regression coverage and required per-file verification.

Validation: run `cr verify ./src/<path>.ts` for every modified source file and `cr verify ./tests/<path>.test.ts` for every modified test file, fixing failures and rerunning until passing, per AGENTS.md. Confirm help and the healthy/failing installation-only flows through the CLI; project/harness coverage remains assigned to 0036/0037.

### 5. Reject non-regular distribution manifests without blocking diagnostics

Review finding (blocking, P2): `src/commands/doctor/installation.ts:101` passes the manifest path directly to `InstallManifest.load`, whose `Fs.read` opens and reads it without an AbortSignal. A FIFO at `.coderail-distribution.json` blocks collection indefinitely, hides independent launcher/PATH failures, and does not settle after cancellation. This violates the operational-error collection and prompt cancellation requirements of this ticket.

Reproduction observed during review:

- Create an isolated compiled layout with a regular `libexec/cr-1` entry point and use `mkfifo <root>/.coderail-distribution.json` instead of a JSON manifest.
- Call `Installation.check(signal, { standalone: true, entryPath, windows: false, path: '' })`.
- Abort the controller after 50 ms. At 300 ms the signal is aborted but the check remains pending; the FIFO has no writer, so the manifest read cannot complete.

Expected outcome:

- Validate the manifest target type before opening it; report unsupported non-regular targets as installation failures rather than reading them as JSON streams.
- Continue independent launcher and PATH checks and report owned-file checks as skipped when the manifest is unavailable.
- Preserve cancellation propagation during manifest collection. Reuse the existing manifest schema and validation.

Validation: add an isolated regression for a FIFO or equivalent deterministically blocked manifest read, covering independent findings and cancellation. Run the required per-file verification for any modified source/tests.

## Review validation

- Follow-up review: 43 focused tests passed across `tests/main.test.ts`, `tests/commands/doctor.test.ts`, `tests/commands/doctor/`, and `tests/commands/upgrade/assets.test.ts`, including FIFO rejection and manifest cancellation regressions.
- `deno check` passed for all five changed/new source files.
- CLI source diagnostics with a nonexistent `--cwd`, doctor help, and the exact `not implemented` repair error behaved as specified.
- `git diff --check` passed. Reviewed all unstaged changes and the untracked closed ticket; staged implementations were used only as context.
- Review decision: pass. Task 5 resolves the prior blocking finding; no additional actionable findings. Ticket 0035 remains closed, with no new tickets required.

## References

- [Approved doctor specification](../../plans/doctor-command/IDEA.md)
- [Verification requirements](../../../AGENTS.md)
- `src/main.ts`, `tests/main.test.ts`, `src/commands/doctor.ts`, `src/commands/helpers/command.ts`
- `src/runtime/context.ts` — physical installation and source/compiled resource locations
- `src/install-manifest.ts`, `src/install-manifest/{load,inspect,validate,capture}.ts`
- `src/commands/upgrade/{assets,activation,path}.ts` — installed manifest, launcher, and PATH contracts
- Follow-ups: 0036 (project/configuration), 0037 (harness integrity/availability)

## Delivery notes

- Reopened task 5: distribution manifest targets are checked for regular-file status before a cancellable text read, using the existing manifest validator. FIFO regression coverage confirms independent launcher/PATH findings, owned-file skips, and cancellation during metadata collection and manifest reads. Required per-file verification passes with nine installation tests and 100% installation-module coverage.
- Doctor dispatches before runtime/project discovery and configuration loading, with globals and the registered AbortSignal preserved.
- Source resources and compiled manifest ownership, launcher and current PATH checks collect local, read-only findings with manual recovery options. Independent errors continue; unavailable prerequisites skip dependent checks.
- Reused distribution ownership validation by exporting the existing validator. Canonicalized the upgrade asset test fixture so permission fault injection works on systems where temporary paths contain symlink ancestors.
- Required per-file verification passed, including full line/branch coverage and configured mutation checks. CLI smoke checks passed for source help, source diagnostics with nonexistent cwd, compiled broken and healthy installations, and the specified repair error.
