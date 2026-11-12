---
id: "0044"
slug: "diagnose-ticket-metadata-and-authoritative-file-placement"
title: "Diagnose ticket metadata and authoritative file placement"
status: "closed"
created_at: "2026-11-12T10:20:46.343Z"
updated_at: "2026-11-12T10:59:52.650Z"
dependencies:
  - "0042"
reason: "done"
---

# Diagnose ticket metadata and authoritative file placement

Add tolerant ticket health diagnostics to project doctor checks, deriving identity and expected location from frontmatter rather than filenames. All findings in this slice are diagnostic/manual; 0046 adds safe relocation.

## Tasks

1. [x] Add tolerant ticket inventory and metadata regression fixtures
2. [x] Implement frontmatter-based inventory and metadata checks
3. [x] Integrate ticket findings into project diagnostics and verify

## Task details

### 1. Add tolerant ticket inventory and metadata regression fixtures

Scope: new `tests/commands/doctor/tickets.test.ts` and project/command integration tests.

Expected outcome: cover valid tickets, malformed frontmatter/field types, invalid filenames, duplicate frontmatter IDs, title/slug mismatch, status/directory mismatch and closed reason/duplicate-of requirements. Include unreadable files beside healthy and independently broken tickets, absent ticket directories, and cancellation. Verify that filename/directory disagreement does not change metadata identity; diagnostics and --repair leave ticket bytes unchanged in this slice.

Validation: fixtures demonstrate missing diagnostics before implementation; assert independent findings survive individual inventory failures and no metadata is inferred from filenames.

### 2. Implement frontmatter-based inventory and metadata checks

Scope: new `src/commands/doctor/tickets.ts`, reusing Markdown parsing, ticket field conventions and Text.slugify.

Expected outcome:

- Export `Tickets.check(projectRoot: string, signal: AbortSignal): Promise<DoctorReport>` and collect a tolerant inventory independently of filename-based resolveTicket/getTicketList.
- Validate ticket identity, title/slug consistency, status, dependencies and closure metadata (done/dismissed/duplicate with required duplicate-of). Derive expected `<id>-<slug>.md` and open/active/closed directory only from valid metadata.
- Report malformed metadata, invalid filenames, incorrect placement and duplicate IDs without stopping other checks. Preserve frontmatter authority even when current filenames disagree.
- Retain enough validated per-file identity/reference information for follow-up graph checks and guarded moves; private structures remain implementation choices. Do not invent graph conclusions from unavailable metadata or choose an identity among duplicates.

Validation: task 1 fixtures pass with paths and useful manual guidance; wrong placement never causes metadata rewriting, and unavailable files do not hide independent diagnostics.

### 3. Integrate ticket findings into project diagnostics and verify

Scope: `src/commands/doctor/project.ts` and related integration tests, building on 0042's completed project changes.

Expected outcome: include Tickets.check findings/skips during both initial and post-repair project checks, with verbose context on stderr and final findings through existing collected output. Preserve project discovery, no-project behavior and bootstrap operation with invalid config.

Validation: task 1 project/command scenarios pass; run per-file `cr verify` for each modified/new src and tests file and fix failures until all pass.

## References

- [Agreed repair specification](../../plans/doctor-command---repair-flag/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [src/commands/doctor/project.ts](../../../src/commands/doctor/project.ts)
- [src/commands/ticket/create.ts](../../../src/commands/ticket/create.ts)
- [src/commands/ticket/helpers/resolve-ticket.ts](../../../src/commands/ticket/helpers/resolve-ticket.ts)
- [src/commands/ticket/get-ticket-list.ts](../../../src/commands/ticket/get-ticket-list.ts)
- [src/utils/text.ts](../../../src/utils/text.ts)
- [src/md/helpers/frontmatter.ts](../../../src/md/helpers/frontmatter.ts)
- [tests/commands/doctor/project.test.ts](../../../tests/commands/doctor/project.test.ts)
- Dependency: [0042 — Repair doctor project initialization with collected actions](0042-repair-doctor-project-initialization-with-collected-actions.md)
