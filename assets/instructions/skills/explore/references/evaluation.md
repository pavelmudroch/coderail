# Evaluation

## Goal

- Detect design gaps, contradictions, and risks.
- Establish readiness for autonomous ticket generation without further consequential design decisions.

## Boundary

- Evaluate after consequential decisions, apparent exploration completion, or suspected inconsistencies.
- Perform focused checks during exploration; conduct comprehensive checks before marking ready.
- Verify requirements against agreed decisions, proposed behavior, and constraints.
- Check parent, child, and sibling ideas for conflicting contracts, missing ownership, and inconsistent assumptions.
- Validate important scenarios, failure cases, and interface expectations.
- Identify unresolved decisions, risks, scope creep, and unverifiable outcomes.
- Distinguish consequential blockers from accepted risks and delegable implementation choices.
- Recommend the smallest corrective exploration for each blocker.
- Avoid exhaustive implementation planning or ticket generation.

## Completion

- Resolve all consequential blockers before declaring readiness.
- Record accepted risks and nonblocking uncertainties.
- Confirm clear outcomes, coherent boundaries, sufficient contracts, and verifiable expectations.
- Mark a leaf ready only when ticket generation requires no further consequential user decisions.
- Consider a split parent complete only when shared decisions are resolved and all relevant children are ready.
- Delegate routine implementation choices to ticket generation.
