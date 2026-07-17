---
name: cr-research
description: Research strategy guidelines.
---

Write the final research output to `.coderail/RESEARCH.md` unless instructed otherwise.

Only the coordinating agent writes the final output file. Subagents return their reports to the coordinating agent.

Prefer the simplest strategy sufficient for the task.

## Research Directly

Use when:

* the question is narrow;
* the research area is small;
* the work is tightly connected or mostly sequential;
* delegation overhead would approach the research cost.

Apply <skill>cr-research-task</skill> directly.

## Research with One Subagent

Use when:

* the task is bounded but context-heavy;
* isolated context is useful;
* the task benefits from a focused or specialist investigation.

Assign the exact scope and relevant context to one subagent.

Require the subagent to apply <skill>cr-research-task</skill> and return a structured report. The subagent must not write the final research file or spawn additional agents.

Verify important findings and produce the final research output.

## Research with Multiple Subagents

Use when:

* the research is large or complex;
* it can be divided into genuinely independent areas;
* parallel investigation provides meaningful benefit.

Divide the task into narrow, non-overlapping scopes. Give each subagent:

* its exact question;
* relevant context;
* known constraints;
* the required output format.

Require each subagent to apply <skill>cr-research-task</skill>. Subagents must not expand their scope, write the final research file, or spawn additional agents.

After gathering their reports:

1. Verify that each subagent stayed within scope.
2. Validate important or uncertain claims.
3. Resolve or report conflicting conclusions.
4. Remove duplicate findings.
5. Identify meaningful gaps.
6. Produce one coherent synthesis rather than concatenating reports.

The coordinating agent owns the final conclusions.
