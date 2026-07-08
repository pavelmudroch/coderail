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

3. Split the ticket into clear, focused, small, actionable tasks with expected outcomes and validation criteria. Prefer independent, not file overlapping tasks.
Task is horizontal slice within a specific layer of the system of ticket.

Add tasks as checkbox numbered list under `## Tasks` section. Finished tasks is marked with `[x]` and unfinished tasks with `[ ]`.

```md
## Tasks

1. [ ] Task 1 title
2. [ ] Task 2 title
```

Tasks are ordered by priority, with the most important task first.

Add task details under `## Task details` section.

```md
## Task details

### 1. Task 1 title

some details about task 1
```

5. Optionally add any relevant links or references.

## Task Detail

- Include numbered order
- Include title
- Include brief description
- List of expected outcomes
- List of validation criteria

## Example

Use `examples/ticket.md` for a sample ticket structure.
