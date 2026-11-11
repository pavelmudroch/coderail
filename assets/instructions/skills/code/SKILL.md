---
name: code
description: Apply to source code implementation, modification, refactoring, debugging, testing, and review.
---

## Goal

Deliver the minimum complete working solution satisfying the request.

- Match existing conventions for style, naming, structure, APIs, and tests.
- Prefer explicitness over convenience.
- Keep communication concise.

## Boundary

- State assumptions that materially affect the solution. Ask before proceeding when material uncertainty remains.
- Present materially different interpretations instead of choosing silently.
- Propose simpler alternatives and challenge unnecessary complexity.
- Change only what is requested or necessary to support it.
- Avoid abstractions and structure for one-off use unless they materially improve clarity.
- Preserve existing work, including dirty worktrees and unknown changes. Treat unknown changes as user-owned.
- Explain necessary modifications and their reasons.
- Remove imports, variables, functions, types, and other code made unused or obsolete by your changes.
- Preserve pre-existing unused or obsolete code unless its removal is requested or necessary.
- Report unrelated issues without modifying them.
- Add meaningful behavioral tests, including value independence where relevant. Do not test type declarations or empty runtime exports.
- Do not introduce production behavior solely to satisfy coverage or mutation testing.
- Preserve useful tests, fix relevant failures, and never weaken coverage thresholds to conceal failures.
- Follow configured verification rules and file dependencies. Run applicable lint and format checks even without tests; require paired source/test files only for checks that depend on them.

