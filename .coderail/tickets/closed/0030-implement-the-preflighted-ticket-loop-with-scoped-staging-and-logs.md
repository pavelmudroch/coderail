---
id: "0030"
slug: "implement-the-preflighted-ticket-loop-with-scoped-staging-and-logs"
title: "Implement the preflighted ticket loop with scoped staging and logs"
status: "closed"
created_at: "2026-11-10T09:06:53.599Z"
updated_at: "2026-11-10T11:48:26.422Z"
dependencies:
  - "0027"
  - "0028"
  - "0029"
reason: "done"
---

# Implement the preflighted ticket loop with scoped staging and logs

Deliver a usable implementation-only `cr loop`: select ready tickets, validate
the effective harness settings, implement in fresh sessions, stage each successful
attempt, and preserve inspectable output and partial work on failure. Optional
review and commit are added by tickets 0031 and 0032.

## Tasks

1. [x] Add CLI, shared selection, and preflight tests
2. [x] Add Git-boundary and multi-iteration workflow tests
3. [x] Add JSONL, lifecycle reporting, and cancellation tests
4. [x] Implement CLI wiring and extract shared ready-ticket selection
5. [x] Implement project-scoped Git startup checks and staging
6. [x] Implement streamed stage execution, preflight, and iteration orchestration
7. [x] Implement lifecycle reporting and document the implementation-only loop
8. [x] Verify every modified source and test file

## Task details

### 1. Add CLI, shared selection, and preflight tests

Scope: `tests/commands/loop.test.ts`, focused suites under
`tests/commands/loop/`, and `tests/commands/ticket/next.test.ts`.

Expected outcome: cover help without execution prerequisites, optional positional
harness versus `defaultHarness`, missing/unknown harness rejection, positive
integer `-l`/`--limit`, and mount-style `-o` comma-separated settings. Reject
unknown option keys, malformed entries, empty model/effort values, and unexpected
arguments. Preserve native strings and exercise the resolver from ticket 0029.
Extracted selection preserves ascending numeric IDs and existing dependency
semantics and leaves `ticket next` output/limit behavior unchanged.

Validation: fake runners exercise the shared prompt `Do not use tools or read or
modify files. Reply with exactly: OK`; require successful completion plus trimmed
final answer exactly `OK`. Distinct effective enabled-stage combinations are
probed once per run, including omitted native defaults; disabled stages are
excluded. Probe failure, unexpected answer, or cancellation starts no implementation.
All probes finish before the first implementation. This base ticket enables only
implementation; tickets 0031/0032 extend the enabled-stage matrix.

### 2. Add Git-boundary and multi-iteration workflow tests

Scope: temporary Git repository fixtures and fake harness sessions in the loop
suites. Include nested initialized Coderail projects and execution from subfolders.

Expected outcome: reject project staged, unstaged, or untracked startup changes;
allow outside unstaged/untracked and, without auto-commit, outside staged work.
Resolve execution/tickets/reviewable scope/staging from the initialized project
root, not invocation cwd or Git root. Stage only that subtree after each successful
implementation, including new files, deletions, ticket moves, and ticket edits.
Preserve allowed outside changes and the index baseline across iterations.

Validation: cover same-file edits across attempts against accumulated staged
work, readiness after dependencies close, no-ready empty versus blocked queues,
limit counting per implementation attempt, and no implicit cap without a limit.
Require successful session and closure of the selected ticket with reason `done`
or `duplicate`; successful exit with active/open/missing/dismissed ticket fails.
Failed implementation never stages or advances. Git staging failure stops without
rollback/retry. Assert both resulting filesystem/index and ordered stage calls.

### 3. Add JSONL, lifecycle reporting, and cancellation tests

Scope: fake runner/file-write failures and terminal output capture in loop suites,
reusing existing logging/terminal conventions.

Expected outcome: cover unique sortable UTC timestamp/random run IDs;
`.coderail/loop/<run-id>/preflight.jsonl` and `<ticket-id>.jsonl`; immediate
append-only records `{ timestamp, step, stream, output }` with exactly the agreed
fields. Preserve decoded stdout/stderr chunks and their receipt timestamps,
without waiting for lines or parsing/reformatting native events. Repeated ticket
attempts append to the same ticket file; preflight probes share one file.

Validation: no agent output reaches terminal lifecycle logs. Log creation/write
failure stops and asynchronously disposes the active runner. Ctrl+C cancels it,
preserves work/index, and starts no later stage or iteration. Assert normal,
quiet, and non-interactive output: contextual success/failure completion lines,
elapsed step/iteration durations, preflight completion, and final attempt count,
stop reason, and unfinished-ticket summary. Quiet suppresses headings/animation
while retaining completion lines and short failure reasons.

### 4. Implement CLI wiring and extract shared ready-ticket selection

Scope: `src/commands/loop.ts`, `src/commands/ticket/next.ts`, and
`src/commands/ticket/helpers/get-ready-tickets.ts`.

Expected outcome: replace placeholder parsing/help/run behavior, set
`requiresInit = true`, resolve one harness for the run, and use ticket 0029's
settings resolver. Reject bad selection/settings/startup before agent sessions;
create no runtime output before shared initialization succeeds. Extract selection
without changing numeric ordering or dependency checks. The CLI owns startup and
summary reporting; orchestration belongs in `src/commands/loop/run-loop.ts`.

Validation: task 1 parsing/selection cases pass and `ticket next` regressions
remain green. Review/commit switches are delivered with their respective tickets;
never silently accept switches whose stages are not implemented yet.

### 5. Implement project-scoped Git startup checks and staging

Scope: `src/commands/loop/git.ts`.

