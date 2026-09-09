---
title: Repository validation
status: forging
---

## Desired Outcome

Users and agents can run user-defined validation commands for selected repository files and inspect the results.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* `test` retains v1's role: a simple mapping from selected files, directories, or Git changes to commands defined by the user.
* Covers command mapping, selection, execution, and result reporting.
* The user defines what validation to run; `test` does not infer validation requirements.
* V1 README provides the baseline for discussing detailed command behavior.

## Open Questions

* Which v1 mapping syntax, selectors, execution rules, and output behavior carry forward unchanged?
* Are any v2 command adjustments needed, including results consumed by agents and `loop`?
