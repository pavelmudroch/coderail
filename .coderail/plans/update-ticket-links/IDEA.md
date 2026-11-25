---
title: "Update ticket links"
status: "archived"
---

Keep links to tickets correct when Coderail changes ticket status, including
concurrent transitions that update links in the same plan document.

## Confirmed outcome

- On a ticket status change, recursively find links to that ticket in Markdown
  files under the plan directory and replace their destinations with its new path.
- Coordinate concurrent status changes with locking so updates are not lost.
- Lock contention retries every 100 ms with a 30-second acquisition timeout.
- Use a per-ticket lock across the transition and all link updates, plus a
  per-Markdown-file lock around each document read/modify/write. Different
  tickets may update different documents concurrently.
- Collect and report failures/warnings with the Markdown paths that could not
  be updated and their causes. Continue independent file updates. Automatic
  recovery and rollback are outside scope; an agent can act on the report.
- When the ticket transition succeeds but link maintenance is incomplete,
  preserve the successful transition's exit status and existing JSON result
  shape. Print collected path-specific warnings and causes to stderr. Do not
  turn link-maintenance failures into a failed ticket transition.
- Rewrite local inline Markdown links and reference-style definitions, preserving
  labels, optional titles and anchors. Skip external URLs, bare paths and link
  examples inside fenced/indented code blocks or inline code.
- Doctor must also support link repair and reuse the ticket operation mechanism
  and locks. Collect problematic tickets first, then invoke the shared operation
  for each ticket rather than making independent uncoordinated document writes.
- Identify a linked ticket by its exact ID and slug, then resolve the link
  relative to the containing Markdown file and verify that its destination is
  inside this project's `.coderail/tickets/` directory. A stale status path
  need not exist on disk to qualify. Update qualifying links from any status.
  A matching filename outside the ticket directory does not qualify.
- Explore the design here; implementation and ticket generation are outside scope.

## Current understanding

- The established directory is `.coderail/plans/`, via `Path.PLANS_DIR`; the
  request's `.coderail/plan` is interpreted as referring to this directory.
- `src/commands/ticket/activate.ts`, `close.ts`, and `reopen.ts` each resolve,
  validate and write tickets independently. Moving writes the destination with
  changed frontmatter and then removes the source. There is no transition lock.
- Verified `src/fs/write.ts` already provides write-scoped exclusion: exclusively
  create a sibling `.~<basename>.lock` using `createNew: true`, stream the new
  content into it, close it, and rename it over the destination. Existing locks
  cause immediate failure; no retry or timeout is provided. Failed writes retain
  a registered temporary resource for cleanup. `src/fs/replace.ts` only renames.
- Activate, close and reopen all use `Fs.write`, so they already stage file
  replacement. That write lock is acquired after ticket resolution, reading and
  validation, and is keyed to the destination pathname, including status folder.
  It cannot protect a full read/modify/write cycle or serialize moves of the
  same ticket to different status directories. A later writer can publish stale
  contents after an earlier writer's lock has disappeared through rename.
- Retain existing `Fs.write` staging for document replacement beneath a separate
  operation lock. The outer document lock must use a distinct stable identity:
  acquiring `Fs.write`'s own temporary pathname first would make Fs.write fail.
  No filesystem helper rewrite is inherently needed to add operation locks.
  User explicitly confirmed retaining this existing Fs.write mechanism.
- Reopen accepts tickets in any status, including an already-open ticket, and
  can update dependencies without moving it. Activate and close reject statuses
  that do not permit their transitions.
- Plan documents use relative links such as
  `../../tickets/open/0046-repair-ticket-placement-from-authoritative-frontmatter.md`.
  Archived plans contain links whose status directory is already stale.
- `src/commands/doctor/tickets.ts` also repairs ticket placement based on
  authoritative frontmatter. Its existing contract explicitly excludes isolation
  from concurrent external mutations. This idea now extends isolation to
  participating ticket commands and doctor repairs using shared operation locks.
- Verified doctor already collects findings/actions, deduplicates repair actions,
  executes them serially with `runRepairs`, then rechecks diagnostics once.
  Existing ticket placement actions revalidate eligibility/bytes and use an
  exclusive hard-link plus unlink move to avoid clobbering an occupied destination.
  Preserve these guards when integrating the shared operation mechanism.
- `src/installation/activation.ts` has an installation-scoped directory lock,
  which fails immediately on contention and requires manual crash recovery.
  It is separate from project ticket operations.
