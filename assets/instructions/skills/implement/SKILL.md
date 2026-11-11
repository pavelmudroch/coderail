---
name: implement
description: Implement the next ready ticket.
disable-model-invocation: true
---

## Goal

Implement the specified or next ready ticket, resolve encountered issues autonomously, verify changes, and close the completed ticket.

## Boundary

- Accept `<ticket>` as a numeric ID, filename, or ticket path.
- Follow ticket tasks in numbered order.
- Preserve unrelated changes.
- When invoked by `cr loop`, preserve the existing index: do not stage, unstage, reset, or commit. The loop owns staging after successful completion.
- Mark tasks `[x]` only after satisfying their validation criteria.
- Leave incomplete tasks `[ ]`.
- Exclude the ticket file and files not changed by this implementation from verification.
- Never close an incomplete or failing ticket.
- Continue autonomously through routine problems, failures, and recoverable blockers.
- Investigate and attempt safe solutions before reporting a blocker.
- Do not ask for confirmation when the next action is within the ticket scope and can be performed safely.
- Stop only when progress requires missing user decisions, unsafe changes, or actions outside the ticket scope.

## Completion

1. Use the provided `<ticket>` or retrieve the next ready ticket with `cr ticket next -l 1`. Stop if none exists.
2. Activate the ticket with `cr ticket activate <ticket>`. Use the returned path for subsequent operations.
3. Read the activated ticket and its tasks.
4. Close the ticket with `cr ticket close --reason=duplicate --duplicate-of=<duplicate-ticket> <ticket>` and stop if another ticket already implements its scope.
5. Implement each task in numbered order. Resolve encountered issues, validate its criteria, and mark it `[x]`.
6. Run `cr verify -s <changed-files...>` after completing all tasks.
7. Inspect reported failures with `cr verify <failed-file>`, fix their causes, and repeat step 6 until verification succeeds or a genuine blocker remains.
8. Before stopping for a blocker, investigate its cause, evaluate available solutions, and attempt safe solutions within the ticket scope.
9. Stop and report unresolved issues without closing the ticket only when no safe solution can be completed autonomously.
10. Close the ticket with `cr ticket close --reason=done <ticket>` only after completing every task and passing verification.