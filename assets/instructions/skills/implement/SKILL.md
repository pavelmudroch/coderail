---
name: implement
description: Implement the next ready ticket.
disable-model-invocation: true
---

## Goal

Implement the specified or next ready ticket, verify changes, and close the completed ticket.

## Boundary

- Accept `<ticket>` as a numeric ID, title slug, ID + title slug, or ticket path.
- Follow ticket tasks in numbered order.
- Preserve unrelated changes.
- Mark tasks `[x]` only after satisfying their validation criteria.
- Leave incomplete tasks `[ ]`.
- Exclude the ticket file and files not changed by this implementation from verification.
- Never close an incomplete or failing ticket.
- Stop verification retries when an issue cannot be resolved safely.

## Completion

1. Use the provided `<ticket>` or retrieve the next ready ticket with `cr ticket next -l 1`. Stop if none exists.
2. Activate the ticket with `cr ticket activate <ticket>`. Use the returned path for subsequent operations.
3. Read the activated ticket and its tasks.
4. Close the ticket with `cr ticket close --reason=duplicate --duplicate-of=<duplicate-ticket> <ticket>` and stop if another ticket already implements its scope.
5. Implement each task in numbered order. Validate its criteria before marking it `[x]`.
6. Run `cr verify -s <changed-files...>` after completing all tasks.
7. Inspect reported failures with `cr verify <failed-file>`, fix their causes, and repeat step 6 until verification succeeds or an unfixable issue is identified.
8. Stop and report unresolved issues without closing the ticket if verification cannot succeed.
9. Close the ticket with `cr ticket close --reason=done <ticket>` only after completing every task and passing verification.