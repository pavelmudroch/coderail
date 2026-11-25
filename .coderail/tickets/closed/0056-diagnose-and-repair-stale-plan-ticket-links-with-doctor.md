---
id: "0056"
slug: "diagnose-and-repair-stale-plan-ticket-links-with-doctor"
title: "Diagnose and repair stale plan ticket links with doctor"
status: "closed"
created_at: "2026-11-24T15:10:27.823Z"
updated_at: "2026-11-24T16:15:23.453Z"
dependencies:
  - "0055"
reason: "done"
---

# Diagnose and repair stale plan ticket links with doctor

Have doctor diagnose stale ticket destinations and repair them through the
same ticket and document locks as status commands. Combine plan-link updates
with eligible ticket placement fixes.

## Tasks

1. [x] Specify doctor diagnostics, guarded repairs, and contention in regression tests
2. [x] Collect stale-link findings and schedule one repair per ticket
3. [x] Run guarded placement and link repairs through shared operations

## Task details

### 1. Specify doctor diagnostics, guarded repairs, and contention in regression tests

Cover stale links to correctly placed tickets, combined placement/link
findings, missing or ambiguous identities, changed input, occupied
destinations, and path-specific failures. Exercise doctor and a status
command contending for the same ticket or Markdown document.

**Expected outcome.** Tests distinguish read-only diagnostics from repair,
protect authoritative ticket state, and establish the diagnostic exit contract.

**Validation.** Assert a single serial action per affected identity and one
diagnostic recheck, exact preservation of placement repair bytes and metadata,
continued independent repairs, and exit 1 when stale-link findings remain.

### 2. Collect stale-link findings and schedule one repair per ticket

Extend the tolerant inventory in `src/commands/doctor/tickets.ts` and reuse
`scanTicketLinks` to report stale destinations, including links to tickets
already at their authoritative path. Report unresolved missing or ambiguous
identities for manual handling, without guessing their destinations. Include
path-specific scan failures. Merge link and placement repair eligibility into
one action per ticket ID for the existing serial runner.

**Expected outcome.** Plain doctor is read-only. Repair mode collects and
deduplicates affected identities before executing actions.

**Validation.** Verify stale-link diagnostics independently of placement
diagnostics and verify that two findings for one ticket schedule one action.

### 3. Run guarded placement and link repairs through shared operations

Acquire `withTicketLock` for each action, revalidate current authoritative state
against the findings, and take a fresh scan under the lock. If eligible,
perform the existing exclusive hard-link and unlink placement repair with
its changed-input and destination-occupancy guards. Update plan links to
the current valid path through `updateTicketLinks`. Preserve the existing
serial runner and single recheck. Report path-specific maintenance failures
while continuing independent files and tickets.

**Expected outcome.** Links-only and combined repairs coordinate with status
commands without invoking a nested status command or changing ticket status.

**Validation.** A competing status command cannot cause doctor to publish an
outdated destination or overwrite changed input. Check unresolved findings
still produce exit 1 after recheck and guarded placement regressions pass.

## References

- [Agreed doctor integration](../../plans/update-ticket-links/IDEA.md)
- [Ticket 0055](0055-update-plan-links-when-tickets-change-status.md)
- [Ticket 0054](0054-serialize-status-changes-for-each-ticket.md)
- [Existing placement repair ticket](../closed/0046-repair-ticket-placement-from-authoritative-frontmatter.md)
- [Doctor ticket checks](../../../src/commands/doctor/tickets.ts)
- [Doctor command](../../../src/commands/doctor.ts)
- [Serial repair runner](../../../src/commands/doctor/repairs.ts)
- [Doctor ticket tests](../../../tests/commands/doctor/tickets.test.ts)
