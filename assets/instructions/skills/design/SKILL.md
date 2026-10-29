---
name: design
description: Collaboratively design implementation architecture, source structure, and public interfaces from a given context.
disable-model-invocation: true
---

## Goal

Collaborate with the user to transform the given context into a concrete, implementation-ready design.

Work iteratively with the user to reason about implementation approaches, evaluate trade-offs, and establish consequential design decisions.

Design directly in the repository where appropriate, creating or modifying source files to establish:

- module boundaries and responsibilities
- source file and directory structure
- public interfaces, function signatures, and data contracts
- types, schemas, and component interactions
- important invariants and error handling contracts
- implementation skeletons where useful

Prefer deep modules that hide meaningful complexity behind small, stable, testable interfaces.

Inspect existing architecture, conventions, implementations, and tests to ensure the design fits the codebase. Delegate substantial repository research to a worker agent using <skill>research</skill> when appropriate.

Reuse established decisions from the provided context. Evaluate alternatives when consequential decisions remain unresolved, and involve the user in selecting the approach.

Preserve relevant design decisions in source code, or in additional artifacts when they cannot be adequately expressed through code alone.

The resulting design should provide a concrete foundation for subsequent ticket decomposition and implementation.

## Boundary

- Accept any provided context, including ideas, requirements, existing source code, problems, or user instructions. Do not require an `IDEA.md` or other specific artifact.
- Keep the user involved in consequential decisions about architecture, public interfaces, module boundaries, and observable behavior.
- Use <skill>question</skill> when user input is needed to resolve consequential uncertainty. Present meaningful alternatives and their trade-offs rather than making arbitrary decisions.
- Infer low-impact implementation details when consistent with the established design and repository conventions.
- May create or modify source files to establish the agreed structure, contracts, and implementation skeletons.
- May create or update supporting design artifacts when useful. Do not require a fixed artifact name, location, or format.
- May use focused experiments or throwaway prototypes to validate uncertain design decisions. Preserve only relevant results in the final design.
- Do not implement complete feature behavior beyond what is necessary to establish or validate the design.
- Do not create tickets or perform ticket decomposition.
- Do not expand the design beyond the agreed scope without user involvement.
- Preserve existing behavior and compatibility unless the user explicitly agrees to changes.

## Completion

Success:

- The design addresses the agreed scope and requirements.
- Consequential architectural and implementation decisions have been established with the user.
- Module responsibilities and boundaries are defined.
- Public interfaces, contracts, and relevant data structures are concretely expressed.
- Source structure and implementation skeletons are established where appropriate.
- Important behavior, invariants, and error handling expectations are understood.
- Relevant testing and validation expectations are identified.
- The design is sufficiently concrete to be decomposed into implementation tickets without requiring further consequential design decisions.
- The user has approved the resulting design.

Stop and return control when:

- A consequential decision requires user input.
- Essential context is unavailable.
- Proceeding would violate an established boundary.
- The user chooses to suspend or end the design process.

Do not create tickets or begin full implementation upon completion.