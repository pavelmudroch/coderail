---
name: forge
description: Forge an idea through discussion until ready for one specification or split into child ideas.
disable-model-invocation: true
---

Forge a project, problem, task, or existing idea by resolving intent, scope, constraints, and significant decisions before specification or implementation.
Use <skill>question</skill> to relentlessly interrogate user answers whenever unresolved choices could materially affect product, workflow, API, architecture, scope, or decomposition. Continue until shared understanding is reached.
Defer safe implementation details to specification.

## Idea model

Own `IDEA.md`. Let `cr` manage front matter and status.

Statuses:

* `forging` — unresolved or discussing
* `ready` — resolved for one specification
* `split` — resolved into child ideas

Treat `cr idea map --json` as authoritative for paths, hierarchy, files, and status.

"Inspect current idea map" means read it and use it as source of truth.

## IDEA.md

Maintain `IDEA.md` as consolidated current understanding, not conversation history.

Use sections as needed:

**Desired Outcome** — observable result or capability.

**Understanding** — agreed context, behavior, scope, actors, boundaries, and non-goals.

**Constraints** — rules the solution must obey.

**Decisions** — meaningful choices and useful rationale.

**Assumptions** — accepted but unguaranteed premises.

**Risks and Caveats** — limitations, tradeoffs, or feasibility concerns affecting scope or decomposition. Leave implementation risks for `SPEC.md`.

**Open Questions** — unresolved matters blocking completion. Remove resolved questions and merge answers into relevant sections.

**Decomposition** — child ideas and boundaries.

Update `IDEA.md` after meaningful progress so forging can resume without conversation history.

## Forge new idea

Inspect current idea map when project context may affect placement.

Create idea:

```sh
cr idea create "<idea-title>"
```

Establish Desired Outcome and initial Understanding. Forge the idea.

## Continue forging

Inspect current idea map.

Read the idea's `IDEA.md` and relevant map context.

Resolve desired outcome, scope, behavior, constraints, assumptions, tradeoffs, and significant uncertainties.

Consider an idea resolved when `SPEC.md` can be written without choosing between materially different interpretations or decisions.

Test:

> Could `SPEC.md` be written now without choosing between materially different interpretations?

If not, keep status `forging`, update `IDEA.md`, and preserve unresolved matters under Open Questions.

When resolved, present a concise synthesis covering:

* desired outcome;
* scope and behavior;
* important constraints and decisions;
* assumptions;
* relevant risks and caveats;
* remaining uncertainty.

Apply corrections until user confirms shared understanding. Then classify as `ready` or `split`.

## Ready idea

Use `ready` when the idea:

* has one cohesive primary outcome;
* can be evaluated as one capability;
* requires no independently forged product or API decisions;
* fits one specification, even if it later produces many tickets.

Consolidate `IDEA.md`. Remove Open Questions.

Mark ready:

```sh
cr idea ready <idea-path>
```

Report that the idea is forged and ready for `SPEC.md`. Include its path.

## Split idea

Use `split` when the idea contains independently forgeable concerns, such as:

* independently valuable outcomes;
* separate public APIs or workflows;
* distinct constraints, behavior, or failure modes;
* independently viable parts;
* scope requiring multiple related specifications.

Before splitting:

1. Explain why one specification is unsuitable.
2. Propose at least two child titles, boundaries, and Desired Outcomes.
3. Refine decomposition until user confirms it.

Split:

```sh
cr idea split <idea-path> "<child-title>" "<child-title>" [<child-title>...]
```

Each child starts as `forging`.

Keep shared context, decisions, constraints, assumptions, and risks in parent.

Initialize each child with Desired Outcome, boundary, and relevant inherited context. Leave child-specific unresolved details for its forge session.

Update parent Decomposition with child paths and boundaries.

Do not create `SPEC.md` for a split parent.

Report that parent is forged. List child paths.

## Reforge ready idea

Inspect current idea map and existing `IDEA.md`.

Reopen:

```sh
cr idea regorge <idea-path>
```

Treat existing `IDEA.md` as agreed baseline. Preserve valid context. Change only what new discussion affects.

Resume normal forging.

A reforged idea may become `ready`, `split`, or remain `forging`.

## Scope

Establish:

* what to build;
* why it matters;
* boundaries;
* decisions required before specification.

Produce one of:

* updated `forging` idea;
* `ready` idea eligible for `SPEC.md`;
* `split` idea with at least two child ideas.
