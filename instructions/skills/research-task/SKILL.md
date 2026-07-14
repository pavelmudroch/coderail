---
name: research-task
description: Investigate a defined research question and return an evidence-based report.
---

Research only the assigned scope.

Do not spawn subagents, modify implementation, or write the coordinating agent's final research file.

## Process

1. Define the exact question, constraints, and expected output.
2. Resolve minor ambiguities from available context. State material assumptions.
3. Identify the most relevant sources or repository locations.
4. Gather evidence, preferring primary and authoritative sources.
5. Cross-check important claims where practical.
6. Distinguish confirmed facts, inferences, and unresolved uncertainty.
7. Return a concise structured report.

## Report

<summary-template>

```md
Assigned scope:
- Exact question investigated

Findings:
- Finding:
  - Evidence:
  - Confidence: high | medium | low

Contradictions or uncertainty:
- Conflicting evidence
- Missing information
- Assumptions

Relevant sources or locations:
- Source, file, section, symbol, or URL reference

Unresolved questions:
- Questions requiring additional research
```

</summary-template>

## Rules

* Do not extend the assigned scope.
* Support every material finding with a source or repository location.
* Do not present inference as established fact.
* Report relevant disagreement or missing evidence.
* Prefer a small number of useful findings over unsupported speculation.
* Return research material, not a polished final answer for the user.
