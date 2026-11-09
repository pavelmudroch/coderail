# Claude harness connector tickets

Implement the [approved idea](IDEA.md) as one vertical delivery covering optional
instruction loading, Claude translation, and global/local install/uninstall.

| Ticket | Purpose | Dependencies |
| --- | --- | --- |
| [0023 — Implement functional Claude harness installation](../../tickets/closed/0023-implement-functional-claude-harness-installation.md) (completed) | Deliver skills, general instructions, and subagents with native Claude homes, metadata validation, byte preservation, and shared installation protections. | [0012 — Support project-local harness instruction installation](../../tickets/closed/0012-support-project-local-harness-instruction-installation.md) (completed) |

Ticket 0023 places loading/safety, connector, and real lifecycle test tasks before
the shared-loader and connector implementation tasks, followed by required
per-file verification. Codex installation is also implemented; see the
[Codex connector tickets](../codex-harness-connector/TICKETS.md).
