---
id: "0042"
slug: "repair-doctor-project-initialization-with-collected-actions"
title: "Repair doctor project initialization with collected actions"
status: "open"
created_at: "2026-11-12T10:20:41.650Z"
updated_at: "2026-11-12T10:20:41.650Z"
dependencies: []
---

# Repair doctor project initialization with collected actions

Make `cr doctor --repair` usable by repairing missing project configuration and required ignore rules through a reusable collect/apply/recheck flow. Preserve bootstrap diagnostics when configuration is invalid.

## Tasks

1. [ ] Add behavioral coverage for project repairs and repair execution
2. [ ] Share project initialization behavior across init, runtime and doctor
3. [ ] Implement collected repair actions and doctor orchestration
4. [ ] Connect initialization findings to guarded repairs and verify

## Task details

### 1. Add behavioral coverage for project repairs and repair execution

Scope: doctor command, project, repair-runner, init and runtime-context tests; add focused new test files where appropriate.

Expected outcome:

- Cover missing config, missing/incomplete ignore rules, existing configuration preservation, unrelated ignore lines, nested cwd and absence of a discovered project.
- Cover plain diagnostics without writes; non-interactive repair without prompts; deduplication by action key; partial failure; cancellation stopping subsequent actions without rollback; repeated invocation without healthy-file rewrites.
- Cover changed input and newly created destinations, one recheck without recursively repairing new findings, installation-before-project ordering on both passes, and invalid-config bootstrap operation.
- Assert collected final Log.output results, verbose-only stderr context, attempted action errors even if rechecking finds a healthy state, and exit status determined solely by final diagnostics.

Validation: run focused behavioral tests to demonstrate the intended failing cases before implementation; after tasks 2–4 the same cases pass.

### 2. Share project initialization behavior across init, runtime and doctor

Scope: new `src/project-initialization.ts`, `src/commands/init.ts`, `src/runtime/context.ts`, and existing project diagnostics.

Expected outcome: export `ProjectInitialization.ensureConfig(projectRoot: string, signal: AbortSignal): Promise<void>` and `ensureIgnoreRules(projectRoot: string, signal: AbortSignal): Promise<void>`. Share the existing default config and required ignore lines with init, runtime validation and doctor. Preserve init output/template behavior, existing config and unrelated ignore content. Do not invoke init as a nested command or initialize outside doctor's existing discovery contract.

Validation: task 1 fixtures show identical defaults/required rules across consumers, established init behavior, cancellation and no unnecessary writes. Existing invalid config remains for configuration diagnostics rather than replacement.

### 3. Implement collected repair actions and doctor orchestration

Scope: `src/commands/doctor/types.ts`, new `repairs.ts`, and `src/commands/doctor.ts`.

Expected outcome:

- Preserve DoctorReport and existing failure fields; add optional `repair?: DoctorRepair`, where `DoctorRepair = { key: string; description: string; apply(signal: AbortSignal): Promise<void> }`. Findings are repairable exactly when an action exists.
- Export `runRepairs(actions: DoctorRepair[], signal: AbortSignal): Promise<DoctorRepairResult[]>`; results contain key, description and optional error message. Catch independent action failures; propagate cancellation.
- Replace the rejection of --repair with collection, stable-key deduplication, one action pass, then one full diagnostic pass. Plain doctor only collects. Preserve installation-before-project ordering and bootstrap configuration/global flag behavior.
- Render action descriptions, repaired/unresolved outcomes, useful error paths and attempted action errors through collected Log.output; keep progress on verbose stderr. Final failures determine exit 0/1.

Validation: runner and command tests from task 1 pass, including shared actions, partial failure, cancellation, no recursive repair and final-status edge cases. Shared Command and harness connector APIs stay unchanged.

### 4. Connect initialization findings to guarded repairs and verify

Scope: `src/commands/doctor/project.ts` and integration fixtures.

Expected outcome: attach actions only for supported missing config and missing/incomplete ignore rules. Revalidate the collected input immediately before writing; fail rather than replace changed content or newly occupied destinations. Unsupported file/access/config problems retain manual guidance. Preserve invalid configuration and healthy files.

Validation: task 1 suites pass with real shared initialization helpers; run `cr verify` individually for every modified/new src or tests file per AGENTS.md, fixing failures until each passes.

## References

- [Agreed repair specification](../../plans/doctor-command---repair-flag/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [src/commands/doctor.ts](../../../src/commands/doctor.ts)
- [src/commands/doctor/types.ts](../../../src/commands/doctor/types.ts)
- [src/commands/doctor/project.ts](../../../src/commands/doctor/project.ts)
- [src/commands/init.ts](../../../src/commands/init.ts)
- [src/runtime/context.ts](../../../src/runtime/context.ts)
- [tests/commands/doctor.test.ts](../../../tests/commands/doctor.test.ts)
- [tests/commands/init.test.ts](../../../tests/commands/init.test.ts)
