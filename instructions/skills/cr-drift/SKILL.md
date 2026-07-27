---
name: cr-drift
description: Reconcile implementation discoveries with the project specification and affected tickets.
disable-model-invocation: true
---
Reconcile implementation discoveries with the project specification and affected tickets.

## Purpose

If `.coderail/DISCOVERY.md` exists, verify its findings against the repository, update the specification, reconcile affected open tickets, and record the resolution result.

If the file does not exist, tell user "no discoveries found", and exit.

## Responsibilities

* Read `.coderail/DISCOVERY.md`.
* Verify each discovery against the repository.
* Update the specification for verified discoveries.
* Reconcile affected tickets against the updated specification.
* Record the discovery resolution result.
* Summarize all changes.

Do **not**:

* implement code,
* review code quality,
* fix tests,
* redesign unrelated architecture,
* modify tickets before updating the specification.

## Source of Truth

Priority:

1. Repository reality
2. Specification
3. Tickets
4. Discovery findings

Discoveries are evidence, not truth.

## Discovery Processing

For each discovery:

1. Locate the referenced specification section.
2. Verify the finding using repository evidence.
3. Classify it as:

   * `verified`
   * `rejected`
   * `stale`
   * `needs-user-decision`

Reject findings caused by:

* implementation bugs,
* incomplete work,
* failed tests,
* poor code quality,
* unsupported assumptions.

When repository evidence cannot determine the correct architectural decision,
classify the finding as `needs-user-decision` and preserve it for user input.

## Update Specification

For verified discoveries:

* document newly discovered constraints,
* correct obsolete or inaccurate assumptions,
* remove obsolete planned approaches,
* make only the minimal required changes.

Do not rewrite unrelated sections.

## Reconcile Tickets

After updating the specification:

Review all tickets and update only those affected by the revised specification.

Allowed changes:

* tasks
* acceptance criteria
* dependencies
* scope
* split/merge
* close obsolete tickets
* reopen completed tickets only when additional implementation is required

Leave unaffected tickets unchanged.

## Resolve Discoveries

After processing:

* remove verified, rejected, and stale discoveries,
* keep `needs-user-decision`,
* preserve unrelated discoveries and other fields in the first frontmatter block,
* write exactly one `resolved` field in the first frontmatter block before
  returning successfully:
  * `resolved: true` when no `needs-user-decision` findings remain;
  * `resolved: false` when any `needs-user-decision` finding remains.

Legacy discovery documents without a `resolved` marker are valid input. Do not
delete `.coderail/DISCOVERY.md`; the ticket-loop command owns deletion after it
validates `resolved: true`.

## Validation

Before finishing:

* verify every spec change is supported by repository evidence,
* verify every ticket change follows from the updated specification,
* preserve unresolved discoveries,
* verify the first frontmatter block contains exactly one exact boolean
  `resolved` marker,
* respect repository conventions.

## Report

Summarize:

* verified/rejected/stale/pending discoveries,
* updated specification sections,
* modified tickets,
* remaining discoveries, if any.
