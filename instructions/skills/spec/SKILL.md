---

name: spec
description: Convert an approved forged idea into an implementation-ready specification and optional ticket plan.
disable-model-invocation: true
------------------------------

Convert an approved `IDEA.md` into an implementation-ready `SPEC.md`.

## Context

Locate the relevant idea and inspect:

1. `IDEA.md`
2. Existing `SPEC.md`
3. Relevant parent or child ideas
4. Repository context needed for implementation decisions

Ensure the selected idea represents one implementation-ready scope. If independent child scopes remain, determine whether the specification covers the parent or one leaf.

Reuse decisions already established in `IDEA.md`. Infer safe implementation details and record consequential assumptions. Use <skill>question</skill> only when missing information could materially change scope, architecture, public behavior, or ticket boundaries.

Write `SPEC.md` next to `IDEA.md`.

## Process

### Inspect existing specification

When `SPEC.md` exists:

* complete it when unfinished
* update it when stale relative to the idea or repository
* preserve it when already ready

### Research the codebase

Inspect architecture, conventions, interfaces, tests, and relevant prior art as needed.

Delegate substantial repository research to a worker agent using <skill>research</skill>.

### Design implementation

Define implementation boundaries and consequential technical decisions.

Prefer deep modules that hide meaningful behavior behind small, stable, testable interfaces.

### Write specification

Use this structure:

<spec-template>

## Problem Statement

Describe the problem from the user's perspective.

## Goal

Describe the intended outcome.

## Solution Overview

Describe the solution from user and implementation perspectives.

## Requirements

Define concrete implementation requirements.

Use numbered requirements when useful for ordering or traceability.

## Implementation Decisions

Record consequential implementation decisions, including where relevant:

* modules and responsibilities
* interfaces and architecture
* schemas and data contracts
* command or API behavior
* state transitions and component interactions
* compatibility or migration behavior

Prefer durable decisions over file-level instructions. Include paths, types, schemas, or snippets only when they express a decision more precisely.

For prototype-derived decisions, preserve only the decision-relevant result and identify its origin.

## Testing Decisions

Define validation strategy, including:

* important behaviors and boundaries
* useful test characteristics
* relevant repository testing patterns
* expected validation commands
* applicable Coderail test-map behavior

Prefer observable behavior over implementation details.

## Out of Scope

List intentionally excluded adjacent work.

## Assumptions

Record inferred facts that affect implementation without requiring user decisions.

## Further Notes

Record additional implementation context.

## Ticket Plan

Record tickets created from this specification, if any.

</spec-template>

## Readiness

Treat the specification as ready when:

* scope matches one approved implementation-ready idea
* requirements and important behavior are defined
* implementation boundaries and interfaces are clear enough to implement
* testing expectations are actionable
* no unresolved uncertainty could materially change design, public behavior, scope, or ticket decomposition

Record reasonable low-impact assumptions instead of blocking progress.

Use <skill>question</skill> for remaining material uncertainty, then update `SPEC.md`.

## Tickets

When the specification becomes ready, ask the user whether to create implementation tickets.

When approved:

1. Read `prompt.md` from this skill directory.
2. Delegate its complete content together with the path to `SPEC.md` to a worker agent.
3. Record the resulting tickets in the `Ticket Plan` section of `SPEC.md`.
