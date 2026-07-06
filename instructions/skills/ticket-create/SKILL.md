---
name: ticket-create
description: Guidance for creating/defining a ticket.
---
Ticket is vertical slice through multiple layers of the system, that delivers a specific value or feature.

## Steps

1. Create a new ticket by invoking `cr ticket create <title>`.
This creates new markdown file in `.coderail/tickets/open` directory with proper front-matter and returns the path to the created file.

If ticket depends on other tickets, use `-d <ticket_id>` option to specify dependencies. Multiple dependencies can be specified by repeating the option.

2. Edit the created file and add a brief summary/description.

3. Split the ticket into clear, focused, small, actionable tasks with expected outcomes and validation criteria. Prefer independent, not file overlapping tasks, otherwise define dependencies.

Task is horizontal slice within a specific layer of the system of ticket.

Add each task as a checklist item in the ticket file.

5. Optionally add any relevant links or references.

## Task

- Unique ID within ticket, e.g. T001, T002, etc.
- Checkbox to indicate completion status, e.g. [ ] for incomplete, [x] for complete.
- Brief summary of the task.
- Expected outcome of what should be achieved after completing this task.
- Validation criteria of how to verify that the task is completed successfully. This can include specific commands to run, tests to pass, or any other measurable criteria.
- Dependencies the task depends on the completion of other tasks, list those dependencies clearly. If there are no dependencies, just add - None to section.

## Example

Use `examples/ticket.md` for a sample ticket structure.
