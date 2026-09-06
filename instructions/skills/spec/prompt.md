Understand the context of provided `SPEC.md` file and identify key implementation units that need to be implemented. Break down SPEC into smaller, manageable local tickets.

## Ticket Creation

Ticket is vertical slice through multiple layers of the system, that delivers a specific value or feature.

### Steps

1. Create a new ticket by invoking `cr ticket create <title>`.
This creates new markdown file in `.coderail/tickets/open` directory with proper front-matter and returns the path to the created file.

If ticket depends on other tickets, use `-requires <ticket_id>` option to specify dependencies. Multiple dependencies can be specified by repeating the option.

2. Edit the created file and add a brief summary/description.

3. Split the ticket into clear, focused, small, actionable tasks with expected outcomes and validation criteria. Prefer independent, not file overlapping tasks.
Task is horizontal slice within a specific layer of the system of ticket.
Prefer test tasks before implementation tasks.

Add tasks as checkbox numbered list under `## Tasks` section. Finished tasks is marked with `[x]` and unfinished tasks with `[ ]`.

<ticket-template>
---
id: 0003
slug: implement-ticket-dependency-append-logic
title: Implement Ticket Dependency Append Logic
status: open
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
requires: 0001, 0002
---

# Implement Ticket Dependency Append Logic

This ticket focuses on enhancing the ticket management system by implementing logic to append dependencies without duplication.

## Tasks

1. [x] Add shared transition helper
2. [ ] Add dependency append logic

## Task details

### 1. Add shared transition helper

Implement shared logic for moving a ticket back to `open/`.

Expected outcome:

- Ticket can be moved from a validated source state to `open/`.
- Status is set to `open`.
- `updated_at` is refreshed.
- New relative path is printed to stdout.

Validation:

- Unit tests cover moving `closed -> open`.
- Unit tests cover moving `active -> open`.
- Invalid source status is rejected before mutation.

### 2. Add dependency append logic

Support repeated `--requires` values and append them without duplicating existing dependencies.

Expected outcome:

- Dependencies are resolved before mutation.
- Missing dependencies fail the command.
- Self-dependency is rejected.
- Existing dependency entries are preserved.

Validation:

- `cr ticket deactivate 0007 --requires 0012` adds requirenment for `0012`.
- Repeating an existing dependency does not duplicate it.

## References

- [Link to relevant documentation](https://example.com/docs)
- Related ticket: 0002-another-ticket
- [related-file](../SKILL.md)

</ticket-template>