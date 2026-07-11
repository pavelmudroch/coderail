---
name: to-spec
description: Guide for turning current conversation, plan context, and codebase understanding into an implementation spec. Use when the user wants to create a spec for a complex feature, refactor, or change.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces an implementation spec. Do not interview the user by default. Synthesize what is already known. If important assumptions remain, record them clearly in the spec instead of blocking progress.

## Process

1. Explore the repo to understand the current state of the codebase, if you have not already.

Delegate codebase research to a worker agent and assign it the <skill>research</skill> skill when deeper repository understanding is needed.

2. Identify the major modules that need to be built or modified.

Look for opportunities to extract deep modules that can be tested in isolation.

A deep module, as opposed to a shallow module, encapsulates meaningful functionality behind a simple, stable, testable interface.

When expectations are unclear, document assumptions in the spec. Ask the user only if the missing information would materially change the design or implementation direction.

3. Write the implementation spec using the template below.

Write the spec to a local file by default. Use `.coderail/SPEC.md` unless the user names a different local path.

Publish externally only when the user explicitly requests it. Do not create issue-tracker items, apply labels, or perform other external actions unless the user explicitly requests that action.

<spec-template>

## Problem Statement

Describe the problem from the user’s perspective.

## Goal

Describe the intended outcome.

## Solution Overview

Describe the proposed solution from the user’s and implementer’s perspective.

## Requirements

List the concrete requirements the implementation must satisfy.

Use numbered items when order or traceability matters.

## Implementation Decisions

List implementation decisions that were made or inferred. This can include:

* Modules that will be built or modified
* Interfaces that will be introduced or changed
* Technical clarifications from the developer
* Architectural decisions
* Schema changes
* API contracts
* Command behavior
* State transitions
* Important interactions

Avoid specific file paths or code snippets unless they encode an important decision more precisely than prose can.

Exception: if a prototype produced a snippet that captures a decision clearly, such as a state machine, reducer, schema, or type shape, inline only the decision-rich part and note briefly that it came from a prototype.

## Testing Decisions

Describe how the work should be validated.

Include:

* What makes a good test for this change
* Which modules or behaviors should be tested
* Prior art for similar tests in the codebase
* Any validation commands or Coderail test-map expectations, if known

Prefer testing external behavior over implementation details.

## Out of Scope

List things that should explicitly not be solved by this spec.

## Assumptions

List assumptions made while creating the spec.

## Further Notes

Include any extra context useful for implementation.

</spec-template>
