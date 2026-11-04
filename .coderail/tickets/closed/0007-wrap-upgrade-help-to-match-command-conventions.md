---
id: "0007"
slug: "wrap-upgrade-help-to-match-command-conventions"
title: "Wrap upgrade help to match command conventions"
status: "closed"
created_at: "2026-11-04T09:46:22.885Z"
updated_at: "2026-11-04T09:51:01.741Z"
dependencies: []
reason: "done"
---

# Wrap upgrade help to match command conventions

Make upgrade help readable within 80 columns while retaining all release-selection and conflict rules agreed in the review. This is the first of the review follow-ups; ticket 0008 follows it to serialize edits to the command and its tests.

## Tasks

1. [x] Specify upgrade help width, indentation, and content
2. [x] Reformat upgrade usage text

## Task details

### 1. Specify upgrade help width, indentation, and content

Scope: extend help assertions in `tests/commands/upgrade.test.ts`.

Expected outcome: assert every rendered line is at most 80 characters including indentation. Check two spaces before synopsis/prose and short-option entries, six spaces before long-only options, and 23 spaces before descriptions and continuation lines. Assert the documented latest/default, partial/exact selectors with optional `v`, downgrades, same-version reconciliation, canary exclusion, and force/yes/no rules survive wrapping.

Validation: assertions identify the current overlong lines and pass after task 2. Preserve side-effect-free help handling; avoid coupling content checks to arbitrary line breaks.

### 2. Reformat upgrade usage text

Scope: change only `Upgrade.getUsage()` in `src/commands/upgrade.ts`, using `Install.getUsage()` as the formatting reference.

Expected outcome: wrap option descriptions and explanatory paragraphs to satisfy task 1. Keep user-template protection, per-file conflict confirmation, noninteractive answers, mutually exclusive yes/no requiring force, and preservation of declined files explicit.

Validation: inspect rendered help for readable wrapping and run `cr verify ./src/commands/upgrade.ts` and `cr verify ./tests/commands/upgrade.test.ts` after modifications; fix failures until both pass.

## References

- [Agreed review changes](../../plans/upgrade-command/REVIEW.md), first item
- [Upgrade requirements](../../plans/upgrade-command/IDEA.md)
- [Upgrade command](../../../src/commands/upgrade.ts)
- [Install help conventions](../../../src/commands/install.ts)
- [Upgrade command tests](../../../tests/commands/upgrade.test.ts)
- Follow-up: [0008 argument validation](0008-centralize-upgrade-argument-validation-and-align-diagnostics.md)
