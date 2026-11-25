---
title: "Retained history for ideas and tickets"
status: "archived"
---

Reduce the accumulation of archived ideas, plan artifacts, and closed ticket
files in the working tree. Keep new ticket ID allocation from growing with
the volume of closed history.

## Current behavior

- The repository has 57 tracked closed ticket files and 13 archived ideas
  containing 28 tracked plan files when exploration began.
- Ticket creation scans filenames in open, active, and closed directories
  for the highest numeric ID and adds one. Removing the highest-numbered
  ticket can therefore make its ID available for reuse. Ordinary resolution
  also scans those directories, including when checking dependencies.
- Dependency checks use the closed ticket's reason. A ticket closed as done
  satisfies a dependency, a dismissed ticket does not, and a duplicate
  delegates the check to its target. Reopen currently uses the ticket file.
- The ticket resolver extracts the number even when given a filename or path.
  A historical filename passed to a ticket command can resolve to a new ticket
  if the numeric ID has been reused.
- Archiving an idea changes its frontmatter status in place. Idea discovery
  and ticket-link maintenance still traverse the plan tree. Ticket status
  changes update path-based links in plan Markdown.

## User proposals

- Add a terminal ticket archive state and move tickets to an archive directory
  excluded from ordinary scans. Archived tickets are final and never reopened.
  The user is comfortable reusing the numeric ID of an archived ticket.
- Delete closed ticket files and optionally archived plans after the work is
  done, retaining the documents in Git history.
- Before removing eligible records from the working tree, save them on a
  dedicated `coderail/archive-history` branch with independent Git ancestry.
  Its tip should provide a known place to browse archived work.

## Agreed cleanup eligibility

- Inspect open and active tickets before cleanup. Keep a closed ticket if
  an open or active ticket references it.
- An archived plan is eligible only after checking that every ticket linked
  from Markdown under the plan directory is closed. Scan all plan Markdown,
  including `TICKETS.md` if present. Its absence alone is safe for legacy
  plans.
- Scan local Markdown links throughout `.coderail/` for references to ticket
  or plan files, including links to plan artifacts. Links between archivable
  records join their groups. A link from a retained Coderail file keeps its
  target and the connected group in the working tree. Other repository
  directories, external links, and mentions in prose are outside this scan.
- Report stale links as validation failures in preview. Leave repair to
  doctor and stop before making any changes. Do not follow a stale link by
  looking up the ticket number in another status directory.
- Keep closed tickets linked from plans that stay in the working tree. This
  preserves the links and allows a later cleanup to check the plan's tickets.
- Move a plan and all its linked tickets together. Follow ticket dependencies
  and duplicate targets, including references that connect tickets from
  different plans. If a connected group still contains work that must stay,
  defer that group. After cleanup, no retained Coderail plan or ticket may
  reference a moved record.
- Keep a split plan tree together. A split parent is eligible only when all
  its descendants and their connected ticket groups can be archived.

## Source and recovery rules

- Keep closed tickets available for normal reads and reopening until cleanup.
  Record the archive commit locally before allowing any deletion. Leave source
  deletions for normal review and commit.
- All files selected for a batch must be committed. Validate the selected
  paths against the source commit, index, and working tree. Unrelated local
  changes are allowed. Recheck each source file against its original committed
  content before deleting it, since the archived copy may contain rewritten
  links.
- Preserve indirect references from open and active tickets through closed
  duplicate chains.
- Reuse applies to IDs once their tickets leave current state. The current
  highest-plus-one allocator can reuse IDs above the remaining maximum. Filling
  gaps below that maximum would be a separate behavior change.
- Accept the existing risks of numeric ID reuse across divergent branches in
  the first version. Revisit allocation if actual merge problems arise.

## Archive branch

- The first archive batch would be a root commit containing only archived files.
  Each subsequent batch would add to the archive tip. Use a distinct top-level
  directory for each batch so the tip contains older batches and reuse of
  ticket numbers or plan slugs cannot overwrite them.
- Use `<batch-id>/tickets/<ticket-file>.md` and
  `<batch-id>/plans/<idea-path>/` with the plan's Markdown and nested artifacts.
  Drop the `.coderail/` and ticket `closed/` directory levels from the
  archive.
