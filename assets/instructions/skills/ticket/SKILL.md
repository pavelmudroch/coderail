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
- Place test tasks before implementation tasks.

## Boundary

- Follow [ticket shape](references/ticket-shape.md).
- Create tickets using `cr ticket create <title>`.
- Declare dependencies using repeated `-d <ticket-id>` options.
- Edit only ticket files returned by `cr ticket create`.
- Preserve CLI-generated front matter.

## Completion

For each implementation unit:

1. Create a ticket and declare its dependencies.
2. Describe its purpose briefly.
3. Add numbered checkbox tasks under `## Tasks`.
4. Specify implementation scope, expected outcome, and validation criteria for each task under `## Task details`.
5. Reference relevant files, documentation, specifications, and related tickets under `## References`.
6. Verify that every task is independently actionable and has verifiable outcomes.