Expected outcome: implement the initial clean-project check and unconditional
end-of-iteration staging under the initialized subtree, safely handling filenames,
new files, deletions, and ticket directory moves. Cleanliness is checked once at
startup; accumulated staged project changes are allowed during the run. Preserve
outside staged entries without auto-commit. Add no outside-change enforcement,
isolation, automatic reset, or rollback; harness confinement is an idea assumption.

Validation: task 2 Git fixtures pass, with exact preserved outside index/worktree
content and staging errors propagated before another iteration can start.

### 6. Implement streamed stage execution, preflight, and iteration orchestration

Scope: `src/commands/loop/run-loop.ts` and private helpers beneath
`src/commands/loop/` for log writing/prompts as needed.

Expected outcome: run once-per-distinct-combination no-work preflight through the
selected connector; then repeatedly select, invoke implement, check completion,
stage, and reselect. Each invocation is fresh, uses initialized project cwd and
the run signal, and consumes a runner with `await using`, `for await`, then
`result()`. Route output using task 3's exact JSONL contract. Check closure by
selected ticket identity after activation/moves rather than its old open path.

Implementation prompts invoke the implement skill with the selected ticket path
and context, require preserving the staged baseline, and leave activation,
verification, fixes, and closure to that skill. Align bundled implement
instructions in `assets/instructions/skills/implement/SKILL.md` with preserving
the existing index when invoked by loop; the loop owns staging.

Count every implementation attempt once. A reached limit finishes current stages
before stopping successfully. Distinguish empty queue from remaining blocked work.
Hard-stop on harness, closure, Git, logging, or cancellation failure, preserving
resulting work/index. No retries, rollback, push, recovery, sandbox implementation,
or automatic init. Do not claim probes prove effort application or rule out
native model fallback.

Validation: tasks 1–3 pass. Cancellation is checked between stages as well as
passed into active work, with no stage after abort. Helpers support later enabled
review/commit stages without adding a separate harness execution registry.

### 7. Implement lifecycle reporting and document the implementation-only loop

Scope: `src/commands/loop.ts`, orchestration reporting hooks/private helpers,
existing `Log.spinner`, `src/commands/cr.ts` global help, and `README.md`.

Expected outcome: show Preflight then numbered Iteration sections identifying
ticket ID/title. Reuse the spinner with `Implementing...` and `Staging...`, printing
permanent status/duration lines and updating the active message below them.
Use `Iteration N complete`, since later review may reopen a ticket. Completion
lines identify their iteration/ticket context when headings are suppressed.

End with `Loop complete [ ok | fail ]`, attempt count, stop reason, and unfinished
ticket if present. Ordinary limit/queue stops succeed. Quiet mode emits contextual
completion lines only; non-interactive mode retains those lines without animation.
Update the global quiet description to acknowledge this exception. Document
startup cleanliness, unconditional staging, saved/CLI settings, preflight,
log paths, manual init migration, limits, and failure/interrupt preservation.

Validation: task 3 output assertions pass; help and examples match implemented
behavior, and no agent text is printed in lifecycle output.

### 8. Verify every modified source and test file

Scope: all changed source/test files, including shared ticket-selection consumers.

Expected outcome: record passing commands/results and resolve every failure.

Validation: run `cr verify ./src/<path-to-file>.ts` for each modified source file
and `cr verify ./tests/<path-to-file>.test.ts` for each modified test file; fix and
repeat until passing. Workflow tests use fake execution and real temporary Git
repositories, requiring no authenticated sessions.

## References

- [Approved workflow and CLI behavior](../../plans/loop-command/IDEA.md#agreed-workflow)
- [Exact JSONL and output location contract](../../plans/loop-command/IDEA.md#agent-output-file-design)
- [Lifecycle and interruption specification](../../plans/loop-command/IDEA.md#agreed-output-and-interruption)
- [Verification expectations](../../plans/loop-command/IDEA.md#agreed-verification-expectations)
- [Loop placeholder](../../../src/commands/loop.ts)
- [Existing ready-ticket command](../../../src/commands/ticket/next.ts)
- [Ticket resolution](../../../src/commands/ticket/helpers/resolve-ticket.ts)
- [Dependency checks](../../../src/commands/ticket/helpers/are-dependencies-satisfied.ts)
- [Runtime cancellation](../../../src/runtime/signals.ts)
- [Spinner](../../../src/log/spinner.ts)
- [Implement skill](../../../assets/instructions/skills/implement/SKILL.md)
- [Repository verification instructions](../../../AGENTS.md)
- Prerequisites: tickets 0027 (initialization), 0028 (runner), 0029 (settings).
- Extensions: tickets 0031 (review), 0032 (commit).

## Verification results

Completed 2026-11-10. All tasks passed with fake harness execution and real temporary
Git repositories; no authenticated agent sessions were required.

The final command passed for every implementation source/test file (100% configured
coverage and passing configured mutation checks). Documentation files had no matching
verification rules and were reported as skipped.

```sh
cr verify -s ./src/commands/loop.ts ./src/commands/loop/git.ts ./src/commands/loop/run-loop.ts ./src/commands/ticket/helpers/get-ready-tickets.ts ./src/commands/ticket/next.ts ./src/commands/cr.ts ./tests/commands/loop.test.ts ./tests/commands/loop/git.test.ts ./tests/commands/loop/run-loop.test.ts ./tests/commands/ticket/helpers/get-ready-tickets.test.ts README.md assets/instructions/skills/implement/SKILL.md
```

Additional checks passed: `git diff --check`, `cr loop --help`, and
`cr --cwd /tmp loop --help` (help without an initialized project).
Existing staged prerequisite work and its index entries were preserved.
