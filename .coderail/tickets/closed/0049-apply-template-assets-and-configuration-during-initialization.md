---
id: "0049"
slug: "apply-template-assets-and-configuration-during-initialization"
title: "Apply template assets and configuration during initialization"
status: "closed"
created_at: "2026-11-12T13:49:29.717Z"
updated_at: "2026-11-12T14:21:54.820Z"
dependencies:
  - "0047"
  - "0048"
reason: "done"
---

# Apply template assets and configuration during initialization

Replace simulated installation with real asset copying and persistent config merging through `cr init <template> ...`. Dependencies 0047 and 0048 supply document APIs and the validated catalog. Startup execution is delivered by 0050; overwrite controls by 0051; dry modes by 0052.

## Tasks

1. [x] Specify safe initialization and sequential application in tests
2. [x] Implement default-conflict template application
3. [x] Integrate application with ProjectInitialization and init

## Task details

### 1. Specify safe initialization and sequential application in tests

Scope: new `tests/templates/apply.test.ts`; extend `tests/project-initialization.test.ts` and `tests/commands/init.test.ts`.

Expected outcome: fixtures cover new/existing projects, multiple templates, nested assets, existing directories, identical files, differing-file conflicts, file/directory mismatches, invalid layout/settings, config/comment merging, repeated application, cancellation, and I/O failure boundaries.

Validation: assert a default conflict anywhere in a template prevents all that template's assets/config writes, invalid settings fail before copying, earlier templates stay applied after a later failure, and subsequent templates never run. Establish behavioral failures before tasks 2–3 and verify modified tests after implementation.

### 2. Implement default-conflict template application

Scope: new `src/templates/apply.ts`, plus application exports/types in `src/templates.ts`.

Expected outcome:

- Implement the apply-mode/default-error portion of the DESIGN.md contract: `ApplyOptions`, `TemplateAction`, `TemplateReport`, and `Templates.apply`. Keep remaining mode/overwrite contracts ready for their dependent tickets without claiming unfinished behavior.
- Process names in command-line order. Validate each template's required layout and settings using the catalog and `Conf.validateConfiguration`; parse participating config documents separately.
- Preflight every asset before copying; identical files are satisfied, directories merge, and differing files or file/directory mismatches fail by default. Preserve relative asset paths within the target using repository path conventions.
- Copy assets, merge project/template documents through Conf, and persist the final serialized config. Later templates override scalars and append normalized arrays/comments. Return meaningful copy/merge/skip actions.
- Any validation/application/I/O error stops later templates with useful context and no rollback; earlier or partial I/O changes remain. Honor cancellation between work units.

Validation: task 1 application tests pass, including no partial copying on default conflicts, comment persistence, equivalent repeated configuration application, and failure sequencing. Run per-file source verification.

### 3. Integrate application with ProjectInitialization and init

Scope: `src/project-initialization.ts`, `src/commands/init.ts`, and init documentation in `docs/COMMANDS.md`.

Expected outcome: add `ProjectInitialization.initialize(options: ApplyOptions): Promise<TemplateReport>` owning base `.coderail` creation/config/ignore setup and delegating application. Keep `ensureConfig` and `ensureIgnoreRules` compatible with doctor. Replace the fake delayed installer; target the effective working directory selected by global `--cwd`, supply runtime installation root and AbortSignal, and render meaningful outcomes. Preserve template-free initialization and existing config/ignore behavior.

Validation: task 1 integration tests pass, including no-template initialization, existing-project preservation, multiple names, effective cwd, errors, and cancellation. Existing initialization and affected doctor regressions pass. Run AGENTS.md verification for every source/test file changed and fix failures until passing.

## References

- [Approved template behavior](../../plans/templates/IDEA.md)
- [Agreed module boundaries and public interfaces](../../plans/templates/DESIGN.md)
- [Per-file verification requirements](../../../AGENTS.md)
- Dependencies: [0047 — Configuration documents](0047-preserve-and-merge-configuration-documents-for-templates.md), [0048 — Template management](0048-manage-installation-templates-through-the-cli.md)
- `src/commands/init.ts`, `src/project-initialization.ts`, `src/runtime/context.ts`
- `tests/commands/init.test.ts`, `tests/project-initialization.test.ts`, doctor callers
- Follow-ups: 0050 startup, 0051 overwrite decisions, 0052 dry modes
