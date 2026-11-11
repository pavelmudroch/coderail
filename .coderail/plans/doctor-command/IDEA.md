---
title: "Doctor command"
status: "ready"
---

Explore implementation of `cr doctor` (`src/commands/doctor.ts`).

## Current understanding

- The command is registered but is a stub: argument parsing discards input,
  help handling is disabled, and execution does nothing.
- Its existing usage advertises diagnostics for setup and environment, plus an
  optional `--repair` flag. These are existing descriptions, not agreed scope.
- It currently does not require an initialized project.
- Existing installation manifest inspection and configuration loading may be
  reusable once the diagnostic scope is agreed.

## Readiness

- Consequential behavior, startup contract, module boundaries, reporting types,
  and verification expectations are agreed. No blocking design decisions remain.
- Keep this as one implementation-ready idea; no split or tickets are needed
  during exploration.

## Agreed scope

- Diagnose both Coderail installation health and project health.
- Keep one idea for now; split if complexity warrants independent concerns.
- Check installation first. Check the project only when cwd is within an
  initialized Coderail project (including descendant directories).
- Initial checks cover installation paths, launcher/PATH and managed files;
  project initialization/configuration; installed harness instruction integrity
  and availability of the configured harness executable.
- Outside a project, skip project checks without reporting a failure.
- Project detection uses the nearest ancestor (including cwd) containing a
  `.coderail` directory. Missing or invalid config or `.gitignore` does not
  disqualify it: diagnose incomplete initialization within that project.
- Collect all failures before presenting the failure list. Run independent checks
  despite earlier failures; installation checks precede applicable project checks.
- Every failure has a required `repairable: boolean` indicating automatic repair
  capability. All failures initially use `false`; automatic repair implementation
  is outside the initial scope.
- List every collected failure with applicable manual repair options, and mark
  automatically repairable failures explicitly when present.
- Agreed failure shape: `DoctorFailure = { message: string; repairable: boolean;
  manualRepair: string[] }`.
- Independent checks continue after failures. Checks requiring unavailable
  information are reported as skipped rather than generating speculative failures.
- Exit code is 1 when failures are found, otherwise 0. Skipping project checks
  because cwd is outside a project does not cause a nonzero exit.
- Keep `--repair` in help. When supplied, throw an error with message
  `not implemented`; automatic repairs are not implemented in this version.
- Source mode is development-only: check repository resources/configuration,
  skipping compiled-distribution manifest, launcher and PATH checks.
- In compiled mode check distribution manifest, owned files, launcher and PATH.
- Missing optional instructions/templates and uninstalled harnesses are valid.
- Missing or modified manifest-owned files are failures. Check executable
  availability only for the configured harness; skip when none is configured.

## Agreed structure

- `src/main.ts`: `runBootstrapMode` dispatches doctor before normal startup.
- `src/commands/doctor.ts`: bootstrap input type, argument parsing, orchestration,
  configuration loading/fallback, final rendering and exit status.
- `src/commands/doctor/installation.ts`: installation diagnostics.
- `src/commands/doctor/project.ts`: project discovery and project diagnostics.
- `src/commands/doctor/types.ts`: shared DoctorFailure and DoctorReport types.
- Each diagnostic phase returns `DoctorReport = { failures: DoctorFailure[];
  skipped: string[] }`; it collects operational errors as findings and propagates
  cancellation. Helpers receive resolved paths/settings and AbortSignal.
- Reuse Conf for validation/default settings and existing manifest/harness
  mechanisms rather than duplicating their formats or location rules.

## Agreed verification expectations

- Bootstrap dispatch bypasses eager context/config loading; normal commands retain
  existing startup behavior. Doctor uses valid configuration or reports failure and
  falls back to defaults with explicit global flags preserved.
- Installation checks precede project discovery/checks. Cover nested cwd, no
  project, incomplete initialization, and discovery/read permission failures.
- Cover compiled/source layouts, optional absent resources, missing/malformed
  manifests, missing/modified owned files, launcher/PATH failures, global/local
  harness instruction manifests, and configured executable availability.
- Confirm independent failures accumulate and render only after collection, with
  manual instructions and repairable markers; blocked checks render as skipped.
- Confirm healthy/failing exit codes, --help, unknown arguments, --repair error,
  cancellation, and absence of repairs or harness session execution.
- Run `cr verify` for every modified src/tests file as required by AGENTS.md.

## Startup contract and investigation

- Configuration is loaded in `src/main.ts` before command execution. Invalid
  configuration currently prevents doctor from running; diagnostics will need
  a path that can report this failure and continue independent checks.
- Agreed bootstrap behavior: skip normal configuration loading before doctor.
  Doctor loads configuration within its run method, uses it when loading succeeds,
  and uses defaults when loading fails while reporting the error.
- User preference: leave the shared Command interface unchanged; isolate bootstrap
  dispatch in a `runBootstrapMode` function in main and pass arguments without
  preconstructed runtime/configuration context.
- Agreed typing: doctor accepts either normal RunContext (satisfying Command)
  or a separate BootstrapRunContext containing parsed command arguments, global
  arguments and AbortSignal. Bootstrap input omits runtime/configuration fields
  rather than supplying falsely typed empty objects. Main dispatches doctor before
  normal context/configuration construction. Bootstrap dispatch recognizes Doctor
  directly; no configurationMode property is added to Command.
- Shared construction of fallback defaults and reusable configuration validation
  should remain owned by Conf. Preserve explicit global CLI flags on fallback.
  Failed configuration loading discards partially merged settings and uses
  defaults plus explicit global CLI flags.
- Runtime context creation still performs filesystem discovery before execution;
  unreadable project markers/install paths can fail there. Its diagnostic
  behavior must defer project discovery until installation checks finish and
  collect discovery errors as findings rather than preventing diagnostics.

## Agreed failure rules and implementation freedom

- Use failures and skips for this version, without a separate warning severity.
- Missing optional global config is valid. Within a detected project, missing
  config or a missing/incomplete `.gitignore` is an initialization failure,
  using the same required ignore lines as init/runtime.
- Invalid or unreadable configuration and invalid environment overrides are
  failures. If configuration loading fails, use defaults plus explicit global
  flags rather than retaining partially merged settings. Independently validate
  available configuration sources so one malformed source does not hide others.
- Failed project discovery is a finding, not evidence that there is no project;
  skip dependent project checks after recording it.
- Missing/malformed distribution manifests in compiled mode, broken launchers,
  absent installation bin on PATH, changed/missing owned files, and unreadable
  check targets are failures. Keep checks local; no release downloads or harness
  sessions are needed.
- An unknown configured harness or unavailable configured executable is a failure;
  absent harness instruction manifests simply mean nothing is installed there.
- Exact helper names/parameters, output wording/order within each phase, and
  test fixture organization remain implementation choices within agreed boundaries.
