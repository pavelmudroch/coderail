---
title: Coderail v2.0
status: split
---

## Desired Outcome

Define a coherent Coderail v2.0 command workflow and boundaries before splitting the work into independently forgeable child ideas.

## Understanding

* `idea` is working. Core `init` is almost done; optional template functionality needs further forging.
* Commands to forge: `init` templates, `install`, `uninstall`, `doctor`, `ticket`, `test`, `loop`, and `status`.
* Shared command boundaries and the eight-child decomposition are confirmed. Child ideas continue command-specific forging.
* Current CLI help describes installation for agent harnesses, state inspection and repair, ticket management, test execution, ticket implementation loops, and working-directory status.
* The README describes v1. The main v2 improvement is idea-tree forging, alongside command adjustments.
* How the v1 `work` command fits into v2 remains unresolved.
* If retained, `work` is an optional Git helper, potentially creating branches for commit separation. Its exact helpers remain undecided.

## Decisions

* `install` and `uninstall` manage user-level harness instructions and skills, as in v1. Project-local harness installation is out of scope.
* `init` prepares the project. Repository-level Coderail files consist of tickets, specifications, ideas, and helper files.
* `init` supports no template, one template, or multiple templates. User-prepared templates provide project directory structures and base configuration files, optionally with startup scripts such as dependency installation. Examples include Deno, Bun, and Zig project setups.
* `status` provides a read-only, user-facing summary of what has been done and what can be done next in the current repository, including ideas needing further forging and specifications awaiting implementation.
* `doctor` performs deep diagnosis of problems and repairs them where possible or explains how the user can repair them. Repair invocation and authority remain to be forged.
* `test` retains v1's role: a simple mapping from selected files, directories, or Git changes to commands defined by the user. It runs those commands and reports results.
* `cr loop` replaces v1 `cr ticket loop` and should behave similarly, subject to the changes below. Other v1 details are not yet confirmed.
* Planning and execution remain independent: the user chooses which ideas become tickets and when. One implementation effort is not restricted to one ready idea.
* `ticket` manages the queue and dependencies, potentially spanning multiple ideas. `loop` processes eligible open tickets in the current checkout, without selecting or interpreting ideas.
* Other commands do not require `work`.
* Tickets derived from a specification link to it in their body. Agents can consult that specification and, if needed, its idea, without making loop scheduling depend on ideas. Users can also create standalone tickets without a specification.
* Tickets should be self-contained enough for implementation without consulting the originating specification or idea during ordinary work.
* The loop selects the first non-blocked ticket, implements it, and reviews the result. Failed review leads to repair and another review of the same ticket; passing review allows selection of the next ticket.
* The loop stops when all tickets are done or the ticket limit is reached.
* A material decision stops the loop and produces a report for the user.
* The loop periodically checks specification drift: implementation may reveal problems unknown when the idea or specification was created. Check cadence remains unresolved.
* Drift reconciliation may automatically correct specifications and tickets when corrections preserve agreed behavior and scope. Changes to requirements, public behavior, or significant design decisions stop the loop and produce a report. Agents must not rewrite specifications merely to justify their implementation.

## Constraints

* This phase establishes product behavior and boundaries; implementation and specifications come later.
* Keep shared decisions in this parent; forge and specify command-specific behavior in children. Do not create a specification for this split parent.

## Risks and Caveats

* V1 details beyond explicitly adopted behavior remain subject to child forging.
* Ticket lifecycle and provenance must support loop execution and status reporting; coordinate these contracts across the relevant children.
* Inclusion of `work` remains undecided. Its child explores that decision without making other capabilities depend on it.
* Repair authority, loop bounds and drift cadence, and status derivation remain child-specific questions.
* Template composition, file conflicts, and startup-script failure behavior remain questions for the initialization child.

## Decomposition

Confirmed and split. Separate specifications allow each command's public behavior and failure handling to be forged independently. Installation and uninstallation share one managed-file lifecycle. All children start in `forging`.

* [Harness installation and removal](harness-installation-and-removal/IDEA.md) — `install` and `uninstall`; manage user-level Coderail harness files.
* [Project initialization and templates](project-initialization-and-templates/IDEA.md) — `init`; extend existing project initialization with optional user-prepared structures, configuration files, and startup scripts, supporting zero, one, or multiple templates.
* [Diagnosis and repair](diagnosis-and-repair/IDEA.md) — `doctor`; find problems, repair where possible, and provide actionable repair guidance.
* [Ticket management](ticket-management/IDEA.md) — `ticket`; manage self-contained tickets, source-spec references, dependencies, and lifecycle independently of idea selection.
* [Repository validation](repository-validation/IDEA.md) — `test`; execute user-defined command mappings and report results.
* [Implementation loop](implementation-loop/IDEA.md) — `loop`; coordinate ticket selection, implementation, review and repair, drift reconciliation, stopping, and reports. Consume ticket lifecycle rules established by ticket management.
* [Repository status and next steps](repository-status-and-next-steps/IDEA.md) — `status`; summarize completed and available work from repository state without changing it.
* [Optional Git work helpers](optional-git-work-helpers/IDEA.md) — determine whether and how `work` belongs in v2, without making other commands depend on it.
