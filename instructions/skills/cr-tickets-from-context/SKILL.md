---
name: cr-tickets-from-context
description: Create implementation tickets from the available spec, plan, or conversation.
disable-model-invocation: true
---
Choose context from available spec (usually `.coderail/SPEC.md`), plan, or conversation. Use multiple sources if needed to understand the implementation requirements.

Understand the context and identify the key implementation units that need to be implemented. Create local tickets by default. Break down the SPEC into smaller, manageable local tickets. Use <skill>cr-ticket-create</skill> skill when defining each ticket.

Do not publish tickets, create issue-tracker items, apply labels, or perform other external actions unless the user explicitly requests that action.
