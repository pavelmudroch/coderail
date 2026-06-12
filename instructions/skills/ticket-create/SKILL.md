---
name: ticket-create
description: Guidance for creating/defining a ticket.
---
Ticket is vertical slice through multiple layers of the system, that delivers a specific value or feature.

## Steps

1. Create a new ticket by invoking `./tools/ticket.sh create <title>`.
This creates new markdown file in `tickets/open` directory with proper front-matter and returns the path to the created file.

2. Edit the created file and add a brief summary/description.

3. Split the ticket into clear, focused, small, actionable tasks with expected outcomes and validation criteria. Prefer independent, not file overlapping tasks, otherwise define dependencies.

Task is horizontal slice within a specific layer of the system of ticket.

Add each task as a checklist item in the ticket file.

5. Optionally add any relevant links or references.

## Task

- Unique ID, e.g. T001, T002, etc.
- Brief summary of the task.
- Expected outcome: What should be achieved after completing this task.
- Validation criteria: How to verify that the task is completed successfully. This can include specific commands to run, tests to pass, or any other measurable criteria.
- Dependencies: If the task depends on the completion of other tasks, list those dependencies clearly. Add `## Dependencies` section and list dependent ticket names. If there are no dependencies, just add - None to section.

## Example

Use `examples/ticket.md` for a sample ticket structure.