- Remap local links between archived records in their archived copies, using
  the batch paths for the source and target. For a top-level plan, a link such as
  `../../tickets/closed/0057-example.md` would become
  `../../tickets/0057-example.md` when both are archived together.
- Add only the selected files. Do not merge source branch commits into the
  archive, since that would import product history. The normal checkout and
  index should remain untouched while recording the archive.
- Record the source revision and original paths for provenance. Prepare the
  complete batch before updating the local archive ref. An atomic ref update
  against the previously read tip would keep the ref unchanged on failure.
- The user is responsible for pushing and fetching the branch. Remote access
  and handling rejected pushes are outside the first version.

## Agreed batch naming

- A batch identifies one cleanup operation. One operation can archive several
  independently eligible groups together, while each group moves intact.
- Use `<yyyy-mm-dd>_<batch-name>`, for example
  `2026-11-25_doctor-and-link-maintenance`. Coderail supplies the UTC date of
  the cleanup. The supplied lowercase, hyphenated name describes the batch and
  must be a single filesystem-safe path component.
- Put the supplied description in the batch's `README.md`. Generate links to
  the archived plans and standalone tickets underneath it so visitors can
  browse the batch. The source revision can be recorded for provenance.
- Treat an existing dated name as a conflict. Preserve the existing batch.
  A successfully rolled-back batch is no longer present at the branch tip,
  so its name is available again.

## Archive workflow

- A user invokes the `archive` skill to clean up finished work. The skill
  calls a top-level `cr archive` command to do the work and reports the
  result. Eligible records are selected by the CLI so users do not have to
  assemble the groups by hand.
- **Phase 1, preview.** `cr archive --json preview` reports eligible groups
  and reasons other groups must stay. A validation or scan failure stops the
  operation with no changes to files or refs. Apply rechecks current state
  through the same preview logic.
- Before recording, warn that the user must pause edits and ticket or plan
  updates until apply completes. Concurrent changes can invalidate the
  selection or make cleanup fail. In a terminal, use Coderail's existing
  `Log.confirm` with a default-No `[y/N]` prompt. A decline leaves source
  files and refs untouched.
- Support `cr archive apply --yes <batch-name> <description>` for callers
  that already have approval. Without an interactive terminal or `--yes`,
  apply stops before recording and explains how to confirm. The archive skill
  presents the preview and warning, asks the user to approve in the harness,
  and passes `--yes` following explicit approval.
- **Phase 2, record.** `cr archive --json apply <batch-name> <description>`
  writes the eligible files to the local archive branch in one complete batch.
  On failure, report the error, leave the archive ref as it was before the
  operation, and leave all source files in place.
- **Phase 3, remove.** After successfully recording the archive batch, remove
  its source files. On the first deletion failure, stop deleting and attempt
  rollback. Restore the files deleted by this invocation from the exact source
  commit and verify them before removing the batch directory from the archive
  branch. Preserve existing source changes and unrelated archive batches.
  Leave the batch in place if source restoration cannot be completed safely.
- A failed apply reports an error even after successful rollback. Report the
  original failure and rollback outcome. If rollback fails or the process was
  interrupted before it could roll back, manual recovery is the fallback.
  Provide the batch ID, archive and source commits, and paths that still need
  attention when they are known.
- The CLI owns selection, link updates in archived copies, Git operations,
  and failure handling so direct callers use the same rules as the skill.
- The skill can use the preview to suggest a batch name and description that
  summarize the eligible work.
- `cr idea archive <idea>` continues to mark an idea archived when it has
  been turned into tickets. Project cleanup later checks whether those tickets
  are closed and the complete group can move.

## Agreed archive browsing

- `cr archive list` lists the batch directories at the archive branch tip.
  Display the full batch ID with the newest date first and a stable name order
  for batches on the same date. Before the first archive, return an empty list.
- `cr archive plans <batch-id>` lists the plan hierarchy for one batch with
  idea titles, parent-child relationships, and artifact paths.
- `cr archive tickets <batch-id>` lists the tickets for one batch with their
  IDs, titles, and paths. Sort tickets by numeric ID within the batch.
- Use `cr archive read <batch-id>/<path-to-file>` with one argument. The
  listing commands should expose file paths in that form so users and agents
  can pass them directly to `read`. For example, read a batch overview with
  `cr archive read 2026-11-25_doctor-and-link-maintenance/README.md`.
