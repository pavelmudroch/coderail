---
id: "0051"
slug: "confirm-conflicting-template-asset-overwrites"
title: "Confirm conflicting template asset overwrites"
status: "closed"
created_at: "2026-11-12T13:49:34.632Z"
updated_at: "2026-11-12T14:30:55.619Z"
dependencies:
  - "0050"
reason: "done"
---

# Confirm conflicting template asset overwrites

Allow users to resolve asset conflicts through `cr init --force [--yes | --no]` while preserving preflight and skip semantics. Depends on 0050 to order changes to shared application/command coverage after startup integration.

## Tasks

1. [x] Specify overwrite decisions and CLI flag behavior in tests
2. [x] Add preflight overwrite decisions to template application
3. [x] Wire init flags and interactive confirmation

## Task details

### 1. Specify overwrite decisions and CLI flag behavior in tests

Scope: `tests/templates/apply.test.ts` and `tests/commands/init.test.ts`.

Expected outcome: cover default rejection, force prompting, all accepted/declined/mixed decisions, automatic yes/no, file/directory mismatches with force, and noninteractive operations. Capture filesystem state when each callback runs to prove all required answers are collected before any writes for that template.

Validation: declines preserve the existing file but permit remaining copies, config merging, startup, and subsequent templates. Missing required interactive answers fail before the template's writes with automatic-answer guidance. Yes/no require force and are mutually exclusive. Establish failures before tasks 2–3 and verify affected tests after implementation.

### 2. Add preflight overwrite decisions to template application

Scope: `src/templates/apply.ts`, using the existing `ApplyOptions.overwrite` contract.

Expected outcome: invoke the supplied async callback for differing-file conflicts only, after layout/config validation and before copying. Accepting permits overwrite; declining emits skip and continues. Identical files and merging directories need no decision. File/directory mismatches remain errors even with an affirmative callback. A callback failure or abort prevents that template's copying; later application errors preserve already written changes.

Validation: task 1 callback/order and skip fixtures pass, including config/startup after decline and unchanged earlier-template preservation. Run per-file source verification.

### 3. Wire init flags and interactive confirmation

Scope: `src/commands/init.ts` and init documentation in `docs/COMMANDS.md`; follow existing install/uninstall flag conventions.

Expected outcome: validate `--force`, `--yes`, and `--no` and their combinations; map normal mode to `overwrite: 'error'`, force to a confirmation callback, and automatic answers to constant callbacks. Force enables prompts; it does not authorize overwriting by itself. Respect configured noninteractive mode and terminal availability, failing with actionable guidance only when an unanswered decision is required. Keep deletion's separate `--yes` behavior unchanged.

Validation: task 1 command tests cover flag errors, interactive acceptance/decline, automatic answers, noninteractive failure, and no prompt for conflict-free application. Run AGENTS.md verification on every modified source/test file and resolve failures.

## References

- [Approved template behavior](../../plans/templates/IDEA.md)
- [Agreed module boundaries and public interfaces](../../plans/templates/DESIGN.md)
- [Per-file verification requirements](../../../AGENTS.md)
- Dependency: [0050 — Template startup](0050-run-template-startup-scripts-after-applying-project-files.md)
- `src/commands/init.ts`, `src/commands/install.ts`, `src/commands/uninstall.ts`
- `src/templates/apply.ts`, `tests/templates/apply.test.ts`, `tests/commands/init.test.ts`
