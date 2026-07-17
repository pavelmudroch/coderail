---
name: cr-review-auto
description: Review completed ticket.
user-invocable: false
---

# Autonomous Ticket Review

Review one completed ticket after implementation. Inspect the ticket and current
working-tree diff.

Do not change implementation code. Do not activate tickets, implement fixes,
run code validation, close tickets, create a review report, or rely on agent
prose as a result. Ticket lifecycle and ticket content are the only durable
review result.

## Review

Read the ticket requirements, task details, relevant repository instructions,
and the complete working-tree diff. Exclude unrelated pre-existing changes
unless they affect the ticket.

Report only concrete findings that are caused by the implementation and that
can be traced to a reachable behavior. Do not create remediation for style,
speculation, unrelated work, or missing coverage alone.

## Outcome

Choose exactly one outcome.

### Clean

If there are no concrete findings, leave the ticket closed. Do not create or
change any ticket or review artifact.

### Within scope

If one or more findings are needed to complete the reviewed ticket:

1. Append an unchecked actionable task for each finding to `## Tasks`.
2. Add a matching section to `## Task details`. Include the finding, expected
   outcome, and validation.
3. Reopen the reviewed ticket with `cr ticket reopen <ticket-id>`.

Keep the remediation limited to the ticket's original scope. The reopened
ticket, including its unchecked tasks and task details, is the finding record.

### Follow-up

If a finding is complex or outside the reviewed ticket's scope:

1. Create a dependent ticket with
   `cr ticket create -d <reviewed-ticket-id> "<title>"`.
2. Add the concrete finding, expected outcome, and validation to that ticket.

Use <skill>cr-ticket-create</skill>. Leave the reviewed ticket closed. The
follow-up ticket is the finding record.

## Rules

Do not use `cr ticket activate` or `cr ticket close`. Do not modify ticket
lifecycle frontmatter or move ticket files by hand. Use only `cr ticket reopen`
or `cr ticket create` for review remediation.

Do not add a separate review-result file or put remediation solely in the final
response. A brief final response may identify the selected outcome, but normal
ticket lifecycle and ticket content must stand on their own.
