# Loop command tickets

The [approved idea](IDEA.md) was delivered in tickets 0027–0032.
The [review](REVIEW.md) adds two independent corrective deliveries. Each ticket places
test tasks before implementation, defines verifiable outcomes, and requires
per-file source/test verification during implementation.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0027 — Repair initialized project ignore rules and discovery](../../tickets/closed/0027-repair-initialized-project-ignore-rules-and-discovery.md) | Create or repair the managed ignore file and validate the nearest project without blocking init repairs. | None |
| [0028 — Run fresh non-interactive Codex and Claude sessions](../../tickets/closed/0028-run-fresh-non-interactive-codex-and-claude-sessions.md) | Deliver both connectors' required streaming runner, final answers, cancellation, and async disposal. | None |
| [0029 — Configure loop models and effort by harness and stage](../../tickets/closed/0029-configure-loop-models-and-effort-by-harness-and-stage.md) | Load and merge saved settings and resolve independent model/effort precedence for every stage. | None |
| [0030 — Implement the preflighted ticket loop with scoped staging and logs](../../tickets/closed/0030-implement-the-preflighted-ticket-loop-with-scoped-staging-and-logs.md) | Deliver the implementation-only command, shared ready-ticket selection, no-work preflight, Git boundaries, JSONL output, lifecycle reporting, and interruption handling. | 0027, 0028, 0029 |
| [0031 — Review loop iterations and reselect recorded follow-up work](../../tickets/closed/0031-review-loop-iterations-and-reselect-recorded-follow-up-work.md) | Add optional review before staging and route reopened or deferred work through normal selection. | 0030 |
| [0032 — Commit staged loop iterations and validate commit results](../../tickets/closed/0032-commit-staged-loop-iterations-and-validate-commit-results.md) | Complete commit-only and combined `-rc` workflows with startup index protection and commit postconditions. | 0031 |

Tickets 0027–0029 can proceed independently. Ticket 0028 delivers both connectors
together because adding the required `run` method changes their shared interface.
Ticket 0030 combines the minimum pieces needed for a working implementation loop;
its tasks separate CLI/selection, Git, execution/logging, and reporting concerns.
Tickets 0031 and 0032 extend the same orchestration sequentially to limit file
overlap and validate the complete review/staging/commit order. Commit remains an
independent user option despite being delivered after review integration.

The review skill is an assumed, manually supplied prerequisite. These tickets do
not create it. Sandbox enforcement, permission elevation, automatic recovery,
and pushing remain outside scope. The IDEA.md is preserved as the behavioral
specification; no source/test implementation is part of this decomposition.


## Review follow-up

The current [review agreement](REVIEW.md) takes precedence over the original
quiet-mode output rules in IDEA.md and tickets 0030–0032.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0033 — Stop harness process trees on cancellation and failure](../../tickets/open/0033-stop-harness-process-trees-on-cancellation-and-failure.md) | Terminate descendant tool processes and settle runner cleanup on every stop/failure path. | 0028 |
| [0034 — Restore loop lifecycle formatting and logging levels](../../tickets/open/0034-restore-loop-lifecycle-formatting-and-logging-levels.md) | Restore the agreed layout and route final, iteration, and other lifecycle lines through output, info, and notice. | 0032 |

Tickets 0033 and 0034 can proceed independently after their completed prerequisites.
Their primary implementation and test files do not overlap. Both place regression
tests first and require per-file verification during implementation.

README/help updates remain deferred per REVIEW.md: remove the stale statement
that loop parsing/execution are unimplemented and align output documentation
with the revised logging levels when documentation work resumes.
