---
id: "0027"
slug: "repair-initialized-project-ignore-rules-and-discovery"
title: "Repair initialized project ignore rules and discovery"
status: "open"
created_at: "2026-11-10T09:06:46.591Z"
updated_at: "2026-11-10T09:06:46.591Z"
dependencies: []
---

# Repair initialized project ignore rules and discovery

Make runtime output safely ignored and require the nearest Coderail project to
have the agreed initialization markers. Existing projects can repair themselves
by rerunning `cr init`; all commands requiring initialization share this check.

## Tasks

1. [ ] Add initialization repair and nearest-project regression tests
2. [ ] Create and idempotently repair the managed ignore file
3. [ ] Validate initialization at the nearest project boundary
4. [ ] Verify modified files and document the migration

## Task details

### 1. Add initialization repair and nearest-project regression tests

Scope: `tests/commands/init.test.ts`, `tests/runtime/context.test.ts`, and existing
command fixtures affected by the stronger shared initialization requirement.

Expected outcome: cover missing ignore files, partial/custom files, repeated init,
and discovery from nested directories. Include an incomplete nearest project
inside a valid parent: initialization-required commands reject that nearest
project with `cr init` guidance instead of falling back to the parent. Init and
other commands without the requirement remain runnable for repair.

Validation: assertions cover exact required lines, byte-stable repeated repair,
custom content preservation, `*` prepending even when already present later,
missing exceptions appended after custom rules, and acceptance of additional
custom lines without interpreting their meaning. A temporary Git repository
proves runtime files are ignored while config, plans, nested plan content,
tickets, nested ticket content, and the ignore file remain eligible for tracking.
Already tracked runtime content stays tracked.

### 2. Create and idempotently repair the managed ignore file

Scope: `src/commands/init.ts`; a private shared helper for required lines is
allowed. Leave repository-root ignore files and Git's local exclude untouched.

Expected outcome: init creates or repairs `.coderail/.gitignore`, preserving
custom content. Ensure `*` is first, prepending it when necessary; append each
missing required exception. The required content is:

```gitignore
*
!.gitignore
!coderail.conf
!plans/
!plans/**
!tickets/
!tickets/**
```

Validation: task 1's repair and Git tracking assertions pass. Repeated init adds
no further lines once requirements are met; no untracking operation is performed.

### 3. Validate initialization at the nearest project boundary

Scope: `findRepositoryRoot` and context creation in `src/runtime/context.ts`,
reusing the same required-line definition as init where useful.

Expected outcome: stop discovery at the nearest `.coderail` directory. Require
its ignore file to have `*` first and all exception lines present before treating
it as initialized for commands with `requiresInit`. Report incomplete nearest
initialization clearly; preserve repair behavior for init and existing root/path
resolution contracts for other commands. Do not implement a general ignore-rule
interpreter or reject custom lines based on hypothetical conflicts.

Validation: all discovery and incomplete-project cases from task 1 pass, including
filesystem-root discovery and commands without initialization requirements.
Update existing test fixtures to model complete initialization where needed.

### 4. Verify modified files and document the migration

Scope: all source/test files actually changed and `README.md` initialization
instructions.

Expected outcome: explain that existing projects rerun `cr init`, runtime output
is ignored, tracked files are not automatically removed, and incomplete nearest
projects are not bypassed. Record successful verification in implementation notes.

Validation: run `cr verify ./src/<path-to-file>.ts` for each modified source file
and `cr verify ./tests/<path-to-file>.test.ts` for each modified test file; fix
failures and repeat until passing. Confirm docs match the tested behavior.

## References

- [Approved idea: output files and initialization](../../plans/loop-command/IDEA.md#agent-output-file-design)
- [Init command](../../../src/commands/init.ts)
- [Runtime context](../../../src/runtime/context.ts)
- [Init tests](../../../tests/commands/init.test.ts)
- [Context tests](../../../tests/runtime/context.test.ts)
- [Repository verification instructions](../../../AGENTS.md)
- Consumer: ticket 0030, the implementation loop.
