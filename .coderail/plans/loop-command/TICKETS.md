# Loop command tickets

Implement the [approved idea](IDEA.md) in six deliveries. Each ticket places
test tasks before implementation, defines verifiable outcomes, and requires
per-file source/test verification during implementation.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0027 — Repair initialized project ignore rules and discovery](../../tickets/open/0027-repair-initialized-project-ignore-rules-and-discovery.md) | Create or repair the managed ignore file and validate the nearest project without blocking init repairs. | None |
| [0028 — Run fresh non-interactive Codex and Claude sessions](../../tickets/open/0028-run-fresh-non-interactive-codex-and-claude-sessions.md) | Deliver both connectors' required streaming runner, final answers, cancellation, and async disposal. | None |
| [0029 — Configure loop models and effort by harness and stage](../../tickets/open/0029-configure-loop-models-and-effort-by-harness-and-stage.md) | Load and merge saved settings and resolve independent model/effort precedence for every stage. | None |
| [0030 — Implement the preflighted ticket loop with scoped staging and logs](../../tickets/open/0030-implement-the-preflighted-ticket-loop-with-scoped-staging-and-logs.md) | Deliver the implementation-only command, shared ready-ticket selection, no-work preflight, Git boundaries, JSONL output, lifecycle reporting, and interruption handling. | 0027, 0028, 0029 |
| [0031 — Review loop iterations and reselect recorded follow-up work](../../tickets/open/0031-review-loop-iterations-and-reselect-recorded-follow-up-work.md) | Add optional review before staging and route reopened or deferred work through normal selection. | 0030 |
| [0032 — Commit staged loop iterations and validate commit results](../../tickets/open/0032-commit-staged-loop-iterations-and-validate-commit-results.md) | Complete commit-only and combined `-rc` workflows with startup index protection and commit postconditions. | 0031 |

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
