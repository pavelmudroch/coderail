# Decomposition

## Goal

- Identify broad problems, distinct responsibilities, or independently explorable concerns.
- Split ideas into cohesive children when separate exploration adds value.
- Preserve the parent's intended outcome and shared constraints.

## Boundary

- Start with one idea; split only when separate exploration provides meaningful value.
- Choose boundaries by outcomes or responsibilities, not files, classes, phases, or implementation tickets.
- Keep each child focused on a distinct concern with clear ownership.
- Prefer children that can be explored and designed independently.
- Identify dependencies between children and resolve shared decisions at their nearest common ancestor.
- Avoid overlapping responsibilities, speculative branches, and unnecessary depth.
- Propose boundaries, dependencies, and a recommended structure before splitting.
- Confirm consequential splits, merges, or reorganizations with the user.
- Reconsider boundaries when new understanding reveals overlap, excessive coupling, or missing concerns.
- Preserve a single idea when decomposition adds coordination overhead without sufficient benefit.

## Completion

- Decide whether to retain the current idea or split it.
- Define each child's intended outcome, scope, and relationship to its parent when splitting.
- Verify collective coverage without unnecessary overlap or gaps.
- Identify cross-child dependencies and ownership of shared constraints.
- Persist agreed structure and constraints in the affected ideas.
- Resume exploration of the most consequential unresolved concern.
