Read the provided `SPEC.md`. Identify implementation units and decompose the specification into small local tickets.

## Ticket model

Create tickets as vertical slices that deliver a specific feature or value across required system layers.

Within each ticket, create tasks as focused horizontal slices within a specific layer.

Prefer:

* small, actionable tickets
* independent tasks with minimal file overlap
* test tasks before implementation tasks
* explicit dependencies between tickets

## Create tickets

For each implementation unit:

1. Create the ticket:

   `cr ticket create <title>`

   Add `--requires <ticket_id>` for dependencies. Repeat the option for multiple dependencies.

2. Edit the created ticket file returned by `cr`.

3. Add a brief description of the ticket's purpose.

4. Add numbered checkbox tasks under `## Tasks`:

   `1. [ ] Task description`

   Use `[x]` only for completed tasks.

5. Add details for each task under `## Task details`, including:

   * implementation scope
   * expected outcome
   * validation criteria

Add relevant files, documentation, specifications, or related tickets under `## References`.

Do not manually create ticket files or front matter. Let `cr ticket create` manage them.

## Ticket shape

```markdown
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

Implement dependency append behavior for ticket transitions without duplicating existing dependencies.

## Tasks

1. [ ] Add shared transition helper
2. [ ] Add dependency append logic

## Task details

### 1. Add shared transition helper

Implement shared logic for moving a ticket back to `open/`.

Expected outcome:

- Move tickets from valid source states to `open/`.
- Set status to `open`.
- Refresh `updated_at`.
- Print the new relative path to stdout.

Validation:

- Unit tests cover `closed -> open`.
- Unit tests cover `active -> open`.
- Invalid source status fails before mutation.

### 2. Add dependency append logic

Support repeated `--requires` values without duplicating existing dependencies.

Expected outcome:

- Resolve dependencies before mutation.
- Reject missing dependencies.
- Reject self-dependency.
- Preserve existing dependencies.

Validation:

- `cr ticket deactivate 0007 --requires 0012` adds dependency `0012`.
- Repeating an existing dependency does not duplicate it.

## References

- [Relevant documentation](https://example.com/docs)
- Related ticket: `0002-another-ticket`
- [Related file](../SKILL.md)
```
