# Contracts

## Goal

Design consequential behavior and interfaces collaboratively once use cases and responsibilities are sufficiently understood.

1. Identify consumers, use cases, and expected behavior.
2. Describe representative scenarios, including normal, boundary, and failure cases.
3. Demonstrate intended usage through consumer-first examples before defining interfaces.
4. Derive relevant contracts from scenarios and usage examples:
   - APIs and CLI commands
   - Data formats and schemas
   - State transitions and invariants
   - Integration boundaries
   - Inputs, outputs, and errors
5. Evaluate compatibility with existing consumers, interfaces, and constraints.
6. Explore architectural alternatives when they affect observable behavior, extensibility, or consequential trade-offs.
7. Recommend the simplest sufficient design and refine it with the user.
8. Validate proposed contracts against scenarios and agreed requirements.

## Boundary

- Design only what consumers need to understand and depend upon.
- Establish behavior and responsibilities before committing to interfaces.
- Prefer concrete examples over speculative abstractions.
- Define contracts only to the level necessary for implementation.
- Specify error handling, invariants, and compatibility guarantees where consequential.
- Preserve existing contracts unless changes are justified.
- Compare alternatives only when meaningful trade-offs exist.
- Seek user agreement on public and architecturally consequential decisions.
- Leave private helpers, algorithms, incidental file organization, and routine implementation choices unspecified.
- Coordinate interface design with structural exploration so public contracts have clear module ownership.
- Reconsider earlier decisions when new scenarios expose gaps or contradictions.
- Avoid creating artifacts or contracts without a concrete need.

## Completion

1. Verify that representative scenarios demonstrate the intended behavior.
2. Confirm that consequential interfaces, constraints, and compatibility decisions are resolved.
3. Check consistency with agreed goals, scenarios, and ancestor constraints.
4. Capture accepted contracts and examples in the owning idea or referenced artifacts.
5. Record unresolved decisions explicitly.
6. Stop once implementation can proceed without inventing consequential contract decisions.
