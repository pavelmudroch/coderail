---
id: "0031"
slug: "review-loop-iterations-and-reselect-recorded-follow-up-work"
title: "Review loop iterations and reselect recorded follow-up work"
status: "closed"
created_at: "2026-11-10T09:06:53.780Z"
updated_at: "2026-11-10T12:20:36.568Z"
dependencies:
  - "0030"
reason: "done"
---

# Review loop iterations and reselect recorded follow-up work

Add opt-in review between successful implementation and staging. Review records
urgent work on a reopened original ticket or deferred work in a new ticket;
normal ready-ticket selection then drives implementation of that work.

## Tasks

1. [x] Add review CLI, settings, and preflight tests
2. [x] Add review boundary, findings, ordering, and failure tests
3. [x] Integrate review invocation and findings-driven reselection
4. [x] Document review behavior and verify modified files

## Task details

### 1. Add review CLI, settings, and preflight tests

Scope: `tests/commands/loop.test.ts` and focused loop suites.

Expected outcome: plain loop leaves review disabled; `-r`/`--auto-review` enables
it. Reject unexpected values on boolean flags. Resolve native review model and
effort via ticket 0029's helper. Include review in preflight only when enabled.

Validation: invalid enabled review settings fail before implementation; distinct
implement/review combinations each probe once and identical combinations share a
probe. All enabled probes complete before the first implementation. Codex and
Claude use the same selected harness throughout.

### 2. Add review boundary, findings, ordering, and failure tests

Scope: fake clean-review, immediate-fix, and deferred-follow-up outcomes plus
temporary Git repositories in `tests/commands/loop/`.

Expected outcome: invoke review only after successful implementation/closure and
before staging. Review targets current unstaged changes and new untracked files
inside the initialized subtree, including same-file changes against accumulated
staged work. Prior staged work is context and remains unchanged until loop staging.
Include selected ticket context and use a fresh session without inherited chat.

Validation: clean review leaves completion intact; urgent findings add actionable
tasks and reopen the original; deferred findings create a new ticket. Successful
recorded findings proceed to staging and reselection. Cover immediate reselection
of a reopened lower-ID ticket, ready follow-ups, dependent tickets becoming blocked
again, repeated attempts appending to the same log, and `--limit 1 -r` staging the
review outcome before a successful limit stop. Do not reapply the implementation
closure requirement after review has legitimately reopened the ticket. Failed
review session, invalid resulting ticket state, log failure, or cancellation
stops before staging/next implementation, preserving resulting work.

### 3. Integrate review invocation and findings-driven reselection

Scope: `src/commands/loop.ts`, `src/commands/loop/run-loop.ts`, and existing
private prompt/reporting helpers under `src/commands/loop/`.

Expected outcome: enable the flag and review settings/preflight wiring. Invoke
the user-supplied review skill with the current iteration's change boundary and
selected ticket context; require index preservation. Tell review to record urgent
fixes as tasks on the reopened original and deferred fixes as follow-up tickets,
choosing by urgency rather than scope alone. Review does not implement fixes.
Treat successful invocation with valid resulting ticket state as normal; impose
no separate machine-readable findings protocol and no immediate fix invocation.

Use existing streamed stage execution/disposal and write `step: 'review'` records
to the selected ticket's JSONL file. Show `Reviewing...` and contextual permanent
status/duration output. Stage after successful review even when work was reopened,
then reselect normally. Review does not count as another implementation attempt;
there is no implicit reopen cap. Do not create or implement the review skill.

Validation: tasks 1–2 pass, with no regression to implementation-only operation.
No review starts after implementation failure or abort; failed review starts no
later stage. No outside-change detection or sandbox enforcement is introduced.

### 4. Document review behavior and verify modified files

Scope: `README.md`, loop usage text, and every source/test file actually modified.

Expected outcome: document optional review, its manually supplied skill
prerequisite, change/index boundary, urgent versus deferred findings, reselection,
attempt limits, and log routing. Quiet reporting remains contextual.

Validation: run `cr verify ./src/<path-to-file>.ts` for each modified source file
and `cr verify ./tests/<path-to-file>.test.ts` for each modified test file; fix and
repeat until passing. Record commands/results. Tests assume the future review
skill via fake outcomes; implementation/testing of that skill stays out of scope.

## References

- [Approved review findings contract](../../plans/loop-command/IDEA.md#agreed-review-findings-behavior)
- [Agreed staged change boundaries](../../plans/loop-command/IDEA.md#agreed-change-boundaries)
- [Iteration limit semantics](../../plans/loop-command/IDEA.md#agreed-iteration-limit)
- [Loop command](../../../src/commands/loop.ts)
- [Ticket reopen behavior](../../../src/commands/ticket/reopen.ts)
- [Ready-ticket dependency semantics](../../../src/commands/ticket/helpers/are-dependencies-satisfied.ts)
- [Repository verification instructions](../../../AGENTS.md)
- Prerequisite: ticket 0030 (loop, stage execution, logs, and Git boundaries).
- Consumer: ticket 0032 adds independent opt-in commit after this review stage.

## Implementation and validation

Implemented optional `-r`/`--auto-review`, native review settings, deduplicated
preflight probes, fresh review sessions with ticket/change/index context, review
JSONL records, resulting ticket validation, and staging followed by normal
selection. Added fake review outcomes and temporary Git coverage; updated README
and usage. The review skill remains a manually supplied prerequisite.

Passed:

- `cr verify ./src/commands/loop.ts`
- `cr verify ./src/commands/loop/run-loop.ts`
- `cr verify ./tests/commands/loop.test.ts`
- `cr verify ./tests/commands/loop/run-loop.test.ts`

The CLI and runner suites pass 15 tests with 100% line coverage for both source
files. Configured mutation checks passed with no surviving mutations; generated
mutants were classified as type errors. Cases include distinct model/effort
probes, disabled review, urgent/deferred findings, five attempts on a reopened
ticket, dependent blocking, limit completion, same-file staged context, untracked
files, outside index preservation, quiet reporting, and review failures before
staging. Existing unrelated work and the index were preserved.

Final combined `cr verify -s ./src/commands/loop.ts ./src/commands/loop/run-loop.ts ./tests/commands/loop.test.ts ./tests/commands/loop/run-loop.test.ts README.md` passed; all four TypeScript files were ok and README was skipped (no configured rule). `git diff --check` passed.
