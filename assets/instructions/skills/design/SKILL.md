---
name: design
description: Collaboratively establish implementation architecture, source structure, and public interfaces from any context.
disable-model-invocation: true
---

## Goal

Collaborate with the user to transform the given context into a concrete, implementation-ready design.

Explore implementation approaches, evaluate trade-offs, and establish consequential design decisions with the user.

Prefer deep modules that hide complexity behind small, stable, testable interfaces.

Inspect relevant architecture, conventions, code, and tests. Delegate substantial repository research using <skill>research</skill> when appropriate.

Reuse established decisions, explore unresolved alternatives, and respect the agreed scope.

**Treat source code as the primary design artifact when applicable. Express the design through module structure, interfaces, declarations, types, schemas, and function signatures rather than internal implementation logic.**

Produce a concrete foundation for subsequent ticket decomposition and implementation.

## Boundary

### Context

- Accept any context, including ideas, requirements, existing code, problems, or instructions.
- Require no specific input artifacts, such as `IDEA.md` or `SPEC.md`.
- Respect established scope, requirements, and decisions.
- Involve the user before expanding the agreed scope.
- Preserve existing behavior and compatibility unless explicitly agreed otherwise.

### Collaboration

Choose between interactive and delegated design based on the task and available capabilities. Switch approaches when beneficial.

**Interactive design:**

- Discuss consequential decisions about architecture, module boundaries, interfaces, contracts, and observable behavior with the user.
- Present meaningful alternatives and trade-offs.
- Use <skill>question</skill> when missing information could materially affect decisions.
- Resolve low-impact details autonomously using established decisions and repository conventions.
- Treat agreed decisions as approved without requiring redundant final approval.
- Review any new consequential decisions introduced while assembling the design with the user.

**Delegated design:**

- Delegate bounded research, analysis, experiments, or design work to worker agents when appropriate.
- Provide workers with sufficient context, constraints, and established decisions.
- Require workers to record proposals, alternatives, trade-offs, assumptions, and unresolved questions in an artifact.
- Review delegated results before adopting consequential decisions.
- Resolve consequential questions with the user and relay answers to workers when necessary.
- Prevent workers from independently finalizing decisions requiring user agreement.
- Keep user interaction through the main agent unless the harness supports direct worker interaction.

Pause for required user input and resume the design process once available.

### Source code and artifacts

- Prefer creating or modifying module structure, interfaces, declarations, types, schemas, exports, and function signatures.
- Create minimal implementation skeletons only to establish responsibilities, dependencies, and integration boundaries.
- Focus persistent source changes on structure and contracts, not internal behavior.
- Avoid incomplete behavior in existing execution paths and unnecessary build or test failures.
- Create supporting artifacts when code alone cannot adequately express decisions, rationale, or requirements.
- Reuse existing artifacts instead of introducing redundant ones.
- Record consequential decisions and rationale not evident from source code.
- Avoid duplicating information already expressed in code.

### Design and implementation boundary

- Implement focused functionality only when necessary to discover, validate, or express consequential design decisions.
- Use disposable prototypes or experiments to evaluate uncertain approaches.
- Stop experimental implementation once the uncertainty is resolved.
- Preserve validated interfaces, structural decisions, and relevant findings; discard unnecessary experimental code.
- Leave internal business logic and complete feature behavior for subsequent implementation.
- Avoid turning design into an unplanned implementation session.
- Do not create tickets or decompose the design into implementation tasks.

## Completion

Complete the design only after:

- Addressing the agreed scope and requirements.
- Establishing consequential decisions with the user.
- Defining module responsibilities, boundaries, interfaces, contracts, and relevant data structures.
- Establishing source structure, declarations, and skeletons where appropriate.
- Clarifying important behavior, state transitions, interactions, invariants, and error handling.
- Identifying relevant testing and validation expectations.
- Preserving consequential decisions and rationale not evident from code.
- Resolving uncertainties that could materially change architecture, public behavior, interfaces, or ticket decomposition.
- Ensuring sufficient detail for ticket decomposition without further consequential design decisions.

Infer reasonable low-impact details rather than blocking completion. Do not require complete behavioral implementation.

Pause for user input when consequential decisions require it, and resume once available.

Stop and return control when:

- Consequential uncertainty cannot be resolved.
- Essential context remains unavailable.
- Proceeding would violate an established boundary.
- The user suspends or ends the process.

On successful completion, summarize the design, relevant source files and artifacts, agreed decisions, and remaining low-impact assumptions.

Do not require redundant final approval, create tickets, or begin full implementation.
