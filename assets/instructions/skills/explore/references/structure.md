# Structure

## Goal

Collaboratively design consequential code organization, module boundaries, and public interfaces before implementation.

1. Inspect existing project structure, relevant modules, and established conventions.
2. Identify responsibilities, ownership, dependencies, and expected changes.
3. Propose a concrete file and module structure reflecting those responsibilities.
4. Distinguish existing files, proposed files, and files requiring modification.
5. Identify public interfaces and functions exposed across module boundaries.
6. Demonstrate their intended usage through concrete examples.
7. Define consequential function signatures, parameters, return values, errors, and ownership.
8. Evaluate cohesion, coupling, dependency direction, compatibility, and consistency with existing conventions.
9. Present the proposed structure and public interfaces to the user for review.
10. Refine the design collaboratively and persist agreed decisions.

## Boundary

- Consult the user on consequential file structure, module boundaries, and public interfaces.
- Treat exported functions and interfaces consumed by other modules as public design surfaces.
- Prefer extending existing modules and conventions over introducing unnecessary abstractions.
- Design concrete structures rather than describing architecture only abstractly.
- Use directory trees, signatures, and usage examples where they improve understanding.
- Distinguish architecturally significant files from routine supporting files.
- Define public interfaces sufficiently to constrain implementation without prescribing internals.
- Keep private helpers, algorithms, and incidental file organization delegable.
- Avoid designing classes, layers, or abstractions without demonstrated need.
- Never treat an unreviewed architectural proposal as an agreed decision.
- Revisit structural decisions when new requirements reveal incompatible responsibilities.

## Completion

1. Confirm clear ownership of consequential responsibilities.
2. Verify that proposed module and file boundaries are coherent.
3. Review consequential file structure and public interfaces with the user.
4. Validate public signatures and usage examples against agreed behavior.
5. Check compatibility with existing code and related ideas.
6. Persist accepted structure, interfaces, and constraints in the owning idea or referenced artifacts.
7. Leave only routine structural and implementation decisions unresolved.