- `src/md/` parses frontmatter and streams document bodies; it does not provide
  a Markdown link parser or destination rewrite facility.

## Agreed link behavior

- Scan `.coderail/plans/` recursively, including archived ideas and helper
  documents, irrespective of their filenames. Missing plans directory is an
  empty scan. Restrict writes to regular Markdown files inside that directory;
  do not follow symlinks outside it.
- Match local Markdown link destinations by resolved ticket path, relative to
  the containing document. Preserve link labels, optional titles, anchors,
  unrelated content, and document formatting; write only changed documents.
  Apply the agreed inline/reference link scope and code/external exclusions.
- Apply the confirmed ID-and-slug plus resolved-directory identity rule above;
  do not match by ID substring or modify links to other tickets.
- Example: closing ticket 0046 updates links through open or active to
  `../../tickets/closed/0046-repair-ticket-placement-from-authoritative-frontmatter.md`,
  using the appropriate relative depth for each containing document.
- Keep existing CLI arguments. Use the agreed stderr-warning contract for
  incomplete link maintenance while preserving ticket result output and exit
  status. Ticket transition failures retain existing command error behavior.

## Agreed concurrency and failure contract

- Acquire the ticket lock before resolving and validating its transition. Hold
  it until link maintenance and final ticket result resolution complete.
- Ticket-lock timeout fails before mutation. A Markdown-lock timeout records
  that document as a failed update and allows other documents to proceed.
- Agreed timing: the CLI process stays alive and asynchronously retries exclusive
  acquisition every 100 ms, up to 30 seconds. Reread protected state after
  acquisition; release in finally.
- Hold at most one document lock at a time, consistently acquiring ticket
  before document locks. Keeping the ticket lock through all rewrites prevents
  two transitions of one ticket from publishing destinations out of order.
- Per-file locking permits readers to observe partially completed link updates
  across documents. A later document timeout/failure may occur after the ticket
  and earlier documents changed. Collect path-specific errors/warnings and
  continue independent documents; do not roll back or automatically recover.

## Agreed scan/update sequence

- Under the ticket lock, scan all plan Markdown files for candidate links to
  this ticket before starting document updates. Discovery does not acquire
  document locks; its contents must never be reused as the write source.
- Apply the valid ticket transition, then process candidates serially. For
  each candidate acquire its document lock, reread current contents, rematch
  qualifying links and recompute replacements, write only if needed, and release.
  A candidate with no remaining matching links becomes a no-op.
- Collect discovery/read failures as well as lock/write failures. When a file
  cannot be inspected, report that its links could not be checked. Continue
  inspecting accessible files and updating independent candidates.
- Use atomic replacement for each document so an unlocked candidate scan does
  not observe a truncated in-progress write from another participating command.
  Stable lock identity must survive destination replacement; locking solely
  the replaced document inode would not provide that guarantee.
- Cancellation stops further work and releases
  held locks; FIFO acquisition order is not promised. Concurrent external
  editors or additions of links after discovery are outside isolation guarantees.
- Use exclusively created lock files at the agreed identities below. Automatic
  stale-lock recovery remains outside scope.
- This lock coordinates participating Coderail commands, not arbitrary editors.
  Doctor ticket placement and link repairs must participate in the same locks.

## Agreed doctor integration

- Plain doctor collects diagnostics only. Doctor --repair collects affected
  ticket identities and schedules per-ticket actions through its existing
  serial runner. Do not invoke a nested CLI status command: doctor repairs
  must not activate, close or reopen a ticket as a side effect of fixing links.
- The shared ticket operation acquires the ticket lock, revalidates current
  authoritative state, performs an eligible placement repair if needed, then
  updates plan links under the same per-document locks used by status commands.
  Combine placement and link findings for a ticket into one repair operation.
- Diagnose stale plan links even when the ticket is already
  correctly placed, and offer a links-only repair to its current valid path.
  Do not infer a destination for missing or ambiguous ticket identities; report
  those for manual handling. Reuse the existing tolerant metadata inventory.
- Reread state after locking; discovery is a candidate list, not authority to
  overwrite a newer transition. Preserve placement repair's existing changed-
  input and destination-occupancy protections.
- Report path-specific maintenance failures and continue independent files and
  tickets. Preserve doctor's collect/repair/recheck structure. Retain
  its diagnostic exit contract: unresolved stale-link findings after recheck
  produce exit 1, even though successful ticket status commands retain exit 0
  with link-maintenance warnings. This distinction is agreed.

## Agreed operation-lock identity

