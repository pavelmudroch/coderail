---
id: "0036"
slug: "diagnose-project-initialization-and-configuration"
title: "Diagnose project initialization and configuration"
status: "open"
created_at: "2026-11-11T10:52:00.080Z"
updated_at: "2026-11-11T11:30:25.116Z"
dependencies:
  - "0035"
---

# Diagnose project initialization and configuration

Extend doctor to diagnose the nearest initialized project, incomplete initialization, and all available configuration sources while continuing after configuration failures. Depends on 0035 for bootstrap dispatch, installation diagnostics, and the report contract.

## Tasks

1. [x] Add project discovery and configuration diagnostic tests
2. [x] Expose reusable Conf validation and fallback construction
3. [x] Implement project discovery and initialization diagnostics
4. [x] Integrate configuration diagnostics and verify the combined flow
5. [ ] Reject unsupported diagnostic input file types before reading

## Task details

### 1. Add project discovery and configuration diagnostic tests

Scope: new `tests/commands/doctor/project.test.ts`; extend command/bootstrap tests from 0035 and `tests/conf/load-configuration.test.ts` as needed.

Expected outcome:

- Cover cwd at project root, descendant cwd, nearest nested project, filesystem-root termination, no project, missing/invalid config, missing/incomplete `.coderail/.gitignore`, and discovery/read permission failures.
- A `.coderail` directory identifies a project even if config or ignore rules are invalid; a discovery error is a failure with dependent project checks skipped.
- Cover missing optional global config; invalid/unreadable global and local config; invalid environment overrides; and multiple invalid sources detected independently.
- Test valid merged configuration and all-or-nothing fallback to defaults plus explicit global flags. Assert partially merged settings are discarded, including when a later source fails.
- Assert installation diagnostics finish before project discovery begins, independent checks still run, and one final report includes installation/project/configuration findings.

Validation: assertions cover exit 0 outside a project with a healthy installation, exit 1 on incomplete initialization/configuration failures, correct skips, cancellation, preserved `--cwd`/logging/color/noninteractive overrides, and no mutations.

### 2. Expose reusable Conf validation and fallback construction

Scope: `src/conf.ts`, `src/conf/load-configuration.ts`, and narrowly scoped Conf helpers if needed.

Expected outcome:

- Keep default construction, source parsing/validation, environment validation, and explicit-global-flag application owned by Conf; doctor must not duplicate schema/defaults/merge rules.
- Allow doctor to validate every available source independently even when another is malformed, and obtain valid effective configuration or fresh defaults plus explicit global flags after any loading failure.
- Preserve normal command configuration behavior and precedence. Missing optional global config remains valid; configuration/environment read and validation errors remain observable.

Validation: task 1 configuration tests pass, existing configuration loading/merge tests retain behavior, and fallback never retains values from partially successful loads.

### 3. Implement project discovery and initialization diagnostics

Scope: new `src/commands/doctor/project.ts`; reuse `projectIgnoreLines` from `src/runtime/context.ts` and existing location rules.

Expected outcome:

- Discover the nearest ancestor, including cwd, containing a `.coderail` directory, only after installation diagnostics complete; respect global `--cwd` without changing the process directory.
- Outside a project, skip project checks without adding a failure. On discovery failure, add a finding and skip dependent project checks rather than claiming no project exists.
- Within a project, report missing config and missing/incomplete ignore file using the same required lines/order rule as init/runtime. Diagnose invalid/unreadable config via the configuration path in task 4.
- Return DoctorReport, accepting resolved paths/settings and AbortSignal; collect independent failures, provide manual `cr init` guidance where applicable, and propagate cancellation.

Validation: task 1 discovery/init fixtures pass, including nested cwd, nearest project, unreadable markers, incomplete initialization, and installation-before-project ordering.

### 4. Integrate configuration diagnostics and verify the combined flow

Scope: `src/commands/doctor.ts`, project diagnostics, and relevant regression tests.

Expected outcome:

- Doctor loads configuration within run, validates available global/local/environment sources independently, records failures, and uses valid merged settings or defaults plus explicit global flags as agreed.
- Check source-mode repository configuration as well as applicable project configuration; do not require a compiled distribution manifest in source mode.
- Preserve independent installation findings when configuration/project resolution fails. Skip checks requiring unavailable paths/settings rather than inventing findings; include all collected failures/skips in the existing final renderer with repairable false and manual guidance.
- Keep installation checks ahead of project discovery/checks; preserve normal command startup and avoid repairs or harness session execution.

Validation: run task 1 coverage plus existing affected configuration/startup tests. For every source/test file changed, run the exact per-file `cr verify` command required by AGENTS.md, fix failures, and repeat until passing. Demonstrate healthy outside-project, nested-project, and simultaneous bad-config/install-failure command flows.

## References

- [Approved doctor specification](../../plans/doctor-command/IDEA.md)
- [Verification requirements](../../../AGENTS.md)
- [0035 — Installation diagnostics/bootstrap](0035-diagnose-installation-health-through-doctor-bootstrap.md)
- `src/conf.ts`, `src/conf/load-configuration.ts`, `src/conf/{configuration,parse,get-global-configuration-file,get-local-configuration-file}.ts`
- `src/runtime/context.ts`, `src/commands/init.ts` — project discovery and required ignore rules
- `src/commands/doctor.ts`, `src/commands/doctor/types.ts`, `tests/main.test.ts`, `tests/conf/load-configuration.test.ts`
- Follow-up: 0037 adds harness instruction integrity and configured executable checks


## Review findings — 2026-11-11

Decision: needs fix. One blocking finding remains within this ticket's scope.

### Reject unsupported diagnostic input file types before reading (blocking)

Locations: `src/commands/doctor/project.ts:59-61` and
`src/conf/load-configuration.ts:81-101`.

Doctor reads initialization/configuration paths without first ensuring they resolve
to regular files. With a FIFO at `.coderail/config`, project checking accepts the
stat result and configuration diagnostics block opening the pipe. With a FIFO at
`.coderail/.gitignore`, project checking blocks reading it before configuration
checks run. Neither case renders collected installation findings or completes.

Reproduction: create an otherwise initialized temporary project, replace either
file with `mkfifo`, and run `deno run -A src/main.ts --cwd <project> doctor`.
Both variants produced no output and exceeded a three-second subprocess timeout;
ordinary fixtures completed immediately.

Required correction: diagnose unsupported file types before opening/reading these
paths, including global and source/project configuration inputs. Preserve valid
symlinks to regular files, optional missing global configuration, independent
failure collection, and cancellation. Keep configuration validation owned by Conf.
Add regression tests that ensure FIFO inputs are rejected without opening them,
remaining independent checks run, and the final report exits 1. Run the required
per-file verification for implementation/test changes.

Review validation: 52 focused tests passed across doctor, installation, project,
configuration loading, runtime context, and main startup. Real command fixtures
passed outside a project and within a descendant directory (exit 0); simultaneous
missing ignore file, invalid local configuration, and invalid environment override
were all reported (exit 1). `git diff --check` passed. No implementation files were
modified during review.
