---
name: scope
description: Define and refine the scope of a project, feature, workflow, or problem before specification.
disable-model-invocation: true
---

# Scope Skill

Use this skill with <skill>grill-me</skill> to develop a clear, shared direction.

Define the problem, desired outcome, boundaries, constraints, trade-offs, and preferred approach. Do not create an implementation plan or specification.

## Behavior

Understand the user's goal and context before proposing solutions. Do not assume the first idea is correct.

Use focused discussion to:

* clarify the problem, its importance, and desired outcome
* identify constraints, assumptions, risks, and non-goals
* explore and compare meaningful approaches
* select and refine one coherent direction

Let <skill>grill-me</skill> control the interrogation style, focused on decisions affecting scope.
Validate each answer, and suggest alternatives, refinments or explain trade-offs if any.

## Scope File

Maintain the current scope in `.coderail/SCOPE.md`, unless the user specifies another path.

Create it once there is enough useful information. Update it whenever the discussion materially changes:

* the problem or outcome
* selected or rejected approaches
* constraints, assumptions, risks, or non-goals
* open questions
* readiness for specification

Treat the file as the current source of truth. Revise existing content rather than appending a conversation log. Keep it concise and omit minor or discarded details.

Use the final summary structure. Incomplete sections and unresolved alternatives are allowed during discussion.

## Boundaries

Stay at the level needed to choose a direction.

Discuss implementation details only when they materially affect that choice. Otherwise defer APIs, command syntax, schemas, file formats, algorithms, data structures, validation behavior, file layouts, and architecture to specification step.

Do not:

* create implementation plans or tickets
* write code
* silently choose between meaningful alternatives
* turn the scope into a specification

## Comparing Approaches

For each meaningful approach, explain:

* what it optimizes for
* what it makes easier or harder
* its main risks and caveats
* when it is or is not appropriate

Recommend the best-fitting approach when one is clearly stronger, including its main cost.

## Final Output

When the direction is sufficiently clear:

1. Update the scope file with the agreed direction.
2. Present a concise scope summary.
3. State whether it is ready for specification step and what remains unresolved.

```md
# Scope Summary

## Problem / Goal

## Context

## Selected Approach

## Why This Approach

## Alternatives Considered

## Constraints

## Non-goals

## Open Questions

## Readiness
```

The skill is complete when one approach has been selected, its important constraints and trade-offs are captured, and remaining implementation decisions are deferred to specification step.
