---
title: Repository status and next steps
status: forging
---

## Desired Outcome

Users can understand what has been done and what they can do next in the current repository through `status`.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Provides a read-only, user-facing summary of repository work and available next steps.
* Includes ideas needing further forging and specifications awaiting implementation, alongside relevant ticket progress and blockers.
* Planning and execution are independent: tickets may span multiple ideas, and no managed work branch is required.
* Deep diagnosis and repair belong to `doctor`.

## Open Questions

* How are completed work and available next steps derived from ideas, specifications, tickets, and loop outcomes?
* How should results be organized and prioritized for the user?
* How should missing, inconsistent, or insufficient state be presented, including when to suggest `doctor`?
