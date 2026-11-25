---
id: "0061"
slug: "guide-archive-cleanup-through-the-archive-skill"
title: "Guide archive cleanup through the archive skill"
status: "open"
created_at: "2026-11-25T12:10:57.600Z"
updated_at: "2026-11-25T12:10:57.600Z"
dependencies:
  - "0060"
---

# Guide archive cleanup through the archive skill

Add a distributed `archive` skill that uses the CLI to preview and apply
cleanup after explicit approval in the harness.

## Tasks

1. [ ] Write the archive skill workflow
2. [ ] Validate skill discovery and command handoff

## Task details

### 1. Write the archive skill workflow

Add `assets/instructions/skills/archive/SKILL.md` following the existing skill
asset conventions. Start with `cr archive --json preview`. Present eligible
groups and reasons deferred groups stay, and use the preview to suggest a
filesystem-safe batch name and description. Warn the user to pause edits and
ticket or plan updates until apply completes. Ask for explicit harness approval
before calling `cr archive --json apply --yes <batch-name> <description>`.
Stop on preview errors, empty selections or declined approval.

On success, report the batch ID and the available browsing commands. On an
apply error, convey the phase, rollback outcome and available manual recovery
details from the CLI. Keep Git operations and cleanup logic in the CLI. Pushing
or fetching the local archive branch remains a user action.

Validation checks the exact CLI calls against the implemented interface and
confirms that each path communicates the result and gates apply on approval.

### 2. Validate skill discovery and command handoff

Check that the new skill is picked up by the existing instruction discovery and
packaging path. Walk through a successful preview and explicit approval, a
declined approval, and a preview or apply failure using representative CLI
output.

Validation confirms the staged workflow uses the CLI's own eligible groups and
diagnostics and leaves files and refs unchanged when approval is declined.

## References

- [Agreed archive specification](../../plans/retained-history-for-ideas-and-tickets/IDEA.md)
- Related ticket `0060 — Record archive batches and remove source files safely`
- [Existing CLI-backed skill](../../../assets/instructions/skills/ticket/SKILL.md)
