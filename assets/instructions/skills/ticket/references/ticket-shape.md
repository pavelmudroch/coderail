Follow this structure when populating ticket files.

```markdown
---
id: 0003
slug: implement-ticket-dependency-append-logic
title: Implement Ticket Dependency Append Logic
status: open
created_at: 2024-06-01T12:00:00Z
updated_at: 2024-06-01T12:00:00Z
dependencies:
  - "0001"
  - "0002"
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
