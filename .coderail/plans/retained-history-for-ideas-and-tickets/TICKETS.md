# Retained history tickets

The [agreed idea](IDEA.md) defines the archive workflow, eligibility rules, and recovery behavior.

| Ticket | Outcome | Dependencies |
| --- | --- | --- |
| [0058 — Preview eligible archive groups](../../tickets/open/0058-preview-eligible-archive-groups.md) | Read-only selection and validation with reasons for deferring groups. | None |
| [0059 — Browse retained archive batches](../../tickets/open/0059-browse-retained-archive-batches.md) | List batches, plans and tickets, and read files directly from the local archive branch. | 0058 |
| [0060 — Record archive batches and remove source files safely](../../tickets/open/0060-record-archive-batches-and-remove-source-files-safely.md) | Confirm cleanup, record an independent Git batch, then remove source files with guarded rollback. | 0058, 0059 |
| [0061 — Guide archive cleanup through the archive skill](../../tickets/open/0061-guide-archive-cleanup-through-the-archive-skill.md) | Present the preview, obtain approval in the harness, and report the CLI result. | 0060 |
