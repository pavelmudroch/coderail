---
name: research
description: Delegate focused research to a subagent and return concise, evidence-backed findings without polluting the main context.
---

## Goal

Delegate context-intensive research to a subagent. Investigate code, dependencies, documentation, standards, APIs, external sources, or alternative approaches.

## Boundary

- Delegate only research with a clear question and scope.
- Provide the research question, relevant context, constraints, and inspection scope.
- Keep raw findings, search output, and exploration within the subagent context.
- Avoid implementation, file modifications, and unrelated investigation.
- Preserve references needed to verify findings.

## Completion

- Return a concise summary of relevant findings.
- Include important paths, symbols, commands, URLs, and supporting evidence.
- Identify material uncertainties, conflicting evidence, and missing information.
- Distinguish verified findings from assumptions.
- Incorporate only the summary into the main context.