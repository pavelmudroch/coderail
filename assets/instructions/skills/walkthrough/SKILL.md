---
name: walkthrough
description: Review staged Git changes interactively, explain implementation details, discuss improvements, and record agreed changes.
disable-model-invocation: true
---

## Goal

- Review all staged Git changes with the user.
- Explain what changed, why it changed, and how it works.
- Help the user understand implementation details, design decisions, and consequences.
- Identify bugs, risks, unnecessary complexity, and possible improvements.
- Discuss findings and alternatives before proposing final changes.
- Record agreed changes and unresolved decisions in the corresponding idea's `REVIEW.md`.

## Boundary

- Run `cr idea --json` to list available ideas.
- Match staged changes to the corresponding idea using its context and scope.
- Ask the user to select an idea when the association is ambiguous.
- Review staged changes only; use `git diff --cached` as the source of truth.
- Read surrounding code and relevant project documentation to understand context.
- Identify the idea associated with the staged changes before updating its review document.
- Distinguish observed behavior from assumptions and potential issues.
- Explain relevant execution flows, interactions, and trade-offs instead of merely describing the diff.
- Present findings incrementally; allow the user to question, challenge, or refine each finding.
- Avoid modifying implementation files, staging changes, or creating commits.
- Avoid treating suggestions as decisions without user agreement.
- Preserve existing `REVIEW.md` content unless explicitly superseded.
- Keep `REVIEW.md` concise, actionable, and focused on agreed changes.
- Avoid recording explanations, rejected proposals, or resolved discussions unless needed to preserve an important decision.
- Ask for clarification when the corresponding idea cannot be identified reliably.

## Completion

- Confirm the corresponding idea before recording review decisions.
- Inspect all staged changes and relevant surrounding code.
- Walk through the implementation with the user in logical, manageable sections.
- Explain non-obvious behavior, dependencies, edge cases, and design trade-offs.
- Discuss potential problems and improvements until the user reaches a decision.
- Create or update the corresponding idea's `REVIEW.md`.
- Record each agreed change as an actionable task with sufficient implementation context.
- Record unresolved questions separately when they affect implementation decisions.
- Avoid duplicate, obsolete, or contradictory review tasks.
- Summarize recorded changes and outstanding questions.
- Finish only after the user confirms the review is complete.