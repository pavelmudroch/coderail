---
name: ticket
description: Decompose implementation context into actionable tickets and tasks.
disable-model-invocation: true
---

## Goal

Decompose available implementation context into small, actionable tickets.

- Define tickets as vertical slices delivering specific features or value across required system layers.
- Define tasks as focused horizontal slices scoped to individual layers, components, or concerns.
- Keep tickets small and actionable.
- Minimize task dependencies and file overlap.
- Declare explicit dependencies between tickets.
- Include test tasks where they provide meaningful behavioral validation, and place them before the corresponding implementation tasks. Do not manufacture runtime-test tasks for type-only changes; define independently verifiable tasks using type correctness and configured verification instead.

## Boundary

- Follow [ticket shape](references/ticket-shape.md).
- Create tickets using `cr ticket --json create <title>`.
- Declare dependencies using repeated `-d <ticket-id>` options.
- Edit only ticket files returned by `cr ticket --json create`.
- Preserve CLI-generated front matter.
- Context is idea without status 'ready' then report failure.

## Completion

For each implementation unit:

1. Create a ticket and declare its dependencies.
2. Describe its purpose briefly.
3. Add numbered checkbox tasks under `## Tasks`.
4. Specify implementation scope, expected outcome, and validation criteria for each task under `## Task details`.
5. Reference relevant files, documentation, specifications, and related tickets under `## References`.
6. Verify that every task is independently actionable and has verifiable outcomes.
7. Create or update TICKETS.md with ticket references, next to corresponding IDEA.md if applicable and mark idea archived `cr idea archive <idea-path>`.
