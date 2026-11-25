---
id: "0060"
slug: "record-archive-batches-and-remove-source-files-safely"
title: "Record archive batches and remove source files safely"
status: "closed"
created_at: "2026-11-25T12:10:54.932Z"
updated_at: "2026-11-25T13:00:23.838Z"
dependencies:
  - "0058"
  - "0059"
reason: "done"
---

# Record archive batches and remove source files safely

Implement `cr archive apply` so an approved batch is recorded in local Git
before Coderail removes its source files from the working tree.

## Tasks

1. [x] Add apply, concurrency and rollback tests
2. [x] Validate batch inputs and obtain approval
3. [x] Package and commit the archive batch
4. [x] Remove source files with guarded rollback

## Task details

### 1. Add apply, concurrency and rollback tests

Use temporary Git repositories to cover an independent root commit, later
batches retaining earlier ones, same-day collisions, repeating ticket IDs or plan
slugs in separate batches, correct remapped links, and browsing archives produced
by apply. Exercise a declined prompt, lack of a terminal, explicit approval,
stale links, candidate edits after confirmation and before deletion, and an
archive tip change before publication.

Simulate a failure after at least one deletion succeeds. Verify successful
rollback restores exact source bytes and removes only the failed batch. Cover
a conflicting file appearing during restoration and failure to remove the batch
from the ref. Verify that failed recovery preserves existing source changes and
archive data, and that failures report their phase and recovery details. Check
that successful cleanup leaves unstaged source deletions and keeps unrelated
changes, the normal index, and the checked-out branch intact.

### 2. Validate batch inputs and obtain approval

Implement `cr archive --json apply <batch-name> <description>` and
`cr archive apply --yes <batch-name> <description>`. Use the UTC date and a
filesystem-safe lowercase hyphenated name to form
`<yyyy-mm-dd>_<batch-name>`. Before recording, warn that source edits and ticket
or plan updates must pause until apply finishes. Use `Log.confirm` with
default-No `[y/N]` for terminal approval. Without a terminal, explain how to
confirm with `--yes`. Run the shared preview logic and recheck after approval.

Validation verifies that a decline, lack of approval, empty selection, invalid
input or preview failure leaves source files and the archive ref untouched.
Retain the existing closed-ticket read and reopen behavior before cleanup and
the existing highest-plus-one ID allocation after cleanup.

### 3. Package and commit the archive batch

Read selected content from the validated source commit and package it under
`<batch-id>/tickets/<ticket-file>.md` and
`<batch-id>/plans/<idea-path>/`. Preserve nested artifacts and remap local
links between archived records in memory using the shared link formatting.
Generate the batch `README.md` with the supplied description, links to plans
and standalone tickets, and provenance for the source revision and original
paths. Keep Git operations local and use an isolated index or equivalent tree
construction.

Use a parentless first commit and extend the previous tip for later batches.
Reject an existing dated name and publish the complete commit with an
expected-tip update. Validation confirms no source history imports, no partial
publication, unchanged source files and ref on a record failure, and no
overwrite when another worktree updates the ref.

### 4. Remove source files with guarded rollback

After recording succeeds, compare each source path to the original committed
content immediately before deletion and stop at the first conflict or failure.
On failure restore only paths deleted by this invocation and verify their
exact original contents before attempting to remove the failed batch from the
archive tip. Preserve other batches and guard rollback ref updates against
competing changes. Leave the archive copy available when restoration or safe
ref rollback cannot finish. Clear the dated name on successful rollback.

Validation verifies that apply reports the original failure even after a
successful rollback. Include the rollback outcome and, where known, the batch
ID, source and archive commits, and outstanding paths for manual recovery if
rollback fails or an interruption prevents completion. Source deletions stay
available for normal review and commit.

## References

- [Agreed archive specification](../../plans/retained-history-for-ideas-and-tickets/IDEA.md)
- Related ticket `0058 — Preview eligible archive groups`
- [Terminal confirmation](../../../src/log/confirm.ts)
- [Temporary filesystem resources](../../../src/fs/make-temp-directory.ts)
- [Current ticket ID allocator](../../../src/commands/ticket/helpers/get-last-ticket-id.ts)
