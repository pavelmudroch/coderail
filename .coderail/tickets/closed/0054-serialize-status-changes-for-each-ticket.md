---
id: "0054"
slug: "serialize-status-changes-for-each-ticket"
title: "Serialize status changes for each ticket"
status: "closed"
created_at: "2026-11-24T15:10:22.124Z"
updated_at: "2026-11-24T15:42:50.600Z"
dependencies: []
reason: "done"
---

# Serialize status changes for each ticket

Serialize competing status changes so each command validates the latest ticket
state. Establish the exclusive lock lifecycle that plan-link updates and doctor
repairs will share.

## Tasks

1. [x] Specify temporary file ownership and ticket contention in regression tests
2. [x] Implement the registered temporary file resource
3. [x] Implement shared lock acquisition and wrap ticket transitions

## Task details

### 1. Specify temporary file ownership and ticket contention in regression tests

Cover exact-path creation, contention, release, and cleanup in filesystem
tests. Exercise competing status commands with ID, filename, and path
identifiers and equivalent project root aliases.

**Expected outcome.** The tests establish that the winner owns the lock,
a waiter uses fresh state, and a failed acquisition leaves protected state intact.

**Validation.** Cover the 100 ms retry interval, the 30-second acquisition
timeout, cancellation, release after callback failure, and a released handle
whose path has been reacquired. Verify that independent IDs can proceed
concurrently and that command validation still applies after contention.

### 2. Implement the registered temporary file resource

Add `Fs.makeTempFile(path: string): Promise<TempFile>`, exported through
`src/fs.ts`. The handle exposes a readonly `path` and asynchronous `remove()`.
Create an empty file exclusively at the supplied path and close its handle.
Register only the file created by this call. On successful removal, unregister
immediately and make repeat removals harmless. Retain registration when removal
fails so runtime cleanup can retry.

**Expected outcome.** Contention rejects immediately. The caller can release its
file promptly, and orderly cleanup can remove resources still owned by the process.

**Validation.** The ownership tests pass, including cleanup after unsuccessful
acquisition and repeat removal after reacquisition. The existing `Fs.write`
staging path and behavior stay intact.

### 3. Implement shared lock acquisition and wrap ticket transitions

Export `withTicketLock<T>(projectRoot, identifier, signal, run)` through
`src/tickets.ts`. Canonicalize the project root and reuse the resolver's
identifier normalization without consulting status directories. Acquire
`.coderail/.locks/tickets/<id>.lock` with a private retry routine reusable by
document locking. Retry contention asynchronously every 100 ms for up to
30 seconds, honor cancellation, and release in finally. Failed acquisition
diagnostics identify the ticket and lock path. Contended locks survive timeout.

Wrap activate, close, and reopen from fresh resolution and validation through
mutation and final result resolution. Keep command-specific validation,
closure metadata, dependency handling, and existing result formats.

**Expected outcome.** Equivalent IDs coordinate across status moves, and a
ticket-lock timeout fails before mutation.

**Validation.** Competing commands validate against the winner's state. Existing
activate, close, and reopen tests pass alongside the lock lifecycle regressions.

## Review findings

- `Fs.makeTempFile` uses the supplied relative path again during removal. If the
  working directory changes after acquisition, removal can delete another
  owner's same-named file and leave the originally owned file behind. Bind
  creation and removal to the original location while preserving the handle's
  supplied path. Cover this case with a working-directory change and a second
  same-named file.
- A successful asynchronous acquisition that completes after the deadline still
  invokes the protected callback. If acquisition reports success after the
  deadline, release that owned lock and report timeout before running the
  callback. Cover a contended retry that succeeds after the deadline and verify
  that it leaves protected state intact and releases the lock.

## References

- [Agreed design](../../plans/update-ticket-links/IDEA.md)
- [Filesystem API](../../../src/fs.ts)
- [Temporary resource cleanup](../../../src/fs/temp/cleanup-temp-resources.ts)
- [Runtime cleanup](../../../src/runtime/cleanup.ts)
- [Ticket resolver](../../../src/tickets/resolve-ticket.ts)
- [Status commands](../../../src/commands/ticket/)
- [Filesystem tests](../../../tests/fs/)
- [Ticket command tests](../../../tests/commands/ticket/)
