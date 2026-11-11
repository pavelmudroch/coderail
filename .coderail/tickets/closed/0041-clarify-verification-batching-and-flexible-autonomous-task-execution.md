---
id: "0041"
slug: "clarify-verification-batching-and-flexible-autonomous-task-execution"
title: "Clarify verification batching and flexible autonomous task execution"
status: "closed"
created_at: "2026-11-11T21:03:57.928Z"
updated_at: "2026-11-11T21:15:36.094Z"
dependencies: []
reason: "done"
---

# Clarify verification batching and flexible autonomous task execution

Make the implementation workflow explicit about efficient verification, preserving failure status, and flexible task execution. The inspected loop repeatedly verified overlapping source/test pairs in separate invocations and used shell loops whose successful final iteration hid earlier failures in the shell exit status. It also interleaved tests and implementation despite instructions requiring strict numbered execution. Preserve acceptance criteria and closure safeguards while allowing practical execution order.

## Tasks

1. [x] Clarify batched verification and reliable failure handling
2. [x] Relax autonomous task order while preserving completion criteria
3. [x] Validate the revised workflow against observed failure scenarios

## Task details

### 1. Clarify batched verification and reliable failure handling

Scope: `assets/instructions/skills/implement/SKILL.md`, `assets/instructions/skills/mentor/SKILL.md`, and the verification guidance in `assets/instructions/skills/compass/SKILL.md`.

Expected outcome:

- Prefer a single `cr verify -s <changed-files...>` invocation with explicit relevant file paths, followed by `cr verify <failed-file>` for failure details.
- Explain that a combined invocation reuses duplicate command results and runs preparation once rather than repeating it separately for overlapping source/test checks.
- Preserve repository-specific verification requirements. Include every required modified file, and honor explicit requirements for separate invocations where present; do not silently replace stricter instructions.
- Avoid shell loops that return only the last verification's status. Prefer the CLI's multi-path invocation; if separate invocations are necessary, stop on failure or accumulate failure status so any failure makes the overall operation fail.
- After corrections, repeat relevant verification and complete the final required aggregate check before closure. Avoid redundant broad reruns without edits, failures, or unresolved concerns.
- Continue excluding ticket files and unrelated unchanged files from implementation verification.
- In mentoring, retain user ownership of corrections and readiness; verification guidance does not authorize implementation edits by the mentor.

Validation:

- A batch with one failed file and a passing final file cannot be treated as successful because the shell's final command returned zero.
- The default documented flow starts with short aggregate output and opens detailed output for failed files.
- A changed source file and its corresponding changed test file remain explicitly in scope while shared checks can be reused in the same invocation.
- Explicit repository requirements take precedence over the batching preference.

### 2. Relax autonomous task order while preserving completion criteria

Scope: `assets/instructions/skills/implement/SKILL.md` and the corresponding workflow guidance in `assets/instructions/skills/compass/SKILL.md`.

Expected outcome:

- Replace strict numbered execution requirements with a recommended order that permits interleaving or reordering tasks when dependencies and practical implementation needs justify it.
- Treat numbered tasks as scope and validation checkpoints; every task must still satisfy its criteria before it is marked complete.
- Keep incomplete tasks unchecked, maintain accurate progress, and close only after all tasks and required verification pass.
- Preserve declared ticket dependencies and explicit task prerequisites.
- Keep the mentor workflow's user-controlled review and advancement gates; autonomous ordering flexibility must not bypass them.
- Preserve test-first task presentation as a planning convention where applicable, without requiring every test task to be fully passing before related implementation can begin.

Validation:

- An agent may add tests, implement behavior needed to pass them, and return to extend the tests without violating the revised autonomous workflow.
- Reordering never authorizes skipping requirements or marking failed or unvalidated work complete.
- The implement boundary, completion procedure, and compass guidance do not contradict one another about autonomous task order.
- Mentoring still waits for user readiness before review or advancement.

### 3. Validate the revised workflow against observed failure scenarios

Scope: all instruction changes from tasks 1 and 2.

Expected outcome:

- Review the revised workflow using the recorded masked failures, overlapping checks, and interleaved implementation as concrete scenarios.
- Record validation results in this ticket; instruction-only changes do not need new application tests or source/test verification runs.
- Keep ticket-ID handling and mutation classification outside this delivery.

Validation:

- The two shell batches at log lines 43 and 54 are clearly discouraged because they return zero despite failed checks.
- The recommended workflow preserves all required file validation with fewer separate invocations when local instructions permit batching.
- The test/implementation interleaving in the original delivery is allowed, while the final all-tasks-complete and verification-passing closure gates remain mandatory.
- `git diff --check` passes for changed instruction files.

## References

- `assets/instructions/skills/implement/SKILL.md` — task ordering and summary-first verification
- `assets/instructions/skills/mentor/SKILL.md` — verification and user readiness gates
- `assets/instructions/skills/compass/SKILL.md` — workflow and verification guidance
- `AGENTS.md` — repository-specific verification requirements
- `src/commands/verify.ts` and `.coderail/config` — multi-path verification and configured checks, context only
- `.coderail/loop/20261111T111117361Z-59aa441c4191403a9e28d625c3c1ca10/0035.jsonl` — lines 43 and 54 mask failed checks; line 77 records the final successful aggregate verification and completion updates
- Related ticket: 0040, type-only module test guidance; independently implementable

## Validation results

- Reviewed log lines 43 and 54: both use `for file ...; do cr verify "$file"; done`, contain failed checks, and report exit code zero after the final file passes. All three revised skills explicitly discourage this pattern and require stopping on failure or accumulating failure status when separate invocations are necessary. A passing final file cannot validate the batch.
- Reviewed log line 77: the successful aggregate explicitly includes changed source and test paths. The revised default starts with `cr verify -s <changed-files...>` and uses `cr verify <failed-file>` for failure details. Source/test rule overlap in `.coderail/config` and the documented CLI reuse behavior confirm that batching preserves file scope while reusing shared checks and preparation.
- Repository-specific requirements remain authoritative, including required separate invocations. Ticket files and unrelated unchanged files remain excluded; no pre-existing staged source changes were modified or verified for this delivery.
- Walked through adding tests, implementing behavior, then extending tests: autonomous implementation now permits this interleaving while respecting dependencies and explicit prerequisites. Incomplete or failing tasks remain unchecked, and all tasks plus final required verification must pass before closure. Implement boundary, completion steps, and compass guidance agree.
- Mentor retains numbered progression, user-owned implementation and corrections, and readiness gates before review or advancement. Batching does not authorize mentor implementation edits or autonomous advancement.
- `git diff --check` passed for all three changed instruction files. No application tests or source/test verification runs are needed for this instruction-only change. Ticket-ID handling and mutation classification remain outside this delivery.
- Final `cr verify -s` with the three explicit changed instruction paths exited zero, reporting all three as `skipped` and `No tests found` because no configured rules apply to Markdown. This is not application-test validation; the instruction criteria were validated by the scenario review and whitespace check above.
