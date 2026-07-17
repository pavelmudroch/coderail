---
id: 0001
slug: implement-ticket-dependency-append-logic
title: Implement Ticket Dependency Append Logic
status: open
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies:
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

Support repeated `--depends-on` values and append them without duplicating existing dependencies.

Expected outcome:

- Dependencies are resolved before mutation.
- Missing dependencies fail the command.
- Self-dependency is rejected.
- Existing dependency entries are preserved.

Validation:

- `cr ticket deactivate 0007 --depends-on 0012` adds dependency `0012`.
- Repeating an existing dependency does not duplicate it.

## References

- [Link to relevant documentation](https://example.com/docs)
- Related ticket: 0002-another-ticket
- [related-file](../SKILL.md)
