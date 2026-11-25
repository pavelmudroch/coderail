---
id: "0058"
slug: "preview-eligible-archive-groups"
title: "Preview eligible archive groups"
status: "open"
created_at: "2026-11-25T12:10:49.381Z"
updated_at: "2026-11-25T12:10:49.381Z"
dependencies: []
---

# Preview eligible archive groups

Add a read-only `cr archive preview` that explains which closed tickets and
archived plans can move together and which must stay. Provide the same selection
and validation logic to apply.

## Tasks

1. [ ] Add preview and existing-behavior regression coverage
2. [ ] Share ticket inventory and Markdown link inspection
3. [ ] Select and validate complete archive groups
4. [ ] Expose preview through the archive command

## Task details

### 1. Add preview and existing-behavior regression coverage

Build temporary Git project fixtures covering standalone closed tickets, archived
legacy plans without `TICKETS.md`, nested artifacts, and split trees with a
descendant that still has open work. Exercise dependencies and duplicate chains,
cross-plan links, links to plan artifacts, and links from retained Coderail
documents. Include links outside the scan scope, stale paths whose ticket number
still resolves elsewhere, staged and unstaged candidate edits, untracked
candidate artifacts, and unrelated local edits.

Validation verifies eligible groups and retention reasons, errors before
mutation, and unchanged files, index, and refs. Keep existing doctor link and
ticket diagnostics covered as the underlying readers are shared.

### 2. Share ticket inventory and Markdown link inspection

Extract the ticket inventory and authoritative location rules from doctor's
ticket checks. Provide one scan with exact paths, states, dependencies and
duplicate targets. Share recursive Markdown discovery, link tokenization and
destination formatting from the plan link code. Scan local Markdown links across
`.coderail/` for ticket, plan and plan-artifact destinations and validate the
exact destinations. Preserve existing doctor diagnostics and keep its repair
actions and the live status-move writer at their existing entry points.

Validation checks that an obsolete ticket path is rejected even when another
status directory has the same ID. External links, targets in other repository
areas and prose mentions are outside the scan. Inspection reports stale links
for doctor to address.

### 3. Select and validate complete archive groups

Use the idea tree and existing frontmatter validation for status and hierarchy.
Enumerate plan artifacts recursively, including nested files outside the idea
tree's immediate file lists. Connect plans and linked tickets, ticket
dependencies and duplicate targets, links between candidates, and all members of
split trees. Keep any group reachable from retained work or retained Coderail
Markdown, including indirect references through closed duplicates. Check all
Markdown inside each plan for linked tickets, with legacy plans eligible when
their other checks pass.

Return eligible groups and reasons for deferral using a source commit and
original paths. Validate each selected file against the source commit, index and
working tree. Treat missing or uncommitted selected files and scan failures as
validation errors. Permit unrelated local changes. Validation verifies that no
retained Coderail plan or ticket references any selected record.

### 4. Expose preview through the archive command

Register top-level `archive` in `src/commands/cr.ts` and add the `preview`
subcommand with human output and `cr archive --json preview`. Keep argument and
output handling in the command layer and make selection callable by apply.

Validation exercises the public CLI with eligible, deferred, empty and invalid
selections. Scan and validation failures exit with an error and leave files and
refs untouched.

## References

- [Agreed archive specification](../../plans/retained-history-for-ideas-and-tickets/IDEA.md)
- [CLI registration](../../../src/commands/cr.ts)
- [Doctor ticket inventory](../../../src/commands/doctor/tickets.ts)
- [Markdown plan links](../../../src/tickets/plan-links.ts)
- [Idea tree](../../../src/commands/idea/helpers/get-idea-tree.ts)
- [Idea frontmatter validation](../../../src/commands/idea/helpers/idea-frontmatter.ts)
