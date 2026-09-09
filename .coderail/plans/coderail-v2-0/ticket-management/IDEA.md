---
title: Ticket management
status: forging
---

## Desired Outcome

Users and agents can manage a repository ticket queue with clear lifecycle and dependency rules, independently of idea selection or managed Git branches.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Covers `ticket`, ticket content, source-spec references, lifecycle, and dependencies. Agent execution belongs to `loop`.
* The user chooses which ideas become tickets and when. A queue may contain tickets from multiple ideas.
* Each ticket records the specification from which it was created. Agents can consult it and, if needed, its idea.
* Tickets should contain enough context to implement ordinary work without consulting their source specification or idea.
* `work` is not required. `loop` consumes the ticket lifecycle and eligibility rules defined here.

## Open Questions

* Which v1 ticket commands and lifecycle rules carry forward or change?
* What defines eligibility and ordering for the first non-blocked ticket?
* What ticket content and provenance are required, and how are references maintained?
* How should implementation, failed review, repair, completion, and material-decision stops be represented for `loop` and `status`?
