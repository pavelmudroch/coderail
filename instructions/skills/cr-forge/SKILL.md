---
name: cr-forge
description: "Guidance on how to forge an idea into specification."
disable-model-invocation: true
---
Use this skill to collaboratively forge a rough idea into a clear, coherent, and defensible direction.

The purpose is alignment, not documentation ceremony. Question assumptions, expose caveats, compare alternatives, and refine the idea until it is ready to be converted into an implementation specification.

Maintain the result in `.coderail/IDEA.md`.

Do not research the codebase, write an implementation specification, create tickets, produce an implementation plan, or write code.

## Core Behavior

Begin by understanding what the user is trying to achieve, why it matters, and what outcome they actually need.

Do not accept the first description, proposed solution, or answer uncritically.

For every material answer or decision:

1. Determine what assumptions it depends on.
2. Identify caveats, contradictions, risks, and unintended consequences.
3. Consider whether a simpler or stronger alternative exists.
4. Explain meaningful trade-offs.
5. Challenge the answer when clarification or reconsideration could improve the direction.
6. Record the resulting decision in `.coderail/IDEA.md`.

Be persistent. Continue questioning while unresolved decisions could materially affect:

* the problem being solved
* the desired outcome
* the boundaries of the idea
* user-visible behavior
* constraints or compatibility expectations
* the selected approach
* important risks or trade-offs
* whether the idea is valuable or necessary

Do not ask questions merely to appear thorough. Each question must help validate, reject, narrow, or improve the idea.

## Discussion Style

Interview user relentlessly about every aspect of this plan until shared understanding is reached.

Ask questions one at a time, wait for feedback before continuing. Provide recommended answer and brief context of the question for clarity.

After each answer:

* confirm what was understood
* test the answer against previously established decisions
* point out relevant caveats or conflicts
* suggest better alternatives when available
* explain the cost of the recommended direction
* ask the next highest-value question

Do not silently agree with the user when their answer introduces inconsistency, unnecessary complexity, hidden risk, or conflict with an earlier decision.

Do not treat disagreement as an obstacle. Explain the concern clearly, then allow the user to accept the risk or choose another direction.

The user owns the final product decision. The skill is responsible for ensuring that decision is informed.

## Exploring the Idea

Develop a shared understanding of:

* the problem
* who experiences it
* why it is worth solving
* the desired outcome
* how success would be recognized
* the boundaries of the solution
* constraints and assumptions
* important user-visible behavior
* risks and failure modes
* meaningful alternative approaches
* the preferred approach and its trade-offs
* explicit non-goals
* unresolved questions

Separate the underlying problem from the user’s initially proposed solution.

When appropriate, ask whether the problem could be solved:

* more simply
* with less new behavior
* by changing an existing workflow
* without adding a new abstraction
* by removing a constraint
* by accepting a smaller outcome
* through a different approach entirely

Avoid premature implementation detail. Discuss technical behavior only when it materially affects the feasibility, boundaries, or selection of an approach.

Defer repository structure, concrete APIs, schemas, algorithms, file layouts, architecture, test design, and implementation sequencing to the specification stage.

## Comparing Approaches

When multiple meaningful approaches exist, compare them explicitly.

For each approach, describe:

* what it optimizes for
* what it makes easier
* what it makes harder
* its main assumptions
* its risks and caveats
* its long-term consequences
* when it is or is not appropriate

Recommend the best-fitting approach when the evidence favors one.

Do not present weak or artificial alternatives merely to create the appearance of choice.

Record rejected approaches only when the reason for rejecting them may matter later.

## Idea File

Maintain the current idea in `.coderail/IDEA.md`, unless the user specifies another path.

Create the file once enough useful information exists to describe the problem and intended outcome.

Treat it as the canonical current understanding of the idea.

Update it whenever discussion materially changes:

* the problem or motivation
* the desired outcome
* the selected approach
* requirements at the product-behavior level
* constraints or assumptions
* risks or trade-offs
* non-goals
* rejected alternatives
* unresolved questions
* readiness for specification

Revise existing sections instead of appending a chronological conversation log.

Preserve decisions and their important rationale. Remove obsolete conclusions, resolved questions, and discarded details that no longer affect the idea.

The file may remain incomplete while forging is in progress.

## Idea File Structure

```md
# Idea
## Problem
## Motivation
## Desired Outcome
## Context
## Selected Direction
## Why This Direction
## Alternatives Considered
## Expected Behavior
## Constraints
## Risks and Caveats
## Assumptions
## Non-goals
## Open Questions
## Readiness
```

Omit sections that have no useful content yet, except `Open Questions` and `Readiness`, which should reflect the current state throughout the discussion.

## Readiness for Specification

An idea is ready for specification when:

* the underlying problem is understood
* the desired outcome is concrete
* one coherent direction has been selected
* major alternatives and trade-offs have been considered
* important boundaries and non-goals are explicit
* known constraints, assumptions, and risks are recorded
* no unresolved product decision is likely to materially change the implementation direction

Readiness does not make the idea immutable.

The user may invoke this skill again at any time, including after the idea has been marked ready.

On every invocation:

1. Read the existing `.coderail/IDEA.md` when present.
2. Treat it as the current working position, not as unquestionable truth.
3. Ask what prompted the idea to be revisited when that is not already clear.
4. Challenge new information against existing decisions.
5. Reopen resolved sections when assumptions or priorities have changed.
6. Update the file to reflect the new current direction.
7. Change readiness back to not ready when new unresolved decisions materially affect the idea.

## Completion

A forge session may end when:

* the user chooses to stop
* no further high-value questions remain
* the idea is ready for specification
* progress is blocked by a decision the user cannot currently make

Before ending:

1. Update `.coderail/IDEA.md`.
2. Summarize what changed during the session.
3. Identify accepted trade-offs and risks.
4. List remaining open questions.
5. State whether the idea is ready for specification.
