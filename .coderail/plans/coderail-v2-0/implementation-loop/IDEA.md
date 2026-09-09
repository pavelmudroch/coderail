---
title: Implementation loop
status: forging
---

## Desired Outcome

Users can run bounded ticket implementation with review, repair, periodic specification-drift reconciliation, and clear reports when human decisions are needed.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* `cr loop` replaces v1 `cr ticket loop` and should behave similarly, subject to the agreed behavior below. Other v1 details need confirmation.
* Operates on eligible open tickets in the current checkout; does not select or interpret ideas and does not require `work`.
* Select the first non-blocked ticket, implement it, and review it. Failed review leads to repair and another review of the same ticket. Passing review allows selection of another ticket.
* Stop when all tickets are done or the ticket limit is reached.
* Stop and generate a report when a material decision arises.
* Periodically check specification drift caused by discoveries during implementation. Ticket source-spec references provide context for agents without making scheduling depend on ideas.
* Reconciliation may automatically correct specifications and tickets only when preserving agreed behavior and scope. Changes to requirements, public behavior, or significant design decisions require stopping and reporting.
* Agents must not rewrite specifications merely to justify their implementation.
* Ticket management owns lifecycle, dependencies, and eligibility; this idea owns orchestration, agent handoffs, stopping, and reporting.

## Open Questions

* Which v1 invocation, harness selection, logging, and Git staging behaviors carry forward?
* Is review configurable, and how are review and repair handoffs coordinated?
* How does the ticket limit count work, and what bounds repeated repair attempts?
* What happens when unfinished tickets exist but all are blocked?
* When are drift checks run, and how are findings and reconciliation outcomes recorded?
* What does a stop report contain, and how does the user resume work after resolving a decision?
