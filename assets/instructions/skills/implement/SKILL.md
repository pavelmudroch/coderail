---
name: implement
description: Implement the next ready ticket.
disable-model-invocation: true
---

## Goal

Implement the specified or next ready ticket, validate changes, and close the completed ticket.

## Boundary

- Accept `<ticket>` as a numeric ID, title slug, ID + title slug, or ticket path.
- Follow ticket tasks in numbered order.
- Preserve unrelated changes.
- Mark tasks `[x]` only after satisfying their validation criteria.
- Leave incomplete tasks `[ ]`.
- Exclude the ticket file and files not changed by this implementation from validation.
- Never close an incomplete or failing ticket.

## Completion

1. Use the provided `<ticket>` or retrieve the next ready ticket with `cr ticket next -l 1`. Stop if none exists.
2. Activate the ticket with `cr ticket activate <ticket>`. Use the returned path for subsequent operations.
3. Read the activated ticket and its tasks.
4. Close the ticket with `cr ticket close --reason=duplicate --duplicate-of=<duplicate-ticket> <ticket>` and stop if another ticket already implements its scope.
5. Implement each task in numbered order. Validate its criteria before marking it `[x]`.
6. Validate changed project files with `cr test -s <changed-files...>` after completing all tasks.
7. Inspect each failed file with `cr test <failed-file>`. Fix failures and repeat step 6 until all changed files pass.
8. Close the ticket with `cr ticket close --reason=done <ticket>` only after completing every task and passing validation.
