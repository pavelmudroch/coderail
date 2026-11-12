---
id: "0050"
slug: "run-template-startup-scripts-after-applying-project-files"
title: "Run template startup scripts after applying project files"
status: "closed"
created_at: "2026-11-12T13:49:32.252Z"
updated_at: "2026-11-12T14:26:12.076Z"
dependencies:
  - "0049"
reason: "done"
---

# Run template startup scripts after applying project files

Complete each template's assets → config → startup lifecycle before starting the next template. Depends on 0049 for the application flow.

## Tasks

1. [x] Specify startup selection, execution, and failure behavior in tests
2. [x] Implement startup lifecycle and integrate sequential application

## Task details

### 1. Specify startup selection, execution, and failure behavior in tests

Scope: new `tests/templates/startup.test.ts`; extend `tests/templates/apply.test.ts` and command integration coverage where useful.

Expected outcome: deterministic selection fixtures cover Unix `startup.sh` and Windows `startup.ps1` precedence over `startup.ts`, TypeScript fallback, only nonmatching-platform scripts, and no scripts. Integration scripts consume copied files and merged settings from the target root, leave observable changes, and demonstrate ordering across templates.

Validation: assert only one selected script runs, scripts see completed assets/config, startup does not run after preflight/copy/config failure, missing interpreters and nonzero exits fail, and startup failure preserves changes but blocks later templates. Cover AbortSignal cancellation terminating the child and preventing subsequent work. Establish these tests before task 2; use platform-independent selection tests and appropriate native execution fixtures.

### 2. Implement startup lifecycle and integrate sequential application

Scope: new `src/templates/startup.ts`, `src/templates/apply.ts`, startup documentation in `docs/COMMANDS.md`.

Expected outcome: select the matching platform script before TypeScript, invoking `sh`, `pwsh`, or `deno run -A` with the project root as cwd and inherited output streams. Keep invocation details private. Run no script when none applies. Add startup actions to reports and invoke startup only after copying and config persistence, completing it before the next template. Propagate cancellation and contextual failures; do not roll back script, copied-file, or config changes.

Validation: task 1 startup and application tests pass; confirm actual script effects and target cwd through fixtures, and unchanged default conflict behavior. Run `cr verify` for every modified source/test file, correcting failures until passing.

## References

- [Approved template behavior](../../plans/templates/IDEA.md)
- [Agreed module boundaries and public interfaces](../../plans/templates/DESIGN.md)
- [Per-file verification requirements](../../../AGENTS.md)
- Dependency: [0049 — Safe template application](0049-apply-template-assets-and-configuration-during-initialization.md)
- `src/templates/apply.ts` and `tests/templates/apply.test.ts` introduced by 0049
- `src/commands/helpers/command.ts`, existing child-process/AbortSignal conventions, `docs/COMMANDS.md`
