---
name: spec
description: Convert an approved forged plan into an implementation specification and executable ticket plan.
disable-model-invocation: true
---
Produce an implementation-ready specification and its ticket plan from an approved `IDEA.md`.

## Context

Locate the relevant plan directory and inspect:

1. `IDEA.md`
2. `SPEC.md`, when already present
3. Related parent or child plans referenced by the idea
4. The repository, when codebase context affects the design

The selected idea should represent an implementation-ready scope. When it still contains independent child scopes, identify whether the spec applies to the whole plan or one of its leaves.

Reuse established decisions from `IDEA.md`. Infer reasonable implementation details and record consequential assumptions in the spec. Question the user only when missing information would materially change scope, architecture, public behavior, or ticket boundaries.

Write `SPEC.md` next to `IDEA.md`.

## Process

### 1. Inspect existing work

When `SPEC.md` exists, evaluate it using the [Readiness](#readiness) criteria:

* continue and complete an unfinished spec
* update a stale spec from the approved idea or repository state
* preserve a ready spec and proceed to ticket planning

### 2. Research the codebase

Explore the repository as needed to understand existing architecture, conventions, interfaces, tests, and relevant prior art.

Delegate substantial codebase research to a worker agent with <skill>research</skill> skill.

### 3. Design the implementation

Identify the major modules and behaviors that need to be introduced or modified.

Prefer deep modules that encapsulate meaningful behavior behind small, stable, testable interfaces.

Resolve or record:

* module responsibilities
* interfaces and contracts
* state transitions
* command or API behavior
* persistence and schema changes
* interactions with existing components
* compatibility and migration concerns
* testing boundaries

### 4. Write the specification

Use the following structure:

<spec-template>

## Problem Statement

Describe the problem from the user’s perspective.

## Goal

Describe the intended outcome.

## Solution Overview

Describe the solution from the user’s and implementer’s perspectives.

## Requirements

List the concrete requirements the implementation must satisfy.

Use numbered requirements when ordering or traceability is useful.

## Implementation Decisions

Record the implementation decisions made or inferred, including relevant:

* modules to build or modify
* interfaces to introduce or change
* architectural decisions
* schemas and data contracts
* command or API behavior
* state transitions
* important component interactions
* compatibility or migration behavior

Prefer durable decisions over file-level instructions. Include paths, types, schemas, or snippets only when they express a decision more precisely than prose.

When a prototype established a decision, include only its decision-rich portion and identify it as prototype-derived.

## Testing Decisions

Describe how the implementation will be validated, including:

* important behaviors and boundaries to test
* characteristics of useful tests
* relevant testing patterns already used by the repository
* expected validation commands
* applicable Coderail test-map behavior

Prefer observable behavior over implementation details.

## Out of Scope

List adjacent work intentionally excluded from this specification.

## Assumptions

Record inferred facts that affect implementation but do not require further user decisions.

## Further Notes

Include additional context useful during implementation.

## Ticket Plan

Record the tickets created from this specification.

</spec-template>

## Readiness

A specification is ready when:

* its scope corresponds to an approved implementation-ready idea
* requirements and important behaviors are defined
* implementation boundaries and interfaces are sufficiently clear
* testing expectations are actionable
* no unresolved uncertainty could materially change the design, public behavior, scope, or ticket decomposition

Reasonable low-impact assumptions may remain when they are explicitly recorded.

When material uncertainty remains, use `<skill>question</skill>` to collect the required decisions, then update `SPEC.md`.

## Ticket Plan

Once the specification is ready, delegate ticket creation to a worker agent with `<skill>ticket-plan</skill> @path-to-plan/SPEC.md` prompt.

After ticket creation, ensure the `Ticket Plan` section of `SPEC.md` records the resulting tickets.
