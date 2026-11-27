---
name: walkthrough
description: Review completed work interactively before integration, explain implementation details, discuss improvements, and record agreed changes.
disable-model-invocation: true
---

## Goal

- Review the complete set of committed changes within the current work context with the user.
- Explain what changed, why it changed, and how it works.
- Help the user understand implementation details, design decisions, and consequences.
- Identify bugs, risks, unnecessary complexity, and possible improvements.
- Evaluate consistency and interactions across individual implementation units.
- Discuss findings and alternatives before proposing final changes.
- Record agreed changes and unresolved decisions in the corresponding idea's `REVIEW.md`.

## Boundary

- Invoke this skill after implementation is complete and before integration or pull request creation.
- Run `cr work --json` to resolve the current work context and review range.
- Use the resolved base and head commits as the review boundary.
- Use `git diff <base-commit> <head-commit>` as the source of truth for changes.
- Use `git log <base-commit>..<head-commit>` to understand individual implementation commits.
- If the review range is unavailable, report failure and do not proceed.
- Report uncommitted changes and exclude them from the review.
- Run `cr idea --json` to list available ideas.
- Match reviewed changes to the corresponding ideas using their context and scope.
- Ask the user to select the corresponding ideas when the association is ambiguous.
- Read surrounding code and relevant project documentation to understand context.
- Identify the corresponding idea before updating its review document.
- Distinguish observed behavior from assumptions and potential issues.
- Explain relevant execution flows, interactions, and trade-offs instead of merely describing the diff.
- Present findings incrementally; allow the user to question, challenge, or refine each finding.
- Avoid modifying implementation files, staging changes, or creating commits.
- Avoid creating, switching, publishing, merging, or deleting branches.
- Avoid treating suggestions as decisions without user agreement.
- Preserve existing `REVIEW.md` content unless explicitly superseded.
- Keep `REVIEW.md` concise, actionable, and focused on agreed changes.
- Avoid recording explanations, rejected proposals, or resolved discussions unless needed to preserve an important decision.
- Ask for clarification when the corresponding idea cannot be identified reliably.

## Completion

- Resolve and establish the review range before starting the walkthrough.
- Inspect all changes within the review range and relevant surrounding code.
- Walk through the implementation with the user in logical, manageable sections, independently of ticket and commit boundaries.
- Explain non-obvious behavior, dependencies, edge cases, and design trade-offs.
- Evaluate the complete implementation against the original intent and specifications.
- Discuss potential problems and improvements until the user reaches a decision.
- Confirm the corresponding idea before recording review decisions.
- Create or update the corresponding idea's `REVIEW.md`.
- Record each agreed change as an actionable task with sufficient implementation context.
- Record unresolved questions separately when they affect implementation decisions.
- Avoid duplicate, obsolete, or contradictory review tasks.
- Summarize recorded changes and outstanding questions.
- Finish only after the user confirms the review is complete.
