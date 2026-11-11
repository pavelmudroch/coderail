---
id: "0039"
slug: "report-verbose-doctor-progress-and-diagnostic-context"
title: "Report verbose doctor progress and diagnostic context"
status: "closed"
created_at: "2026-11-11T12:17:21.353Z"
updated_at: "2026-11-11T12:25:45.483Z"
dependencies:
  - "0038"
  - "0037"
reason: "done"
---

# Report verbose doctor progress and diagnostic context

Make a slow doctor run explain its current work through verbose stderr notices while preserving collected final results on Log.output. Implements the fourth agreed change in REVIEW.md. Depends on 0038 to avoid overlapping installation changes and completed 0037 for the full harness diagnostic flow.

## Tasks

1. [x] Add regression coverage for verbose progress and final output timing
2. [x] Announce doctor orchestration phases with bootstrap verbosity
3. [x] Add diagnostic context before individual checks
4. [x] Verify logging levels and complete doctor output behavior

## Task details

### 1. Add regression coverage for verbose progress and final output timing

Scope: `tests/commands/doctor.test.ts`, `tests/commands/doctor/{installation,project}.test.ts`, and configuration/startup tests where the selected instrumentation requires coverage.

Expected outcome:

- Capture notices and final output separately; assert useful phase/check notices occur before the potentially slow operation they describe, with representative resolved paths, configuration sources, harness names, and executable candidates.
- Exercise explicit `--verbose` during bootstrap before configuration is available, including malformed configuration and fallback. Assert CLI verbosity remains effective.
- Cover normal and quiet suppression using the real Log.notice level behavior. Cover effective configuration logging settings for subsequent checks once configuration is available.
- Assert failures, manual repairs, skips, repairable markers, success messages, and exit codes retain their existing behavior. No final result is printed before all checks are collected, including runs with independent failures.

Validation: tests fail when notices are missing, late, lack useful context, leak at normal/quiet levels, or replace/print final results early. Avoid brittle assertions for incidental wording. Restore log state and stubs between cases.

### 2. Announce doctor orchestration phases with bootstrap verbosity

Scope: `src/commands/doctor.ts`; inspect `src/main.ts` bootstrap logging setup and change it only if needed.

Expected outcome:

- Use Log.notice to announce installation checks, installation/configuration path resolution, project discovery/checks, configuration diagnostics, and configured harness executable diagnostics before each phase starts.
- Include known resolved cwd, installation root, and project root where useful. Preserve installation-before-project ordering, cancellation, and independent failure collection.
- Honor explicit bootstrap flags before configuration is available, including direct bootstrap test contexts; use the effective diagnosed configuration for later notices when available. Preserve explicit flags through configuration fallback.
- Keep final findings/manual repair guidance/skips/success exclusively in the existing Log.output rendering after collection. Progress notices describe work and do not print collected results.

Validation: task 1 observes early notices with `--verbose`, expected later log levels, and unchanged final output/exit behavior on healthy and failing runs.

### 3. Add diagnostic context before individual checks

Scope: `src/commands/doctor/installation.ts`, `src/commands/doctor/project.ts`, and the diagnostic path of `src/conf/load-configuration.ts` as needed for source-level notices.

Expected outcome:

- Announce installation path/resource/manifest/owned-file/launcher/PATH checks before potentially slow resolution or I/O; include available resolved resource paths, manifest paths, owned targets, launcher targets, and installation bin.
- Announce discovery and project initialization work with relevant paths. Identify each global/local harness by name and scope, its resolved home/manifest, and instruction files before inspection.
- Identify each configuration source location before reading/validating it, including global, source repository and project config; identify environment validation without dumping environment values. Reuse Conf-owned source rules.
- Identify the configured harness and executable candidates before filesystem/access checks. Retain independent checks, skips, cancellation, and local-only diagnostics.
- Use the existing verbose-only stderr Log.notice behavior; keep shared logging semantics unchanged and avoid duplicating final findings as progress.

Validation: task 1 covers representative context from each diagnostic area, operation ordering, normal/quiet suppression, and continued checks after failures. Existing configuration behavior remains unchanged.

### 4. Verify logging levels and complete doctor output behavior

Scope: affected doctor/configuration/bootstrap source and test files.

Expected outcome: a verbose run explains ongoing work before slow checks, while final collected output remains stable at all logging levels.

Validation: run `cr verify ./src/<path>.ts` for every modified source file and `cr verify ./tests/<path>.test.ts` for every modified test file, fixing and repeating until passing under AGENTS.md. Exercise affected doctor, configuration, and bootstrap tests, including healthy/failing runs and configuration fallback; confirm stdout results and stderr notices remain separate. Check `git diff --check`.

## References

- [Agreed review changes](../../plans/doctor-command/REVIEW.md)
- [Doctor specification](../../plans/doctor-command/IDEA.md)
- [0038 — Installation correctness](0038-correct-doctor-installation-resource-and-launcher-checks.md)
- [0037 — Harness diagnostics](../closed/0037-diagnose-harness-instruction-integrity-and-executable-availability.md)
- [Verification requirements](../../../AGENTS.md)
- `src/commands/doctor.ts`, `src/commands/doctor/{installation,project}.ts`
- `src/main.ts` — CLI log setup before bootstrap dispatch
- `src/conf/load-configuration.ts` — diagnoseConfiguration and source locations
- `src/log.ts`, `src/log/notice.ts`, `tests/log/notice.test.ts` — existing verbose-only stderr contract
- `tests/commands/doctor.test.ts`, `tests/commands/doctor/{installation,project}.test.ts`, `tests/main.test.ts`, `tests/conf/load-configuration.test.ts`
