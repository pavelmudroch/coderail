---
title: Optional Git work helpers
status: forging
---

## Desired Outcome

Decide whether `work` belongs in Coderail v2 and, if retained, define optional Git helpers that support the user's chosen work boundaries.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* This is an open product decision, not a commitment to implement `work`.
* Creating a branch for commit separation is a candidate capability.
* Other commands must not require `work`. Users choose which ideas become tickets and when; work is not restricted to one ready idea.
* V1 offered branch creation and squash-integration helpers. Their inclusion in v2 is not agreed.

## Open Questions

* Is a `work` command useful enough to retain in v2?
* If retained, does it only help create branches, or also help finish work?
* What Git state and workflow files would it manage, and what remains the user's responsibility?
