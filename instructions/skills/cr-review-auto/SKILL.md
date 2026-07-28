---
name: cr-review-auto
description: Verify that a completed ticket satisfies its existing requirements.
user-invocable: false
---

Review one completed ticket after implementation. Treat this as an acceptance
review of the ticket's existing contract.

Read the ticket requirements, task details, validation instructions, relevant
repository instructions, and the working-tree diff related to the ticket.

## Review scope

Evaluate the implementation against:

1. Explicit ticket requirements.
2. Ticket task details and validation steps.
3. Documented repository invariants directly affected by the implementation.
4. The repository's documented supported usage.

Use the documented operating model as the complete review context. Assume
normal sequential usage when the ticket and repository documentation define no
other execution model.

Create a finding only when:

1. The implementation causes a concrete violation of the existing contract.
2. The violation is reproducible within supported usage.
3. The expected behavior follows directly from an existing requirement.
4. The remediation stays within the ticket's original scope.

Group related symptoms under one root-cause finding.

## Outcome

Choose exactly one outcome.

### Clean

When the implementation satisfies the existing contract, leave the ticket
closed and preserve the current ticket content.

### Reopen

When an eligible finding prevents the ticket from satisfying its existing
contract:

1. Append one unchecked actionable task per independent root cause to
   `## Tasks`.
2. Add matching `## Task details` containing:
   - the violated requirement;
   - a concrete reproduction;
   - the expected outcome;
   - validation for the fix.
3. Reopen the ticket with `cr ticket reopen <ticket-id>`.

Keep every remediation task within the original ticket contract.

### Follow-up

If a finding is complex or outside the reviewed ticket's scope:

1. Create a dependent ticket with
   `cr ticket create -d <reviewed-ticket-id> "<title>"`.
2. Add the concrete finding, expected outcome, and validation to that ticket.

Use <skill>cr-ticket-create</skill>. Leave the reviewed ticket closed. The
follow-up ticket is the finding record.

## Repeated review

When the ticket already contains auto-review tasks:

1. Verify the original ticket requirements.
2. Verify the existing review tasks and their validation.
3. Reopen the ticket when an existing requirement or review validation still
   fails.
4. Preserve the existing review-task set.

## Broader observations

Record architecture, hardening, operating-model, or design observations through
the project's discovery process, attributed to the reviewed ticket.