- Store operation locks in `.coderail/.locks/`, scoped to the canonical project
  root. Resolve equivalent project-root aliases to the same physical root.
- Ticket lock: `.coderail/.locks/tickets/<id>.lock`, using normalized ticket ID
  only, independent of status directory or slug. Example: `0046.lock`.
  Normalize existing CLI ID/filename/path identifiers before acquiring; reread
  and validate the ticket under the lock. Identity derivation must not depend
  on an unlocked status-directory lookup succeeding during another move.
- Markdown lock: `.coderail/.locks/markdown/<sha256>.lock`, where the hash input
  is the normalized project-relative document path with `/` separators.
  Example input: `.coderail/plans/update-ticket-links/IDEA.md`. Preserve path
  case on case-sensitive filesystems and ensure supported aliases on other
  filesystems cannot produce distinct locks for the same document.
- Hashing bounds filename length and avoids path separators; it is unrelated to
  document contents. File replacement leaves the lock identity unchanged.
- Use exclusive file creation to acquire and file removal in finally
  to release. These lock files never become replacement document content.
  Keep Fs.write's existing sibling staging files unchanged and distinct.
- Apply the agreed retry/timeout to file acquisition. Never delete an
  existing lock just because the timeout expired. An abrupt process termination
  can leave a lock file; automatic stale-lock recovery is outside scope.
- Failed-acquisition diagnostics should name the ticket/document and lock path,
  rather than exposing only the Markdown path hash.

## Temporary-resource integration

- User approved the operation-lock identities above and requested checking reuse
  of existing filesystem temporary-resource registration.
- Verified `src/fs/make-temp-directory.ts`: `Fs.makeTempDirectory` creates a
  randomly named directory and calls `registerTempResource(path)`. Random names
  cannot themselves coordinate operations on a shared deterministic identity.
- `src/fs/temp/register-temp-resource.ts` and `unregister-temp-resource.ts`
  maintain the process-local resource-path registry. `Fs.write` already registers
  only after exclusive creation succeeds and unregisters after publishing.
- `src/fs/temp/cleanup-temp-resources.ts` removes registered paths recursively,
  tolerating missing paths. `src/runtime/cleanup.ts` calls `Fs.cleanup()`;
  `src/main.ts` invokes runtime cleanup in finally. Signal handlers request
  cancellation so orderly unwinding can reach this cleanup.
- Agreed reusable primitive: `Fs.makeTempFile(path: string): Promise<TempFile>`, with
  `TempFile = { readonly path: string; remove(): Promise<void> }`, implemented
  in `src/fs/make-temp-file.ts` and exposed through `src/fs.ts`. Create an empty
  file at exactly the supplied path with `createNew: true`, close the handle,
  and register only the owned file. Existing paths reject immediately without
  registration or modification. The returned resource supports prompt removal
  and unregistration. Parent directories may be ensured, but never registered
  as owned temporary resources by this call. No retry policy in this primitive.
- A separate shared locking wrapper consumes this primitive and owns retry,
  timeout, cancellation and holding/removing the resource around a callback.
  The reviewed ticket wrapper and shared private routine are defined below. Ticket code
  owns ticket/document identity construction; generic Fs code does not know
  ticket IDs, plan roots or Markdown hashing.
- Register only after successfully creating the exact lock file. Never
  register an existing contended lock or the shared `.locks` parent directory.
  On normal release remove and immediately unregister before yielding again;
  otherwise later cleanup could delete another process's reacquired lock.
  Leave an unreleased owned lock registered if removal fails, for runtime cleanup.
- A successfully removed resource handle is released: repeated remove calls
  must not delete a new file another process has subsequently created there.
- Cleanup is a fallback; release each document lock promptly in finally rather
  than waiting for process cleanup. Do not run global cleanup while protected
  operations are still active. Forced termination can still leave stale locks;
  this reuses orderly cleanup without adding automatic crash recovery.
- The `Fs.makeTempFile` signature, resource handle and ownership/removal contract
  and the shared ticket/document locking boundaries below are agreed.

## Agreed module ownership and public interfaces

- Keep CLI parsing, command-specific validation, closure metadata and reopen
  dependency behavior in the existing three command modules.
- `src/fs/make-temp-file.ts`, exported through `src/fs.ts`: agreed
  `Fs.makeTempFile(path: string): Promise<TempFile>` and its removable registered
  resource. Keep `Fs.write` unchanged.
