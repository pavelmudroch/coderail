---
id: "0059"
slug: "browse-retained-archive-batches"
title: "Browse retained archive batches"
status: "closed"
created_at: "2026-11-25T12:10:51.922Z"
updated_at: "2026-11-25T12:44:28.142Z"
dependencies:
  - "0058"
reason: "done"
---

# Browse retained archive batches

Add read-only CLI commands to browse the archive branch from the current
checkout. Use the batch layout defined in the idea so apply can produce batches
that the listing and read commands already understand.

## Tasks

1. [x] Add browsing tests using committed archive fixtures
2. [x] Read the local archive ref and tree
3. [x] Expose archive listings and file reads

## Task details

### 1. Add browsing tests using committed archive fixtures

Create independent Git tree fixtures with dated batch directories, a README,
nested plan artifacts, and repeated numeric ticket IDs in different batches.
Exercise a missing archive branch, same-day ordering, nested idea titles and
parent-child relationships, numeric ticket ordering, byte-exact reads, unknown
batches, missing files, directory reads and escaping paths.

Validation records the source checkout, index and archive ref before and after
the public commands and checks that they are unchanged. Verify that paths from
the listings can be passed directly to `read`.

### 2. Read the local archive ref and tree

Provide archive Git operations for looking up the local
`coderail/archive-history` tip, enumerating directories and reading blob bytes.
Use the batch tree at the resolved tip and validate requested paths within a
single batch. Expose the ref and tree reads needed by apply to detect existing
batches. Keep Git access separate from argument parsing and output formatting.

Validation distinguishes a missing branch from a Git failure. Read returns a
clear error for an unknown batch, directory, missing file or escaping path.

### 3. Expose archive listings and file reads

Add `cr archive list`, `plans <batch-id>`, `tickets <batch-id>` and
`read <batch-id>/<path-to-file>`. List full batch IDs by newest UTC date first
and stable name order within a date. Before the first batch, list returns an
empty result. Report idea titles, parent-child relationships and artifacts for
plans, and numeric IDs, titles and paths for tickets. Use the existing
`--json` convention for listings and emit the exact file bytes on stdout for
`read`.

Validation covers both listing formats, reusable paths, and file output free
of headers and wrappers.

## Review findings

- Archive JSON listings append a terminal clear sequence even with
  `--no-color`. In a committed fixture, `cr --no-color archive --json list`
  produces `[\n  "2026-11-25_outer"\n]\x1b[0K\n`, which fails direct JSON
  parsing. Emit plain JSON and exercise parsing the raw CLI stdout for all three
  listing commands. The current fixture strips the terminal escape first.
- Browsing prefers the nearest Coderail project path over the command working
  directory when invoking Git. From a nested independent Git checkout without
  its own `.coderail`, the CLI lists the enclosing project's archive instead
  of the current checkout's empty archive. Let Git discover its repository
  from the command working directory, and cover nested independent checkouts.

## References

- [Agreed archive specification](../../plans/retained-history-for-ideas-and-tickets/IDEA.md)
- Related ticket `0058 — Preview eligible archive groups`
- [Idea frontmatter validation](../../../src/commands/idea/helpers/idea-frontmatter.ts)
- [CLI registration](../../../src/commands/cr.ts)
