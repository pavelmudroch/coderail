---
id: "0052"
slug: "preview-template-initialization-and-support-alternate-dry-targets"
title: "Preview template initialization and support alternate dry targets"
status: "closed"
created_at: "2026-11-12T13:49:38.184Z"
updated_at: "2026-11-12T14:36:56.946Z"
dependencies:
  - "0051"
reason: "done"
---

# Preview template initialization and support alternate dry targets

Complete both `cr init --dry` modes: a read-only preview without a directory and real initialization into an optional alternate directory. Depends on 0051 for the complete application, startup, and overwrite behavior reused by these modes.

## Tasks

1. [x] Specify dry argument parsing and both execution modes in tests
2. [x] Implement sequential read-only initialization preview
3. [x] Wire optional dry paths and alternate-target initialization

## Task details

### 1. Specify dry argument parsing and both execution modes in tests

Scope: `tests/templates/apply.test.ts`, `tests/project-initialization.test.ts`, and `tests/commands/init.test.ts`.

Expected outcome:

- Cover `cr init my-template --dry`, `cr init my-template --dry ./preview`, `cr init --dry my-template` consuming a directory rather than a template, and an option immediately after `--dry` leaving the path absent; preserve existing `--` conventions.
- Preview reports copies, skips, conflicts, config changes, and selected startup actions without writing, prompting, or starting processes, including on a missing project/base structure. Include scripts that would fail without assets to prove they never execute.
- Cover conflicts across multiple templates against simulated preceding assets/config, including identical assets and cumulative scalar/array/comment merges. Preview reports all known asset conflicts and failure status despite valid force/automatic-answer combinations.
- Alternate targets cover existing/missing directories, relative paths under global `--cwd`, actual merged output and startup cwd, accepted/declined overwrites, noninteractive errors, and target creation failure.

Validation: establish assertions before implementation; inspect filesystem/process/prompt effects as well as reports and exit status. Verify all changed test files after tasks 2–3.

### 2. Implement sequential read-only initialization preview

Scope: `src/templates/apply.ts` and `src/project-initialization.ts`.

Expected outcome: implement `mode: 'preview'` throughout initialization without creating the target, `.coderail`, config, ignore files, or assets. Maintain an in-memory view of planned assets/config across templates using the real comparison and merge rules. Return all known conflicts and useful actions, including startup selection without execution; never invoke overwrite callbacks. Report only known file/config effects and do not simulate arbitrary startup effects. Preserve validation failures and cancellation behavior.

Validation: task 1 preview tests pass; cumulative config output agrees with applying script-free fixtures, and filesystem/prompt/process spies show no effects even with force/automatic-answer flags. Run per-file source verification.

### 3. Wire optional dry paths and alternate-target initialization

Scope: `src/commands/init.ts`, init help and `docs/COMMANDS.md`; adjust ProjectInitialization only where necessary for alternate-target creation.

Expected outcome: parse `--dry` with its optional next non-option directory; resolve relative targets against the effective working directory from global `--cwd`. Bare dry selects preview and reports failure if any conflicts exist. A supplied directory selects full application, reusing or creating that directory and running base setup, asset/config operations, and startup there under normal confirmation rules. Help includes unambiguous template-before-dry examples and explains preview limits. Keep yes/no flag validation consistent in both modes.

Validation: task 1 parsing and end-to-end fixtures pass, including no templates, effective cwd, actual startup output in the alternate target, and unchanged original working directory. Run AGENTS.md per-file verification for all modified source/test files, fixing failures until passing.

## References

- [Approved template behavior](../../plans/templates/IDEA.md)
- [Agreed module boundaries and public interfaces](../../plans/templates/DESIGN.md)
- [Per-file verification requirements](../../../AGENTS.md)
- Dependency: [0051 — Overwrite confirmation](0051-confirm-conflicting-template-asset-overwrites.md)
- `src/commands/init.ts`, `src/project-initialization.ts`, `src/templates/apply.ts`
- `tests/commands/init.test.ts`, `tests/project-initialization.test.ts`, `tests/templates/apply.test.ts`, `docs/COMMANDS.md`
