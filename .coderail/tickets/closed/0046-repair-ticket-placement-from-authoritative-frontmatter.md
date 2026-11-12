---
id: "0046"
slug: "repair-ticket-placement-from-authoritative-frontmatter"
title: "Repair ticket placement from authoritative frontmatter"
status: "closed"
created_at: "2026-11-12T10:20:51.534Z"
updated_at: "2026-11-12T11:30:23.991Z"
dependencies:
  - "0042"
  - "0045"
reason: "done"
---

# Repair ticket placement from authoritative frontmatter

Offer byte-preserving ticket moves/renames when authoritative metadata is valid, identity is unique and the destination is free. Use 0042's action contract and 0045's completed inventory/graph diagnostics.

## Tasks

1. [x] Add guarded relocation and repair integration tests
2. [x] Attach safe metadata-driven ticket move actions
3. [x] Verify complete doctor repair behavior and convergence
4. [x] Reject edits made during relocation eligibility revalidation

## Task details

### 1. Add guarded relocation and repair integration tests

Scope: ticket doctor tests and command-level repair fixtures.

Expected outcome: cover wrong filenames/directories, valid closed/open/active destinations, occupied destinations, duplicate IDs, invalid identity/status/closure metadata and title/slug disagreement. Verify exact byte/timestamp-content preservation, unchanged healthy tickets, no writes in plain doctor, input changed since collection, destination occupied after collection, partial failure, cancellation and repeated invocation. Include independent metadata/graph defects that remain manual.

Validation: fixtures first demonstrate absent relocation behavior; use the representative 0042/fix-parser/closed case from IDEA.md and inspect both destination bytes and source removal.

### 2. Attach safe metadata-driven ticket move actions

Scope: `src/commands/doctor/tickets.ts`, using DoctorRepair without new shared APIs.

Expected outcome: offer rename/move only for valid authoritative frontmatter with unique identity and unoccupied destination. Stable keys deduplicate location findings sharing one action. Revalidate input, identity eligibility and destination before mutation; changed content or newly occupied destination produces an action failure rather than overwriting work. Preserve file contents including timestamp metadata. Metadata conflicts, duplicate IDs and graph errors remain manual fixes; do not rewrite metadata to fit filenames. Rechecking resolves references through metadata IDs at the new location.

Validation: task 1 relocation fixtures pass, including no clobbering and unchanged bytes; unsupported findings never acquire graph/metadata rewrite actions.

### 3. Verify complete doctor repair behavior and convergence

Scope: command integration fixtures spanning initialization and ticket actions, building on the shared runner from 0042. Instruction action integration is owned by independent ticket 0043.

Expected outcome: mixed supported/manual findings produce repaired and unresolved results; action failure does not prevent independent repairs; cancellation leaves completed work without rollback. Recheck runs all phases once, never recursively repairs new findings, and final diagnostics alone determine exit status. Repeated invocations converge without rewriting healthy files or ownership baselines. --non-interactive requires no prompts.

Validation: task 1 and relevant doctor suites pass; Run per-file `cr verify` for every modified/new src or tests file, fixing failures until each passes.

### 4. Reject edits made during relocation eligibility revalidation

Scope: `src/commands/doctor/tickets.ts:260-281` and relocation regression tests.

Blocking review finding: the byte comparison runs before the asynchronous full inventory rescan. That rescan only checks for the same source-path repair key, so changed content and a changed authoritative destination can still pass. A deterministic reproduction reads the original source for the action's initial comparison, then writes valid closed/done metadata before the fresh inventory reads it. The action succeeds and moves the edited ticket into the previously collected open destination; final diagnostics report incorrect placement. This violates the changed-input failure and authoritative-destination requirements.

Expected outcome: after eligibility revalidation and directory preparation, validate the source against the originally collected bytes before linking; reject changed inputs rather than executing the stale move. Ensure eligibility remains tied to the collected identity and destination. Preserve the edited source and leave the old destination absent on failure.

Validation: add a deterministic test injecting an edit during the rescan, including a valid status/destination change and a body-only edit. Both must fail without relocating the source. Run the relevant doctor tests and per-file `cr verify` for modified source/test files.

## References

- [Agreed repair specification](../../plans/doctor-command---repair-flag/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [src/commands/doctor/types.ts](../../../src/commands/doctor/types.ts)
- [src/commands/doctor.ts](../../../src/commands/doctor.ts)
- [src/commands/ticket/helpers/resolve-ticket.ts](../../../src/commands/ticket/helpers/resolve-ticket.ts)
- [tests/commands/doctor.test.ts](../../../tests/commands/doctor.test.ts)
- Dependency: [0042 — Repair doctor project initialization with collected actions](0042-repair-doctor-project-initialization-with-collected-actions.md)
- Dependency: [0045 — Diagnose ticket dependency integrity and blocked progression](0045-diagnose-ticket-dependency-integrity-and-blocked-progression.md)
- Implementation target introduced by 0044: `src/commands/doctor/tickets.ts` and `tests/commands/doctor/tickets.test.ts`.
