---
name: research
description: Gather information, analyze data, and synthesize insights for specific topics or questions.
---
Delegate research that would consume main-agent context, such as:

* searching or tracing code
* locating definitions, usages, dependencies, related implementations
* researching docs, standards, APIs, or web sources
* comparing approaches or options

Give the subagent:

* research question
* relevant context and constraints
* scope to inspect

Ask it to investigate independently and return only a concise summary with:

* relevant findings
* important paths, symbols, commands, URLs, or other evidence
* material uncertainties, conflicts, or missing information

Use the summary as the research result in main context.

Keep raw search output, exploration, and irrelevant details in subagent context.
