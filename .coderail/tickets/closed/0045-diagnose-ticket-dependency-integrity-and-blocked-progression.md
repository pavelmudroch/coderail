---
id: "0045"
slug: "diagnose-ticket-dependency-integrity-and-blocked-progression"
title: "Diagnose ticket dependency integrity and blocked progression"
status: "closed"
created_at: "2026-11-12T10:20:48.805Z"
updated_at: "2026-11-12T11:05:16.858Z"
dependencies:
  - "0044"
reason: "done"
---

# Diagnose ticket dependency integrity and blocked progression

Extend 0044's frontmatter inventory to report reference/cycle defects and unfinished tickets whose required chains cannot progress, while accepting ordinary waiting dependencies. Keep graph repairs manual.

## Tasks

1. [x] Add dependency integrity and progression regression fixtures
2. [x] Diagnose reference integrity and combined graph cycles
3. [x] Evaluate blocked progression with causal chains and verify

## Task details

### 1. Add dependency integrity and progression regression fixtures

Scope: ticket doctor tests introduced by 0044 and focused command output cases.

Expected outcome: cover missing/ambiguous/unusable targets, metadata IDs at mismatched locations, self-references, direct/transitive dependency cycles, duplicate-of target existence and duplicate/mixed-edge cycles. Cover direct/transitive dismissed blockers, duplicate chains ending in done/pending/blockers and healthy waiting chains. Include done tickets with broken historical references/cycles and unavailable metadata alongside independent findings.

Validation: failing cases distinguish historical graph integrity from dependency satisfaction, show affected unfinished tickets and causal paths, and assert no ticket mutations in plain or repair mode.

### 2. Diagnose reference integrity and combined graph cycles

Scope: `src/commands/doctor/tickets.ts`, extending its tolerant inventory.

Expected outcome: resolve dependency and duplicate-of references by frontmatter IDs even when location is wrong. Report missing/ambiguous/unusable targets, self-references and cycles across dependency and duplicate edges. Inspect historical references/cycles even for closed/done tickets. Avoid speculative graph conclusions from unreadable/malformed metadata and never select among duplicate identities.

Validation: task 1 integrity fixtures pass and independent findings survive broken inventory entries; each defect includes useful paths/IDs and manual correction guidance.

### 3. Evaluate blocked progression with causal chains and verify

Scope: ticket progression analysis and existing doctor rendering integration.

Expected outcome: unfinished tickets are stuck when their required chains reach dismissed, missing/unusable targets or unresolvable cycles, including transitive effects. Open/active dependencies without a blocker are normal pending. Follow closed/duplicate targets to done, pending or a blocker; done satisfies incoming dependencies without traversing its historical dependencies for readiness. Report causal chains and affected tickets. Do not close/reopen tickets, alter reasons, remove edges or choose duplicate targets. Preserve existing ticket command dependency semantics.

Validation: all task 1 fixtures pass, including done-history versus readiness distinction and healthy pending chains; command output exposes actionable causal context. Run per-file `cr verify` for all modified src/tests files and fix until each passes.

## References

- [Agreed repair specification](../../plans/doctor-command---repair-flag/IDEA.md)
- [Repository verification instructions](../../../AGENTS.md)
- [src/commands/ticket/helpers/are-dependencies-satisfied.ts](../../../src/commands/ticket/helpers/are-dependencies-satisfied.ts)
- [src/commands/ticket/helpers/get-ready-tickets.ts](../../../src/commands/ticket/helpers/get-ready-tickets.ts)
- [src/commands/ticket/helpers/resolve-ticket.ts](../../../src/commands/ticket/helpers/resolve-ticket.ts)
- [tests/commands/doctor.test.ts](../../../tests/commands/doctor.test.ts)
- Dependency: [0044 — Diagnose ticket metadata and authoritative file placement](0044-diagnose-ticket-metadata-and-authoritative-file-placement.md)
- Implementation target introduced by 0044: `src/commands/doctor/tickets.ts` and `tests/commands/doctor/tickets.test.ts`.
