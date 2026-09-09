---
title: Diagnosis and repair
status: forging
---

## Desired Outcome

Users can investigate Coderail problems deeply with `doctor`, repair them where possible, or receive instructions for repairing them.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Covers diagnosis, repair, and repair guidance. Routine progress and next-step summaries belong to `status`.
* Harness installation is user-level; workflow files are repository-level.
* Repair invocation and authority have not been decided.

## Open Questions

* Which user-level and repository-level problems should be inspected?
* How are inspection and repair invoked, and which repairs may run automatically?
* How should ambiguous repairs, unrecoverable problems, and partial repair results be reported?