- `src/tickets/with-ticket-lock.ts`, exported through `src/tickets.ts`:
  `withTicketLock<T>(projectRoot: string, identifier: string, signal: AbortSignal,
  run: () => Promise<T>): Promise<T>`. Normalize CLI ticket identity without
  requiring an unlocked lookup, acquire the stable ID lock, await the callback
  and release. The caller resolves/revalidates fresh ticket state in the callback.
- `src/tickets/plan-links.ts`, exported through `src/tickets.ts`, owns shared
  recursive discovery, link parsing/matching and per-document updates. Agreed
  public functions:
  `scanTicketLinks(projectRoot: string, target: TicketLinkTarget,
  signal: AbortSignal): Promise<TicketLinkScan>` and
  `updateTicketLinks(projectRoot: string, target: TicketLinkTarget,
  scan: TicketLinkScan, signal: AbortSignal): Promise<LinkWarning[]>`.
  `TicketLinkTarget = { id: string; slug: string; path: string }` describes the
  desired destination (the planned new path before a status transition).
  `TicketLinkScan = { files: string[]; findings: TicketLinkFinding[];
  warnings: LinkWarning[] }`, with findings recording document path, existing
  destination and expected destination. Include all matching candidate files;
  only stale destinations are doctor findings. `LinkWarning = { path: string;
  message: string }`. Update rereads candidates under document locks and never
  writes discovery snapshots. Callers combine scan and update warnings.
- A private shared lock-acquisition routine may serve ticket and document locks
  using Fs.makeTempFile with the agreed timing; its incidental location is an
  implementation choice. No additional public generic lock framework is needed.
- Status commands use withTicketLock around fresh resolution, scan, existing
  mutation and update. Doctor collection uses scan to identify findings; each
  per-ticket repair action uses withTicketLock, fresh eligibility checks, a
  fresh scan, guarded placement repair if necessary and update. Keep doctor's
  tolerant inventory and guarded move rather than routing it through the
  filename-based status command resolver.
- Existing `src/commands/doctor/tickets.ts` owns integration with DoctorReport,
  per-ticket repair deduplication and diagnostic recheck, using shared helpers.
- Already-open reopen still runs scan/update
  without rewriting ticket bytes or timestamps solely for link maintenance.
- Private parsing algorithms, helper layout and fixture organization remain
  implementation choices within these reviewed public boundaries.

## Verification expectations

- Cover activate, close (all reasons), reopen, and already-open reopen behavior.
- Cover nested plan directories, archived plans, multiple occurrences and files,
  two ticket links in one file, unchanged files, and absent plans directory.
- Cover relative path depth, stale status paths, reference links,
  anchors/titles, exact identity matching, and preservation of unrelated bytes.
- Exercise concurrent processes changing different tickets referenced in the
  same document; both rewrites survive. Exercise competing changes to one ticket:
  validate against fresh state after locking and preserve existing status rules.
- Cover contention, cancellation, timeout, lock release after failures, and the
  agreed partial-failure reporting contract. Check that later files are attempted
  after a failure and reports name unreadable/unmodified files accurately.
- Cover candidate rereads preserving another ticket's intervening rewrite,
  atomic document replacement, and stable document lock identity.
- Cover Fs.makeTempFile exclusive acquisition, registration only of owned files,
  immediate rejection of existing paths, prompt release/unregistration, repeated
  removal after release, and orderly cleanup without deleting other owners' locks.
- Cover doctor's plain read-only diagnostics, links-only findings, combined
  per-ticket placement/link repairs, metadata ambiguity, changed inputs and
  destination occupancy. Preserve guarded moves and ticket bytes/metadata.
- Cover doctor competing with status commands through the same locks and fresh
  state validation, serial deduplicated repair actions, one diagnostic recheck,
  and exit 1 for unresolved findings. Cover status-command warnings on stderr,
  unchanged JSON result shape and successful exit after link-maintenance failure.
- No verification commands are needed for this planning-only exploration.

## Remaining implementation freedom

- No unresolved product or architectural decisions remain.
- Parsing implementation, private lock routine location, internal helper names,
  diagnostic wording and fixture layout remain implementation choices. Preserve
  the agreed behavior, module boundaries and public interface contracts.

## Readiness

- Outcome, scope, behavior, concurrency and failure contracts, doctor integration,
  filesystem lifecycle, module boundaries, public functions and verification
  expectations have been reviewed and agreed.
- Keep this as one idea: status commands and doctor share link matching, resource
  ownership and concurrency contracts. No decomposition is needed for exploration.
- Ready for implementation ticket generation. This exploration changes planning
  artifacts only; no implementation tickets or source changes were created.
