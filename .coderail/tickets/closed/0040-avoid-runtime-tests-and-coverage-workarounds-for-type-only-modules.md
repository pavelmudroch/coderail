---
id: "0040"
slug: "avoid-runtime-tests-and-coverage-workarounds-for-type-only-modules"
title: "Avoid runtime tests and coverage workarounds for type-only modules"
status: "closed"
created_at: "2026-11-11T21:03:57.792Z"
updated_at: "2026-11-11T21:10:14.044Z"
dependencies: []
reason: "done"
---

# Avoid runtime tests and coverage workarounds for type-only modules

Clarify skill guidance so agents do not create runtime tests for modules containing only types, or add executable production code merely to satisfy coverage. In the inspected loop, a type-only doctor report module received an empty-module import test and then a report constructor after coverage rejected the module. The existing verification configuration already gates tests and coverage on the corresponding test file existing; no verification-engine change is needed.

## Tasks

1. [x] Clarify when tests add meaningful behavioral validation
2. [x] Validate instruction consistency against type-only and runtime scenarios

## Task details

### 1. Clarify when tests add meaningful behavioral validation

Scope: `assets/instructions/skills/code/SKILL.md` and `assets/instructions/skills/ticket/SKILL.md`.

Expected outcome:

- Explain that modules containing only types do not need runtime tests merely to mirror type declarations or assert that their runtime exports are empty.
- Do not introduce runtime exports, helper constructors, or other production behavior solely to make a type-only module eligible for coverage or mutation testing.
- Qualify the ticket skill's test-task-first instruction: include test tasks where there is meaningful behavior to validate; do not manufacture a test task for a type-only change.
- Follow the project's configured verification. In this repository, a source file without a corresponding test file still receives linting/formatting through the general rule; test, coverage, and mutation commands are gated by their applicable rules and required paths.
- Preserve meaningful tests for executable behavior. Do not suggest deleting useful tests or weakening coverage thresholds to conceal failures.
- Keep this delivery limited to instruction changes; do not refactor the existing doctor report constructor or alter verification configuration.

Validation:

- Read the revised code and ticket skills together with `.coderail/config`; the guidance accurately describes the existing rule prerequisites.
- A type-only module without a corresponding test file calls for normal configured verification, without creating a placeholder runtime test or helper export.
- A module with executable behavior still calls for appropriate behavioral tests and applicable coverage/mutation checks.
- Ticket decomposition for a type-only change has independently verifiable tasks without an obligatory runtime-test task.

### 2. Validate instruction consistency against type-only and runtime scenarios

Scope: the instruction changes from task 1 and the observed loop examples.

Expected outcome:

- Review the wording against both a pure type export and a module that creates mutable report values.
- Ensure the distinction is based on useful behavioral validation rather than filenames such as `types.ts`.
- Record validation results in the ticket. Instruction-only changes do not require new application tests or source/test verification runs.

Validation:

- The pure type example does not lead an agent toward an empty-module assertion or production coverage workaround.
- The mutable report example retains meaningful tests for independent returned values when that runtime behavior is part of the intended implementation.
- The skill changes do not prescribe new CLI behavior, change mutation-result interpretation, or revisit ticket identifier handling.

## Validation results

- Task 1: Reviewed the revised code and ticket skills with `.coderail/config`. The general TypeScript rule provides linting/formatting; the source test/coverage rule requires the matching test file, and the paired test-file test/coverage/mutation rule requires the matching source file. The separate maintainer-tool test rule remains unaffected.
- Task 1: A pure export such as `export type Report = { skipped: string[] }` needs no runtime test, empty-export assertion, or helper constructor. Ticket decomposition can define a type declaration task validated through type correctness and configured verification without an obligatory runtime-test task.
- Task 2: Reviewed the observed loop's empty-module assertion and coverage-motivated constructor against the revised wording. Both workarounds are explicitly discouraged. This decision follows executable behavior rather than a `types.ts` filename.
- Task 2: Reviewed `createDoctorReport` and its independent-report test as context. When mutable report creation is intended behavior, testing empty initial values and independence after mutation remains meaningful. Existing production code and tests were preserved.
- Task 2: The changes only clarify instruction guidance; they do not change CLI behavior, verification configuration, mutation-result interpretation, or ticket identifier handling. No application tests or source/test verification runs are needed for these instruction-only changes.
- Verification: `cr verify -s assets/instructions/skills/code/SKILL.md assets/instructions/skills/ticket/SKILL.md` exited successfully; both Markdown files were skipped by the configured rules (`No tests found`). `git diff --check` also passed.

## References

- `assets/instructions/skills/code/SKILL.md` — minimum complete solution and unnecessary abstractions
- `assets/instructions/skills/ticket/SKILL.md` — test task placement
- `.coderail/config` — general lint rule and test-file prerequisites
- `src/commands/doctor/types.ts` and `tests/commands/doctor/types.test.ts` — motivating example, context only
- `.coderail/loop/20261111T111117361Z-59aa441c4191403a9e28d625c3c1ca10/0035.jsonl` — lines 43–58 show empty-module test attempts and the coverage-motivated constructor
- Related ticket: 0041, verification batching and autonomous task execution; independently implementable
