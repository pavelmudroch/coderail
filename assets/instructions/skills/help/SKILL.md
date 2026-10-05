---
name: help
description: Provides guidance for coderail workflow, answering questions and offering help.
disable-model-invocation: true
---
Help the user understand Coderail and choose a concrete next step.
Keep guidance concise, grounded in current implementation, and relevant to their goal.

## Understand the request

Answer specific questions directly. Inspect project state only when it affects the answer.

For starting or continuing work, establish:

- the desired outcome;
- relevant existing ideas, specifications, or tickets;
- unresolved decisions or blockers.

Reuse available context. Use <skill>question</skill> when missing information
would materially change the recommendation.

## Establish current state

Inspect only what the question requires:

- Project instructions and relevant Coderail skills.
- Whether cr is available and the project has .coderail/.
- cr idea map --json for idea paths, hierarchy, and statuses.
- Relevant IDEA.md, SPEC.md, and ticket contents.
- Active tickets and cr ticket next for eligible open tickets.
- .coderail/test_map and configuration when validation or setup matters.

Run project commands from the project root.

Check that plans and ticket directories exist before using inspection commands;
the current CLI creates missing directories. For guidance alone, inspect
existing files and report missing setup.

Prefer current implementation and command behavior over outdated examples
or planned specifications. Do not infer readiness or completion from file
existence alone.

## Explain the workflow

The usual progression is:

forge → spec → ticket → implement

  <skill>forge</skill> resolves intent, scope, and significant decisions in IDEA.md.
  <skill>spec</skill> turns an approved ready idea into SPEC.md.
  <skill>ticket</skill> creates small, actionable implementation tickets.
  <skill>implement</skill> implements an eligible ticket, validates it, and closes it.

These are agent skills invoked through the user's harness.
They are not equivalent cr subcommands.

The CLI manages project setup, idea and ticket state, and configured validation.
Agents maintain document bodies; use the CLI for creation and state transitions.

Keep the user involved in decisions and review. The full progression is not
mandatory for every change: clear, bounded work can start with a standalone ticket.

## Recommend the next step

Current situation and suggested Guidance
* CLI unavailable - Explain installation using the available installation documentation, then verify cr --version.
* Project not initialized - Recommend cr init from the project root.
* New or unresolved idea - Recommend forge with the desired outcome or existing idea path.
* Idea is forging - Identify unresolved decisions and recommend continuing forge.
* Idea is split - Select a relevant child; do not specify the split parent.
* Ready idea needs a specification - Recommend spec with its IDEA.md path.
* Specification is incomplete or stale - Recommend completing or updating it through spec.
* Specification is ready - Check existing tickets, then recommend ticket for uncovered work.
* Clear, bounded task without a specification - Recommend ticket directly when context is sufficient.
* Ticket is already active - Inspect remaining tasks and validation; recommend resuming it without activating it again.
* Open ticket has satisfied dependencies - Recommend implement with its ticket ID.
* No eligible tickets - Inspect active work, dependencies, and unfinished planning before concluding there is nothing to do.

Respect the user's chosen scope and priorities. Queue order alone does not
establish product priority.

Dependencies are satisfied by tickets closed as done, or duplicates whose
reference chain resolves to done. Deferred or dismissed tickets do not
satisfy dependencies.

## Setup and validation

cr init creates a comment-only test map. Recommend configuring
.coderail/test_map before implementation validation.

Explain relevant commands:

- cr test <paths...> validates selected files or directories.
- cr test --changed selects staged, unstaged, and untracked files.
- cr test --short <paths...> provides compact results.

No tests found means no mapped commands ran; it does not establish that
the changes passed validation.

## Current implementation boundaries

Implemented command groups: init, upgrade, idea, ticket, and test.

install, uninstall, doctor, status, and loop are currently placeholders
despite appearing in top-level help. Template initialization is also unfinished.

Do not recommend unavailable commands or legacy syntax. Verify support against
the available implementation when these capabilities change.

## Respond

Lead with the answer or recommended next action. Include:

- the relevant observed state;
- why that action fits;
- the skill and context to provide, or exact CLI command;
- the expected result.

Prefer one recommended next step. Include alternatives only when they represent
meaningfully different choices.

A guidance request does not authorize creating artifacts, changing statuses,
or starting implementation. When the user also requests execution, follow
the relevant skill within that authorized scope.

Two existing issues surfaced: forge (instructions/skills/forge/SKILL.md:148) says regorge instead of reforge; ticket (instructions/skills/ticket/
SKILL.md:61) includes obsolete requires and deactivate examples. Neither was changed.