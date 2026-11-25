# Update ticket links tickets

| Ticket | Outcome | Dependencies |
| --- | --- | --- |
| [0054 — Serialize status changes for each ticket](../../tickets/closed/0054-serialize-status-changes-for-each-ticket.md) | Ticket transitions validate fresh state under an exclusive lock. | None |
| [0055 — Update plan links when tickets change status](../../tickets/closed/0055-update-plan-links-when-tickets-change-status.md) | Status commands update plan links safely and report incomplete maintenance. | 0054 |
| [0056 — Diagnose and repair stale plan ticket links with doctor](../../tickets/closed/0056-diagnose-and-repair-stale-plan-ticket-links-with-doctor.md) | Doctor detects stale links and repairs them with the same locks as status commands. | 0055 |

The [archived idea](IDEA.md) records the agreed design and verification expectations.
