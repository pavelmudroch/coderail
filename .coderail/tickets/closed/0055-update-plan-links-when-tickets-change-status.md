---
id: "0055"
slug: "update-plan-links-when-tickets-change-status"
title: "Update plan links when tickets change status"
status: "closed"
created_at: "2026-11-24T15:10:24.811Z"
updated_at: "2026-11-24T16:05:03.878Z"
dependencies:
  - "0054"
reason: "done"
---

# Update plan links when tickets change status

Keep links in plan Markdown pointed at the ticket's current path and preserve
concurrent changes to shared documents. Surface incomplete maintenance on
stderr while preserving the successful ticket result and exit status.

## Tasks

1. [x] Specify link matching, transition behavior, and concurrent document updates in regression tests
2. [x] Implement plan discovery and byte-preserving link rewriting
3. [x] Apply link maintenance within each locked status command

## Task details

### 1. Specify link matching, transition behavior, and concurrent document updates in regression tests

Cover nested and archived plans, helper documents, an absent plans directory,
multiple files and occurrences, unchanged files, stale status paths, relative
depth, and exact identity. Include inline links, reference definitions,
titles, anchors, code examples, external URLs, bare paths, and paths outside
the project ticket directory. Exercise activate, every close reason, reopen,
and already-open reopen.

**Expected outcome.** Tests capture the scope of eligible links and the CLI's
success-with-warnings behavior for partial maintenance.

**Validation.** Exercise concurrent processes updating two tickets in one
document, a candidate reread after another write, stable document locks across
atomic replacement, cancellation, and release on failure. Assert unreadable
files and lock/write failures identify the affected paths on stderr, later
files are attempted, and the successful CLI result retains its JSON shape
and exit code.

### 2. Implement plan discovery and byte-preserving link rewriting

Implement and export `scanTicketLinks(projectRoot, target, signal)` and
`updateTicketLinks(projectRoot, target, scan, signal)` from
`src/tickets/plan-links.ts` through `src/tickets.ts`. Use the design's
`TicketLinkTarget`, `TicketLinkScan`, `TicketLinkFinding`, and `LinkWarning`
contracts. Recursively inspect regular Markdown files under `Path.PLANS_DIR`,
without following symlinks outside it. Discover before mutation, without
document locks. Record every matching candidate and only stale destinations
as findings. Collect inspection failures and continue.

Resolve each local destination relative to the containing document, verifying
it is under this project's `.coderail/tickets/` and names the exact ID and
slug. Accept stale paths from any status even when the old file is gone.
Rewrite only eligible destinations, preserving anchors, titles, labels, and
all unrelated bytes. Exclude code spans, fenced and indented code blocks,
external URLs, and bare paths.

For each candidate, acquire one document lock using the shared retry routine
and `.coderail/.locks/markdown/<sha256>.lock`. Hash the normalized project-relative
path with slash separators under the canonical root. Preserve case on
case-sensitive filesystems and coalesce supported aliases to the same
document. Reread and rematch under the lock, then use `Fs.write` for atomic
replacement only when needed. Release before processing the next document.
Collect path-specific failures with causes and continue. Cancellation stops
further updates and releases held locks.

**Expected outcome.** An unlocked scan supplies candidates only. Concurrent
updates to separate tickets preserve both destinations in a shared document.

**Validation.** The discovery and rewrite regressions cover all supported
forms and exclusions. Verify that an unchanged candidate incurs no write
and that contention identifies both the document and lock path.

### 3. Apply link maintenance within each locked status command

Within `withTicketLock`, resolve and validate the ticket, scan using the
planned destination, apply the existing mutation, update candidates, and
resolve the final result. Run maintenance for already-open reopen without
rewriting the ticket or refreshing timestamps solely for link maintenance.
Combine discovery and update warnings and emit them on stderr. Retain the
current CLI arguments, status mutation rules, stdout formats, and error
behavior for a failed transition.

**Expected outcome.** Activate, close, and reopen update plan links after
successful transitions. Partial maintenance preserves the transition and
reports the affected files without rollback.

**Validation.** Status-command and cross-process regressions demonstrate
correct destinations, intact metadata and result shape, and continued
maintenance after an independent document failure.

## Review findings

1. Exercise already-open reopen with a stale plan link. The existing
   already-open test asserts unchanged ticket bytes in a workspace without
   plans, and the new maintenance test moves a closed ticket. Add an assertion
   that maintenance fixes a stale link while preserving the already-open
   ticket's bytes and timestamp. A focused reproduction confirmed the current
   implementation supports this behavior.
2. Preserve the successful command result if cancellation interrupts link
   maintenance after the ticket mutation commits. Aborting during the locked
   document reread currently rejects with an abort error even though the
   ticket is already at its new path. At the CLI this loses the JSON result
   and exits with code 3. Stop further document updates, release held locks,
   report the interrupted maintenance on stderr, and return the successful
   transition result. Preserve cancellation before mutation and cover the
   post-mutation result and lock release in a regression.

## References

- [Agreed design and public interfaces](../../plans/update-ticket-links/IDEA.md)
- [Ticket 0054](0054-serialize-status-changes-for-each-ticket.md)
- [Status commands](../../../src/commands/ticket/)
- [Ticket exports](../../../src/tickets.ts)
- [Plan path constants](../../../src/path.ts)
- [Atomic file writer](../../../src/fs/write.ts)
- [Ticket command tests](../../../tests/commands/ticket/)
