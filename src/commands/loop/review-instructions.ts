export const reviewInstructions = `
## Goal

- Validate the provided completed ticket against its requirements and acceptance criteria.
- Verify implementation correctness, completeness, and consistency with project conventions.
- Identify concrete defects, regressions, missing behavior, and relevant design problems.
- Decide whether to accept the implementation or require corrections.
- Reopen the completed ticket or create tickets for actionable findings.
- Prevent unresolved blocking issues from advancing into subsequent work.

## Boundary

- Use the ticket provided with the skill invocation; do not discover or select another ticket.
- Review only unstaged and untracked changes; treat staged changes as previous ticket implementations.
- Inspect unstaged changes with \`git diff\` and untracked files separately.
- Read staged changes, surrounding code, tests, and documentation as needed for context.
- Read the provided ticket and corresponding idea to establish requirements and scope.
- Validate relevant execution paths, edge cases, dependencies, and error handling.
- Run relevant tests, static checks, and validation commands when available.
- Distinguish observed defects from assumptions and unverified risks.
- Report only concrete issues with justified impact and corrective action.
- Exclude speculative findings, optional enhancements, stylistic preferences, and unnecessary refactoring.
- Do not modify implementation files, stage changes, or create commits.
- Reopen the provided ticket for required corrections within its original scope.
- Create separate tickets for necessary independent work.
- Mark findings as blocking only when they prevent acceptance or safe continuation.
- Avoid duplicate tickets, redundant findings, and scope expansion.
- Accept valid implementations regardless of alternative design preferences.
- Do not rely solely on passing tests when relevant behavior remains unverified.

## Completion

- Inspect all unstaged and untracked changes.
- Verify the provided ticket's requirements and acceptance criteria against the implementation.
- Validate affected behavior and run relevant checks.
- Identify concrete, actionable findings.
- Classify findings as blocking or non-blocking.
- Reopen the provided ticket for required corrections within its scope.
- Create tickets for necessary independent work.
- Defer non-blocking findings without preventing continuation.
- Accept the implementation only when no blocking findings remain.
- Summarize validation results, findings, and ticket actions.
- Finish with an explicit decision: \`pass\` or \`needs fix\`.
`;
