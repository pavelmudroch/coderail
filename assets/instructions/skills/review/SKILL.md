---
name: review
description: Review a completed ticket and reopen it if corrections are required.
disable-model-invocation: true
---

## Goal

Verify a completed ticket against its requirements and acceptance criteria. Record actionable findings and decide whether the ticket is ready to commit.

## Boundary

- Use the closed ticket path and change scope supplied by the orchestrator. Read the ticket and its idea when available.
- Inspect the ticket's diff and new files against the implementation baseline. Use surrounding and staged work as context. Flag any overlap that prevents you from attributing changes to the ticket.
- Check affected behavior, failure paths, and regression coverage. Run relevant checks when needed to investigate a concrete concern and follow repository verification requirements.
- Report concrete findings with their impact and the required correction. Preserve unrelated changes.
- Leave implementation edits, staging, and commits to the respective workflow steps.

## Completion

1. Review the ticket's changes against its acceptance criteria. Report the checks run and any gaps in verification.
2. For required in-scope corrections, record the findings in the ticket and reopen it with `cr ticket reopen <ticket>`. Use <skill>ticket</skill> to record necessary independent follow-up work.
3. Report the reviewed scope, findings, and ticket actions. Finish with `pass` when the implementation is ready to commit or `needs fix` when corrections are required.