- Read the exact archived bytes from the Git tree without checking out the
  archive branch. Report a clear error for an unknown batch, a missing file,
  a directory, or a path that escapes the batch.
- Use the existing `--json` convention for structured listings. The read
  command returns file content on stdout without a header or JSON wrapper.

## Module boundaries

- Register the top-level command in `src/commands/cr.ts`. Archive command
  modules own argument parsing and human or JSON output for the agreed CLI.
- Archive selection owns committed-file validation and grouping for preview
  and apply. Use `getIdeaTree` and the existing idea frontmatter validator
  for hierarchy and status. The idea tree lists idea nodes and their immediate
  files, so enumerate all committed plan artifacts separately for packaging.
- Share the ticket inventory and authoritative path checks underlying
  `src/commands/doctor/tickets.ts`, extracting the reusable inventory logic
  from doctor-specific reports and repair actions. Archive needs one scan of
  current tickets, including dependencies, duplicate targets, status, and
  exact paths. `resolveTicket` resolves by numeric ID and rescans directories
  for each call, so it is unsuitable for validating exact link destinations.
- Reuse the recursive Markdown discovery, link tokenizer, and destination
  formatting in `src/tickets/plan-links.ts`. The existing inspector filters
  to recognized ticket filenames and is used by doctor. Share its lower-level
  link scan with configurable source and destination directories to cover all
  Markdown under `.coderail/`, plan artifact links, and invalid targets.
  Reuse the formatting and edit logic to transform archived copies in memory.
  The existing status-move updater writes directly to live plans, so it remains
  with the status commands.
- Archive Git operations own reading and updating the local archive ref and
  constructing a batch without using the caller's index. No reusable archive
  tree or ref helper exists in the CLI. The Git runner in verify is local to
  changed-file selection and text-only. Reuse filesystem temporary-resource
  handling and keep archive Git operations isolated from command formatting.
  Apply coordinates selection, recording, guarded deletion and rollback.
- `assets/instructions/skills/archive/SKILL.md` owns user-facing orchestration
  through the CLI, including describing the batch before apply and reporting
  phase-specific failures.

## Concurrent changes

- V1 relies on the confirmed requirement to pause concurrent updates during
  apply. Coderail adds no worktree lock or coordination to ticket, idea, or
  doctor commands for archiving.
- Recheck selected files after terminal confirmation and before deletion.
  Abort or roll back when a conflicting change is detected. These checks do
  not provide isolation from concurrent modifications.
- Protect the archive ref with an expected-tip update because multiple
  worktrees can share it.

## Verification expectations

- Verify closed standalone tickets and legacy archived plans are eligible.
  Verify dependencies, duplicate chains, links between plans and tickets,
  links to plan artifacts, and retained Coderail documents keep connected
  groups intact. Cover split trees whose last child is still open.
- Verify stale ticket links stop preview and apply without repairs. Cover
  uncommitted candidates, unrelated local changes, and links outside the
  archive scan. Verify archived links remain usable after flattening.
- Verify the first archive commit has no parent and subsequent batches
  preserve earlier batches. Cover same-day name collisions, repeated ticket
  IDs across batches, and the browsable directory layout. Verify list, plans,
  tickets, and read without changing the source checkout, index, or archive ref.
- A phase 1 or 2 failure leaves source files and the archive ref unchanged.
- Simulate a deletion failing after an earlier deletion succeeded. Apply
  restores the exact committed original and removes only its own batch from
  the archive tip. The command reports failure and successful rollback.
- Simulate a conflicting file appearing before restoration, and a Git failure
  while removing the batch. Apply preserves unrelated changes, keeps the batch
  accessible, and reports what still requires manual recovery.
- Verify that declining the confirmation or running without a terminal and
  without `--yes` leaves files and refs untouched. Verify that an explicit
  approval works without a terminal and that a subsequent detectable source
  change stops apply. Verify that competing archive ref updates cannot
  overwrite an existing batch.

## Implementation freedom

- The agreed CLI and skill are the public interfaces. Internal helper names,
  graph representation, Git plumbing commands, diagnostic wording, and fixture
  layout are implementation choices within the boundaries above.
