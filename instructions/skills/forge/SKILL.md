---
name: forge
description: Forge an idea through discussion until it is ready for one specification or resolved into child ideas.
disable-model-invocation: true
--------------------

Forge one idea selected by the user. The user provides the project, problem, task, or existing idea to discuss.

The goal is shared understanding before specification or implementation.

## Plan map

Run:

```sh
cr idea map --json
```

Use its output as the authoritative source for idea paths, files, hierarchy, titles, and statuses.

Ideas are stored under:

```text
.coderail/plans/<idea-path>/IDEA.md
```

A ready leaf may later receive a colocated specification:

```text
.coderail/plans/<idea-path>/SPEC.md
```

## Create an idea

For a new root idea, choose a concise descriptive title and run:

```sh
cr idea create "<idea-title>"
```

For a child idea:

```sh
cr idea create --parent <parent-idea-path> "<idea-title>"
```

Use the printed `IDEA.md` path as the idea file. The command owns directory creation, slug generation, and initial front matter.

## Status

An idea has one status:

* `forging`: unresolved or still being discussed
* `ready`: resolved and suitable for one specification
* `split`: resolved at its level and decomposed into child ideas

Normal transitions:

```text
forging → ready
forging → split
```

Reopening completed ideas is outside the current workflow.

## Idea file

Maintain `IDEA.md` as a consolidated record of current understanding rather than conversation history.

Use relevant sections from:

```md
---
status: forging
---

# Idea title

## Desired Outcome

## Understanding

## Constraints

## Decisions

## Assumptions

## Risks and Caveats

## Open Questions
```

A split parent also uses:

```md
## Decomposition
```

### Section meaning

**Desired Outcome** describes the observable result or capability.

**Understanding** captures agreed context, behavior, scope, actors, boundaries, and non-goals.

**Constraints** records rules the solution must obey.

**Decisions** records meaningful choices, with brief rationale when useful later.

**Assumptions** records accepted premises the idea relies on but does not guarantee. Resolve material uncertainty before completion by confirming it or moving it into Decisions, Constraints, or Open Questions.

**Risks and Caveats** records limitations, feasibility concerns, and tradeoffs that affect scope, behavior, or decomposition. Implementation-level risks belong in `SPEC.md` unless they materially shape the idea.

**Open Questions** contains unresolved matters that block completion. Remove resolved questions and merge their answers into the appropriate sections.

**Decomposition** lists child ideas and their boundaries.

Update `IDEA.md` after meaningful progress so another forge session can resume without prior conversation context.

## Forging

Read `IDEA.md` and relevant map context before continuing an existing idea.

Discuss the idea until its desired outcome, scope, important behavior, constraints, assumptions, tradeoffs, and significant uncertainties are resolved.

Use <skill>question</skill> to ask focused questions where different answers would materially change the product, workflow, API, architecture, scope, or decomposition. Leave safe implementation details for the specification.

An idea is resolved when its specification can be written without inventing a materially different interpretation or design decision.

Use this test:

> Could the specification be written now without choosing between materially different interpretations?

When the user stops earlier, keep status `forging` and preserve the current understanding and remaining questions.

## Confirmation

When the idea appears resolved, present a concise synthesis covering:

* desired outcome;
* agreed scope and behavior;
* important constraints and decisions;
* accepted assumptions;
* relevant risks and caveats;
* remaining uncertainty, if any.

Apply corrections until the user confirms the shared understanding. Then classify the idea.

## Ready

Set status to `ready` when the idea:

* has one primary cohesive outcome;
* can be evaluated as one coherent capability;
* does not require independently forged product or API decisions;
* fits one specification, even if that specification later produces many tickets.

Consolidate the final `IDEA.md` and remove Open Questions.

Tell the user the idea is forged and ready for `SPEC.md`, including its idea path. Specification is a later, separate step.

## Split

Use `split` when the idea contains multiple independently forgeable concerns, such as:

* independently valuable outcomes;
* separate public APIs or workflows;
* distinct constraints, behavior, or failure modes;
* parts that could reasonably exist independently;
* content that would require several related specifications.

Before creating children:

1. Explain why one specification is unsuitable.
2. Propose at least two child titles, boundaries, and desired outcomes.
3. Refine the decomposition with the user until confirmed.

Create each child with:

```sh
cr idea create --parent <parent-idea-path> "<child-title>"
```

Each child starts as `forging` in its own directory:

```text
.coderail/plans/<parent-path>/<child-path>/IDEA.md
```

Preserve shared context, decisions, constraints, assumptions, and risks in the parent. Add relevant inherited context to each child while leaving its unresolved details for its own forge session.

Add a Decomposition section to the parent with child paths and concise boundaries. After all children are created and the parent is updated, set the parent status to `split`.

A split parent represents shared context and decomposition and does not produce its own `SPEC.md`.

Tell the user the parent is forged and list the child paths. Each child can then be forged separately.

## Validation

Run:

```sh
cr idea validate
```

after creating a decomposition, when structure or status appears inconsistent, or before reporting malformed idea state.

Report validation problems clearly and retain valid created artifacts.

## Scope

Forge establishes what should be built, why it matters, its boundaries, and the decisions required before specification.

Its output is:

* a `ready` idea whose directory may later receive `SPEC.md`;
* a `split` idea with at least two child ideas;
* an updated `forging` idea when discussion stops before resolution.
