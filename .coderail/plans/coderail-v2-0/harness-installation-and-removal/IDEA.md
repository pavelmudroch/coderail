---
title: Harness installation and removal
status: forging
---

## Desired Outcome

Users can install and remove Coderail instructions and skills for agent harnesses at user level.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Covers `install` and `uninstall` together because they manage the same files throughout their lifecycle.
* Retains v1's user-level installation scope. Project-local harness installation is out of scope; `init` handles project setup.
* Tickets, specifications, ideas, and helper files remain repository-level.
* V1 README behavior is background for forging; details beyond the agreed scope need confirmation.

## Open Questions

* Which v1 options, supported harnesses, and installation behaviors carry forward?
* How should updates, modified managed files, conflicts, and partial failures be handled?
* What installation state should `doctor` inspect and repair?
