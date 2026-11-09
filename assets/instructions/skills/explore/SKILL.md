---
name: explore
description: Collaboratively explore and design implementation-ready ideas
disable-model-invocation: true
---

# Explore

## Goal

Transform an initial goal into an implementation-ready idea or idea tree through iterative collaboration.

1. Identify the target idea or establish a new goal.
2. Discover available Coderail commands and conventions.
3. Inspect the current idea tree using `cr idea --json`. Load the target idea, relevant ancestors, and referenced artifacts as needed.
4. Assess current understanding and select the most valuable next activity.
5. Repeat the following activities as needed:
   - **Decompose:** Read [decomposition](references/decomposition.md). Identify independent concerns, propose boundaries and dependencies, and agree on consequential structural changes before applying them.
   - **Investigate:** Read [elicitation](references/elicitation.md). Identify unknowns, investigate independently, and resolve decisions requiring user judgment.
   - **Design:** Read [contracts](references/contracts.md). Propose solutions, compare trade-offs, demonstrate behavior with examples, and collaboratively define important contracts.
   - **Structure:** Read [structure](references/structure.md). Inspect existing code organization, propose consequential file and module boundaries, and collaboratively design public interfaces and function signatures.
   - **Evaluate:** Read [evaluation](references/evaluation.md). Assess completeness, consistency, risks, unresolved decisions, and verification expectations.
6. Persist evolving understanding in the affected ideas:
   - Intended outcomes and boundaries
   - Current understanding
   - Agreed decisions and constraints
   - Unresolved questions
   - Relevant artifact references
   - Verification expectations
7. Create and reference helper artifacts when dedicated representations improve clarity.
8. Reassess earlier decisions and decomposition as understanding evolves.
9. Continue exploration until the completion criteria are satisfied.

## Boundary

- Keep the user responsible for consequential product and design decisions.
- Drive investigation, propose solutions, recommend approaches, and maintain artifacts.
- Prefer the simplest sufficient solution.
- Explore behavior before defining concrete interfaces.
- Involve the user in important contracts and structural decisions.
- Resolve routine implementation details independently.
- Identify ambiguities, contradictions, dependencies, and risks proactively.
- Prioritize decisions affecting multiple ideas.
- Start new goals with a single idea; decompose only when justified.
- Avoid loading unrelated ideas or artifacts.
- Treat the persisted idea tree as the source of truth.
- Record current understanding instead of conversation transcripts.
- Keep shared decisions at the appropriate ancestor level.
- Avoid duplicating information or creating unnecessary artifacts.
- Preserve established Coderail idea formats and statuses.
- Never invent requirements or decisions on behalf of the user.
- Avoid requiring detailed internal implementation designs.
- Keep implementation ticket generation outside exploration.
- Reconstruct context from persisted ideas and artifacts on subsequent invocations.
- Leave context clearing and restarting to the user.
- Collaboratively review consequential file structure, module boundaries, and public functions before declaring readiness.
- Distinguish agreed architectural decisions from routine implementation freedom.
- Inspect existing code and conventions before proposing structural changes.

## Completion

1. Verify the following criteria for each ready idea:
   - Clarify the intended outcome and boundaries.
   - Resolve consequential decisions.
   - Define relevant behavioral contracts sufficiently.
   - Agree on consequential file structure, module boundaries, and public interfaces.
   - Establish verification expectations.
   - Leave only delegable implementation choices unresolved.
2. For split ideas, resolve shared decisions and verify readiness of all relevant children.
3. Persist the final idea tree and referenced artifacts.
4. Mark eligible ideas as ready using the appropriate Coderail commands.
5. Summarize the resulting design, important decisions, and remaining implementation freedom.
