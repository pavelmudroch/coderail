---
name: compass
description: Provides guidance for coderail workflow, answering questions and offering help.
disable-model-invocation: true
---
Help the user understand Coderail and choose a concrete next step.
Keep guidance concise, grounded in current implementation, and relevant to their goal.

## Understand the request

Answer specific questions directly. Inspect project state only when it affects the answer.

For starting or continuing work, establish:

- the desired outcome;
- relevant existing ideas or tickets;
- unresolved decisions or blockers.

Reuse available context. Use <skill>question</skill> when missing information
would materially change the recommendation.

## Establish current state

Inspect only what the question requires:

- Project instructions and relevant Coderail skills.
- Whether cr is available and the project has .coderail/.
- cr idea --json for idea paths, hierarchy, and statuses.
- Relevant IDEA.md, referenced artifacts, and ticket contents.
- Active tickets and cr ticket next for eligible open tickets.
- .coderail/coderail.conf when validation or setup matters.

Run project commands from the project root.

Check that plans and ticket directories exist before using inspection commands;
the current CLI creates missing directories. For guidance alone, inspect
existing files and report missing setup.

Prefer current implementation and command behavior over outdated examples
or planned specifications. Do not infer readiness or completion from file
existence alone.

## Explain the workflow

The usual progression is:

explore → ticket → implement

  <skill>explore</skill> resolves intent, scope, behavior, and significant design decisions in IDEA.md or an idea tree.
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
* New or unresolved idea - Recommend explore with the desired outcome or existing idea path.
* Idea is open - Identify unresolved decisions and recommend continuing explore.
* Idea is split - Inspect shared decisions and relevant children; recommend explore for unresolved work.
* Ready idea - Check existing tickets, then recommend ticket for uncovered work.
* Clear, bounded task without an idea - Recommend ticket directly when context is sufficient.
* Ticket is already active - Inspect remaining tasks and validation; recommend resuming it without activating it again.
* Open ticket has satisfied dependencies - Recommend implement with its ticket ID.
* No eligible tickets - Inspect active work, dependencies, and unfinished planning before concluding there is nothing to do.

Respect the user's chosen scope and priorities. Queue order alone does not
establish product priority.

Dependencies are satisfied by tickets closed as done, or duplicates whose
reference chain resolves to done. Dismissed tickets do not
satisfy dependencies.

## Setup and validation

cr init creates a configuration file with commented examples. Recommend configuring
verification rules in .coderail/coderail.conf before implementation validation.

Explain relevant commands:

- cr verify <paths...> validates selected files or directories.
- cr verify --changed selects staged, unstaged, and untracked files.
- cr verify --short <paths...> provides compact results.

No tests found means no mapped commands ran; it does not establish that
the changes passed validation.

## Current implementation boundaries

Implemented commands include init, install, uninstall, upgrade, idea, ticket, verify, and loop.

doctor and template management are currently placeholders despite appearing in
top-level help. Template initialization is also unfinished.

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
