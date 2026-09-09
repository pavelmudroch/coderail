---
title: Ticket management
status: ready
---

## Desired Outcome

Users and agents can manage a repository ticket queue with clear lifecycle and dependency rules, independently of idea selection or managed Git branches.

## Understanding

* Inherits shared decisions and constraints from [Coderail v2.0](../IDEA.md).
* Covers `ticket`, ticket content, source-spec references, lifecycle, and dependencies. Agent execution belongs to `loop`.
* The user chooses which ideas become tickets and when. A queue may contain tickets from multiple ideas.
* Tickets derived from a specification link to it in their body. Agents can consult it and, if needed, its idea. Users can also create standalone tickets without a specification.
* Tickets should contain enough context to implement ordinary work without consulting their source specification or idea.
* `work` is not required. `loop` consumes the ticket lifecycle and eligibility rules defined here.

## Decisions

* The tool owns ticket front matter; agents and users own the content body. Specification references belong in the body as links, not in front matter.
* Agents and users maintain specification links when files move. `doctor` reports broken links; ticket commands do not rewrite body links automatically.
* `ticket create` does not require a specification or a `--spec` option. Absence of a specification link is valid for standalone tickets.
* A dedicated skill guides agents to create and preserve a specific ticket body structure covering outcome, context, tasks, acceptance criteria, verification, and a specification link when applicable.
* Recommend the same body structure for user-created tickets, without CLI enforcement. Exact structure and skill instructions belong in the specification.
* Retain `create`, `next`, `activate`, `close`, `deactivate`, and `reopen`. Move `loop` to the agreed top-level command and remove deprecated `ticket clean`.
* Remove `ticket validate`. Top-level `doctor` owns explicit ticket validation, including malformed tickets, broken references, and dependency cycles.
* Ticket commands still enforce rules needed for their operation; for example, `activate` rejects tickets with unsatisfied dependencies.
* Retain exactly three lifecycle states: `open`, `active`, and `closed`.
* Allow multiple active tickets in the same checkout. Sequential execution is a property of one loop, not a ticket-management restriction. Users may run multiple loops or direct multiple agents to work on different tickets.
* A ticket remains `active` during implementation, review, repair, and stops awaiting a user decision. Stop reasons are recorded separately from lifecycle state.
* `loop` owns decision-stop reports and resumption, including the report information needed by `status`. Ticket management only keeps the ticket active; add no ticket pause/resume commands or special stop metadata to front matter.
* In the loop, close a ticket as `done` only after review passes.
* Retain v1 close reasons: `done`, `duplicate`, `deferred`, and `dismissed`.
* `close` accepts open or active tickets for `duplicate`, `deferred`, and `dismissed`, without requiring satisfied dependencies. Closing as `done` requires an active ticket with satisfied dependencies.
* A dependency is satisfied only by a ticket closed as `done`, or a ticket closed as `duplicate` whose duplicate chain resolves to `done`.
* Deferred or dismissed prerequisites keep dependent tickets blocked until their dependencies are explicitly adjusted.
* `ticket next` returns open tickets whose dependencies are satisfied, ordered by ascending numeric ticket ID. No priority field or manual queue ordering is needed.
* Retain optional `--limit=<number>` to cap the number of tickets returned by `ticket next`; without it, return all eligible tickets.
* Active tickets are excluded from `ticket next`; resuming active work belongs to `loop`.
* Change dependencies on existing open tickets by editing their ticket files directly. Retain `-d <ticket>` on `create`, `deactivate`, and `reopen`; do not add a dependency-editing command. `doctor` diagnoses invalid edits.
* On `deactivate` and `reopen`, `-d` adds dependencies while preserving existing ones. Omitting `-d` leaves dependencies unchanged; removing dependencies remains a direct file edit.
* Tool ownership of front matter defines normal workflow, not an editing restriction. Manual dependency edits remain allowed as an occasional exception and are not expected to be frequent.

## Risks and Caveats

* User-created tickets may omit recommended context or structure; an agent may then be unable to complete them without clarification.
* Allowing concurrent work does not by itself guarantee that multiple loops or agents can work together successfully in the same checkout.
