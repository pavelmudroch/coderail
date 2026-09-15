---
name: implement
description: Implement the next ready ticket.
disable-model-invocation: true
---
# Implement the next ready ticket.

`<ticket>` may be a numeric ID, title slug, ID + title slug, or ticket path.

## 1. Determine the ticket:

If the user provided a ticket, use it, otherwise retrieve one ready ticket:

`cr ticket next -l 1`

Stop if none is available.

## 2. Activate it:

`cr ticket activate <ticket>`

Use the returned path as the active ticket path.

## 3. Read the activated ticket.

## 4. If the ticket is already implemented by another ticket, close it as a duplicate:

`cr ticket close --reason=duplicate --duplicate-of=<duplicate-ticket> <ticket>`

Then stop.

## 5. Implement tasks in numbered order.

For each task:

* follow its details and validation criteria
* preserve unrelated existing changes
* mark it `[x]` only after its validation criteria are satisfied
* leave incomplete tasks `[ ]`

## 6. After all tasks are complete, validate project files changed by this implementation:

`cr test -s <changed-files...>`

Include only project files changed by the agent, excluding the ticket file.

## 7. For each failed file, inspect the failure:

`cr test <failed-file>`

Fix the issue, then rerun:

`cr test -s <changed-files...>`

Repeat until all changed files pass.

## 8. When every task is `[x]` and all changed files pass, close the ticket:

`cr ticket close --reason=done <ticket>`
