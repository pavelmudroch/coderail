# Codex harness connector tickets

Implement the [approved idea](IDEA.md) as one vertical delivery covering skills,
whole-file general instructions, native TOML subagents, and global/local
install/uninstall using the existing shared lifecycle.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0024 — Implement functional Codex harness installation](../../tickets/closed/0024-implement-functional-codex-harness-installation.md) (completed) | Deliver native Codex paths, validated translations, skill invocation policy, and real installation/removal with existing ownership and safety protections. | [0023 — Implement functional Claude harness installation](../../tickets/closed/0023-implement-functional-claude-harness-installation.md) (completed; includes prerequisite 0012) |
| [0025 — Remove obsolete owned Codex invocation policies on reinstall](../../tickets/closed/0025-remove-obsolete-owned-codex-invocation-policies-on-reinstall.md) (completed) | Remove stale generated policies for present skills that omit the invocation flag, with protected removals and accurate ownership in both scopes. | 0024 (completed) |
| [0026 — Restore rejected promises for invalid Claude global instructions](../../tickets/closed/0026-restore-rejected-promises-for-invalid-claude-global-instructions.md) (completed) | Restore deferred translation and retain the existing invalid UTF-8 rejected-promise regression assertion. | 0023 (completed) |

Ticket 0024 places home/instruction, skill, subagent, and real lifecycle test tasks
before connector implementation tasks, followed by required per-file verification.
Implementation stays in the existing Codex module; the version 1 whole-file
manifest remains unchanged. Ticket 0025 adds an optional connector hook for
obsolete generated skill files.

Tickets 0025 and 0026 cover the [agreed review changes](REVIEW.md) and have no
dependency on each other. Each places regression coverage before implementation
and concludes with required per-file verification. Ticket 0025 extends the shared
installer lifecycle to reconcile obsolete owned Codex policies; ticket 0026 stays
within the Claude global instruction translation method.
